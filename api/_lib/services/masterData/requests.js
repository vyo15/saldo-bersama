import crypto from "node:crypto";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, canonicalJson, nowIso, parseJson, publicRow, sanitizeText, uuid } from "../core.js";
import { createAccount, prepareAccountCreatePayload } from "./accounts.js";
import { createCategory, prepareCategoryCreatePayload } from "./categories.js";

const REQUEST_TYPES = new Set(["account", "category"]);
const REQUEST_STATUSES = new Set(["pending", "approved", "rejected"]);

const assertMemberRequester = (actor) => {
  if (actor.role !== "member") throw appError("MEMBER_REQUEST_ONLY", "Administrator dapat membuat data master secara langsung tanpa pengajuan.", 409);
};

const requestKey = (payload) => crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");

const maskedAccountNumber = (value) => {
  const accountNumber = String(value || "");
  return accountNumber ? `••••${accountNumber.slice(-4)}` : "";
};

const auditPayload = (type, payload) => type === "account"
  ? { ...payload, account_number: maskedAccountNumber(payload.account_number) }
  : payload;

const requestProjection = (row) => {
  const payload = parseJson(row.payload_json, {});
  return {
    ...publicRow(row),
    payload,
    payload_json: undefined,
  };
};

const requestAuditProjection = (row) => {
  const projected = requestProjection(row);
  return {
    ...projected,
    payload: auditPayload(row.request_type, projected.payload),
  };
};

const normalizedRequestFilters = (payload = {}) => {
  const type = sanitizeText(payload.request_type, 20);
  const status = sanitizeText(payload.status, 20);
  if (type && !REQUEST_TYPES.has(type)) throw appError("INVALID_REQUEST_TYPE", "Jenis pengajuan data master tidak valid.", 400);
  if (status && !REQUEST_STATUSES.has(status)) throw appError("INVALID_REQUEST_STATUS", "Status pengajuan data master tidak valid.", 400);
  return { type, status };
};

export const listMasterDataRequests = async (db, context) => {
  const { type, status } = normalizedRequestFilters(context.payload || {});
  const clauses = [];
  const args = [];
  if (context.actor.role !== "owner") {
    clauses.push("r.requested_by=?");
    args.push(context.actor.user_id);
  }
  if (type) {
    clauses.push("r.request_type=?");
    args.push(type);
  }
  if (status) {
    clauses.push("r.status=?");
    args.push(status);
  }
  const rows = await db.all(`SELECT r.*,u.name AS requester_name,u.email AS requester_email
    FROM master_data_requests r
    JOIN users u ON u.user_id=r.requested_by
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.requested_at DESC
    LIMIT 100`, args);
  return { items: rows.map(requestProjection) };
};

const createRequest = async (db, context, type, preparedPayload) => {
  assertMemberRequester(context.actor);
  const key = requestKey(preparedPayload);
  const existing = await db.one(`SELECT r.*,u.name AS requester_name,u.email AS requester_email
    FROM master_data_requests r JOIN users u ON u.user_id=r.requested_by
    WHERE r.request_type=? AND r.requested_by=? AND r.request_key=? AND r.status='pending'`, [type, context.actor.user_id, key]);
  if (existing) return { ...requestProjection(existing), duplicate_pending: true };

  const timestamp = nowIso();
  const record = {
    request_id: uuid(),
    request_type: type,
    request_key: key,
    payload_json: canonicalJson(preparedPayload),
    status: "pending",
    row_version: 1,
    requested_by: context.actor.user_id,
    requested_at: timestamp,
    reviewed_by: null,
    reviewed_at: null,
    review_reason: "",
    approved_entity_id: null,
  };
  await db.execute(`INSERT INTO master_data_requests(request_id,request_type,request_key,payload_json,status,row_version,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,approved_entity_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "master_data_request", entityId: record.request_id, next: requestAuditProjection(record) });
  return requestProjection(record);
};

export const requestAccountCreation = async (db, context) => {
  assertMemberRequester(context.actor);
  const prepared = await prepareAccountCreatePayload(db, context.actor, context.payload || {}, { today: context.today });
  return createRequest(db, context, "account", prepared);
};

export const requestCategoryCreation = async (db, context) => {
  assertMemberRequester(context.actor);
  const prepared = await prepareCategoryCreatePayload(db, context.payload || {});
  return createRequest(db, context, "category", prepared);
};

const approvedEntity = async (db, context, request) => {
  const payload = parseJson(request.payload_json, null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw appError("REQUEST_PAYLOAD_INVALID", "Payload pengajuan tidak valid.", 409);
  if (request.request_type === "account") {
    return createAccount(db, { ...context, action: "accounts.create", payload });
  }
  if (request.request_type === "category") {
    return createCategory(db, { ...context, action: "categories.create", payload });
  }
  throw appError("INVALID_REQUEST_TYPE", "Jenis pengajuan data master tidak valid.", 409);
};

export const reviewMasterDataRequest = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const decision = String(payload.decision || "");
  if (!new Set(["approve", "reject"]).has(decision)) throw appError("INVALID_REVIEW_DECISION", "Keputusan pengajuan harus approve atau reject.", 400);
  const current = await db.one(`SELECT r.*,u.status AS requester_status,u.name AS requester_name,u.email AS requester_email
    FROM master_data_requests r JOIN users u ON u.user_id=r.requested_by WHERE r.request_id=?`, [payload.request_id]);
  if (!current || current.status !== "pending") throw appError("REQUEST_NOT_PENDING", "Pengajuan pending tidak ditemukan atau sudah diproses.", 409);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  if (current.requester_status !== "active") throw appError("REQUESTER_INACTIVE", "Pengajuan tidak dapat diproses karena Member pemohon sudah tidak aktif.", 409);
  const reason = sanitizeText(payload.reason, 200);
  if (decision === "reject" && reason.length < 3) throw appError("REVIEW_REASON_REQUIRED", "Alasan penolakan minimal 3 karakter.", 400);

  let entity = null;
  if (decision === "approve") entity = await approvedEntity(db, context, current);
  const timestamp = nowIso();
  const next = {
    ...current,
    status: decision === "approve" ? "approved" : "rejected",
    row_version: Number(current.row_version) + 1,
    reviewed_by: context.actor.user_id,
    reviewed_at: timestamp,
    review_reason: reason,
    approved_entity_id: entity?.account_id || entity?.category_id || null,
  };
  const update = await db.execute(`UPDATE master_data_requests
    SET status=?,row_version=?,reviewed_by=?,reviewed_at=?,review_reason=?,approved_entity_id=?
    WHERE request_id=? AND row_version=? AND status='pending'`, [
    next.status, next.row_version, next.reviewed_by, next.reviewed_at, next.review_reason, next.approved_entity_id,
    current.request_id, current.row_version,
  ]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Pengajuan berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "master_data_request",
    entityId: current.request_id,
    previous: requestAuditProjection(current),
    next: requestAuditProjection(next),
  });
  return { request: requestProjection(next), entity };
};

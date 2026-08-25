import crypto from "node:crypto";
import { appendAudit } from "./audit.js";
import { appError, assertOwner, assertVersion, canonicalJson, nowIso, parseJson, publicRow, sanitizeText, uuid } from "./core.js";
import { createTransactionInternal, normalizeTransaction } from "./finance.js";

const REQUEST_STATUSES = new Set(["pending", "approved", "rejected"]);

const assertMemberRequester = (actor) => {
  if (actor.role !== "member") throw appError("MEMBER_TRANSFER_REQUEST_ONLY", "Administrator dapat melakukan transfer ini secara langsung.", 409);
};

const transferRequestKey = (payload) => crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");

const requestProjection = (row) => ({
  ...publicRow(row),
  payload: parseJson(row.payload_json, {}),
  payload_json: undefined,
});

const transferRequestPayload = (normalized, original = {}) => ({
  transaction_type: "transfer",
  transaction_date: normalized.transaction_date,
  source_account_id: normalized.source_account_id,
  destination_account_id: normalized.destination_account_id,
  amount: normalized.amount,
  description: normalized.description,
  merchant: normalized.merchant,
  payment_method: normalized.payment_method,
  confirm_duplicate: original.confirm_duplicate === true,
});

const assertSharedToPersonalDirection = async (db, sourceAccountId, destinationAccountId) => {
  const [source, destination] = await Promise.all([
    db.one("SELECT account_id,owner_scope,owner_user_id,status FROM accounts WHERE account_id=?", [sourceAccountId]),
    db.one("SELECT account_id,owner_scope,owner_user_id,status FROM accounts WHERE account_id=?", [destinationAccountId]),
  ]);
  if (!source || source.status !== "active" || !destination || destination.status !== "active") {
    throw appError("INVALID_ACCOUNT", "Rekening sumber atau tujuan pengajuan tidak lagi aktif.", 409);
  }
  if (source.owner_scope !== "shared" || destination.owner_scope !== "personal") {
    throw appError("TRANSFER_REQUEST_DIRECTION_CHANGED", "Pengajuan hanya berlaku untuk transfer dari rekening Bersama ke rekening pribadi.", 409);
  }
};

export const listTransferRequests = async (db, context) => {
  const status = sanitizeText(context.payload?.status, 20);
  if (status && !REQUEST_STATUSES.has(status)) throw appError("INVALID_REQUEST_STATUS", "Status pengajuan transfer tidak valid.", 400);
  const clauses = [];
  const args = [];
  if (context.actor.role !== "owner") {
    clauses.push("r.requested_by=?");
    args.push(context.actor.user_id);
  }
  if (status) {
    clauses.push("r.status=?");
    args.push(status);
  }
  const rows = await db.all(`SELECT r.*,u.name AS requester_name,u.email AS requester_email
    FROM transfer_requests r JOIN users u ON u.user_id=r.requested_by
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.requested_at DESC LIMIT 100`, args);
  return { items: rows.map(requestProjection) };
};

export const requestSharedToPersonalTransfer = async (db, context) => {
  assertMemberRequester(context.actor);
  const raw = context.payload || {};
  if (String(raw.transaction_type || "transfer") !== "transfer") throw appError("INVALID_TRANSACTION_TYPE", "Pengajuan ini hanya untuk transfer.", 400);
  const normalized = await normalizeTransaction(db, context, { ...raw, transaction_type: "transfer" }, { allowSharedToPersonalRequest: true });
  await assertSharedToPersonalDirection(db, normalized.source_account_id, normalized.destination_account_id);
  const payload = transferRequestPayload(normalized, raw);
  const key = transferRequestKey(payload);
  const existing = await db.one(`SELECT r.*,u.name AS requester_name,u.email AS requester_email
    FROM transfer_requests r JOIN users u ON u.user_id=r.requested_by
    WHERE r.requested_by=? AND r.request_key=? AND r.status='pending'`, [context.actor.user_id, key]);
  if (existing) return { ...requestProjection(existing), duplicate_pending: true };

  const record = {
    request_id: uuid(), request_key: key, payload_json: canonicalJson(payload), status: "pending", row_version: 1,
    requested_by: context.actor.user_id, requested_at: nowIso(), reviewed_by: null, reviewed_at: null,
    review_reason: "", approved_transaction_id: null,
  };
  await db.execute(`INSERT INTO transfer_requests(request_id,request_key,payload_json,status,row_version,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,approved_transaction_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "transfer_request", entityId: record.request_id, next: requestProjection(record) });
  return requestProjection(record);
};

export const reviewTransferRequest = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const decision = String(payload.decision || "");
  if (!new Set(["approve", "reject"]).has(decision)) throw appError("INVALID_REVIEW_DECISION", "Keputusan pengajuan harus approve atau reject.", 400);
  const current = await db.one(`SELECT r.*,u.status AS requester_status,u.role AS requester_role,u.firebase_uid,u.email,u.name
    FROM transfer_requests r JOIN users u ON u.user_id=r.requested_by WHERE r.request_id=?`, [payload.request_id]);
  if (!current || current.status !== "pending") throw appError("REQUEST_NOT_PENDING", "Pengajuan transfer pending tidak ditemukan atau sudah diproses.", 409);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  if (current.requester_status !== "active" || current.requester_role !== "member") throw appError("REQUESTER_INACTIVE", "Pengajuan tidak dapat diproses karena Member pemohon sudah tidak aktif.", 409);
  const reason = sanitizeText(payload.reason, 200);
  if (decision === "reject" && reason.length < 3) throw appError("REVIEW_REASON_REQUIRED", "Alasan penolakan minimal 3 karakter.", 400);

  let transaction = null;
  if (decision === "approve") {
    const requestedPayload = parseJson(current.payload_json, null);
    if (!requestedPayload || typeof requestedPayload !== "object" || Array.isArray(requestedPayload)) throw appError("REQUEST_PAYLOAD_INVALID", "Payload pengajuan transfer tidak valid.", 409);
    await assertSharedToPersonalDirection(db, requestedPayload.source_account_id, requestedPayload.destination_account_id);
    const requester = {
      user_id: current.requested_by,
      firebase_uid: current.firebase_uid,
      email: current.email,
      name: current.name,
      role: current.requester_role,
      status: current.requester_status,
    };
    await normalizeTransaction(db, { ...context, actor: requester, action: "transferRequests.request", payload: requestedPayload }, requestedPayload, { allowSharedToPersonalRequest: true });
    transaction = await createTransactionInternal(db, {
      ...context,
      action: "transactions.create",
      idempotencyKey: `${context.idempotencyKey || current.request_id}:approved-transfer`,
    }, requestedPayload);
  }

  const next = {
    ...current,
    status: decision === "approve" ? "approved" : "rejected",
    row_version: Number(current.row_version) + 1,
    reviewed_by: context.actor.user_id,
    reviewed_at: nowIso(),
    review_reason: reason,
    approved_transaction_id: transaction?.transaction_id || null,
  };
  const result = await db.execute(`UPDATE transfer_requests SET status=?,row_version=?,reviewed_by=?,reviewed_at=?,review_reason=?,approved_transaction_id=?
    WHERE request_id=? AND row_version=? AND status='pending'`, [
    next.status, next.row_version, next.reviewed_by, next.reviewed_at, next.review_reason, next.approved_transaction_id,
    current.request_id, current.row_version,
  ]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengajuan transfer berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "transfer_request", entityId: current.request_id,
    previous: requestProjection(current), next: requestProjection(next),
  });
  return { request: requestProjection(next), transaction };
};

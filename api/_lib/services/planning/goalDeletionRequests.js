import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "../core.js";
import { queueNotification } from "../notifications/delivery.js";
import { archiveGoal, deleteUnusedGoal } from "./goals.js";
import { goalLifecycleImpact } from "./goalLifecycle.js";

const REQUEST_STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);
const project = (row) => publicRow(row);

export const listGoalDeletionRequests = async (db, context) => {
  const status = String(context.payload?.status || "");
  if (status && !REQUEST_STATUSES.has(status)) throw appError("INVALID_REQUEST_STATUS", "Status pengajuan tidak valid.", 400);
  const clauses = [];
  const args = [];
  if (context.actor.role !== "owner") { clauses.push("r.requested_by=?"); args.push(context.actor.user_id); }
  if (status) { clauses.push("r.status=?"); args.push(status); }
  const items = await db.all(`SELECT r.*,u.name AS requester_name FROM goal_deletion_requests r JOIN users u ON u.user_id=r.requested_by ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.requested_at DESC LIMIT 200`, args);
  return { items: items.map(project) };
};

const notifyOwner = async (db, request) => {
  const owners = await db.all("SELECT user_id FROM users WHERE role='owner' AND status='active'");
  for (const owner of owners) await queueNotification(db, {
    userId: owner.user_id, type: "goal_deletion", title: "Pengajuan hapus Target",
    body: `${request.goal_name} menunggu persetujuan penghapusan.`,
    targetPath: "/keluarga", dedupeKey: `goal-delete:request:${request.request_id}:${owner.user_id}`,
  });
};

export const requestGoalDeletion = async (db, context) => {
  if (context.actor.role !== "member") throw appError("MEMBER_REQUEST_ONLY", "Admin dapat menghapus Target langsung.", 409);
  const payload = context.payload || {};
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Isi alasan penghapusan Target.", 400);
  const goal = await db.one("SELECT goal_id,name,scope,owner_user_id,status,row_version FROM savings_goals WHERE goal_id=?", [payload.goal_id]);
  if (!goal || goal.status === "archived" || (goal.scope === "personal" && goal.owner_user_id !== context.actor.user_id)) throw appError("NOT_FOUND", "Target tidak ditemukan.", 404);
  if (goal.scope !== "shared") throw appError("GOAL_SHARED_REQUIRED", "Pengajuan hanya untuk Target Bersama.", 403);
  assertVersion(goal, context.rowVersion ?? payload.row_version);
  const existing = await db.one("SELECT * FROM goal_deletion_requests WHERE goal_id=? AND requested_by=? AND status='pending'", [goal.goal_id, context.actor.user_id]);
  if (existing) return { request: project(existing), duplicate_pending: true };
  const request = { request_id: uuid(), goal_id: goal.goal_id, goal_name: goal.name, goal_row_version: goal.row_version, requested_by: context.actor.user_id, reason, status: "pending", row_version: 1, requested_at: nowIso(), reviewed_by: null, reviewed_at: null, review_reason: "", outcome: "" };
  await db.execute(`INSERT INTO goal_deletion_requests(request_id,goal_id,goal_name,goal_row_version,requested_by,reason,status,row_version,requested_at,reviewed_by,reviewed_at,review_reason,outcome) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(request));
  await appendAudit(db, context, { entityType: "goal_deletion_request", entityId: request.request_id, next: project(request) });
  await notifyOwner(db, request);
  return { request: project(request) };
};

const pendingOwnRequest = async (db, context) => {
  const current = await db.one("SELECT * FROM goal_deletion_requests WHERE request_id=?", [context.payload?.request_id]);
  if (!current || current.requested_by !== context.actor.user_id) throw appError("REQUEST_NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  if (current.status !== "pending") throw appError("REQUEST_NOT_PENDING", "Pengajuan sudah diproses.", 409);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  return current;
};

export const withdrawGoalDeletion = async (db, context) => {
  const current = await pendingOwnRequest(db, context);
  const reason = sanitizeText(context.payload?.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Isi alasan penarikan.", 400);
  const next = { ...current, status: "cancelled", row_version: current.row_version + 1, reviewed_at: nowIso(), reviewed_by: context.actor.user_id, review_reason: reason };
  const result = await db.execute("UPDATE goal_deletion_requests SET status='cancelled',row_version=?,reviewed_by=?,reviewed_at=?,review_reason=? WHERE request_id=? AND row_version=? AND status='pending'", [next.row_version,next.reviewed_by,next.reviewed_at,next.review_reason,current.request_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengajuan berubah. Muat ulang.", 409);
  await appendAudit(db, context, { entityType: "goal_deletion_request", entityId: current.request_id, previous: project(current), next: project(next) });
  return { request: project(next) };
};

export const reviewGoalDeletion = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const decision = String(payload.decision || "");
  if (!["approve", "reject"].includes(decision)) throw appError("INVALID_REVIEW_DECISION", "Pilih setujui atau tolak.", 400);
  const current = await db.one("SELECT r.*,u.status AS requester_status FROM goal_deletion_requests r JOIN users u ON u.user_id=r.requested_by WHERE r.request_id=?", [payload.request_id]);
  if (!current || current.status !== "pending") throw appError("REQUEST_NOT_PENDING", "Pengajuan sudah diproses.", 409);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  if (current.requester_status !== "active") throw appError("REQUESTER_INACTIVE", "Pemohon sudah tidak aktif.", 409);
  const reason = sanitizeText(payload.reason, 200);
  if (decision === "reject" && reason.length < 3) throw appError("REVIEW_REASON_REQUIRED", "Isi alasan penolakan minimal 3 karakter.", 400);
  let outcome = "";
  if (decision === "approve") {
    const goal = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [current.goal_id]);
    if (!goal || goal.status === "archived" || goal.row_version !== current.goal_row_version || goal.scope !== "shared") throw appError("GOAL_CHANGED", "Target telah berubah sejak diajukan. Tolak pengajuan ini dan minta member mengajukan ulang jika masih diperlukan.", 409);
    const impact = await goalLifecycleImpact(db, goal);
    const ownerContext = { ...context, rowVersion: goal.row_version, payload: { goal_id: goal.goal_id, row_version: goal.row_version, reason: current.reason, acknowledged: true } };
    if (impact.canDeleteUnused) { await deleteUnusedGoal(db, ownerContext); outcome = "deleted"; }
    else { await archiveGoal(db, ownerContext); outcome = "archived"; }
  }
  const now = nowIso();
  const next = { ...current, status: decision === "approve" ? "approved" : "rejected", row_version: current.row_version + 1, reviewed_by: context.actor.user_id, reviewed_at: now, review_reason: reason, outcome };
  const result = await db.execute("UPDATE goal_deletion_requests SET status=?,row_version=?,reviewed_by=?,reviewed_at=?,review_reason=?,outcome=? WHERE request_id=? AND row_version=? AND status='pending'", [next.status,next.row_version,next.reviewed_by,next.reviewed_at,next.review_reason,next.outcome,current.request_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengajuan telah diproses oleh perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "goal_deletion_request", entityId: current.request_id, previous: project(current), next: project(next) });
  if (decision === "approve") {
    const siblings = await db.all("SELECT * FROM goal_deletion_requests WHERE goal_id=? AND status='pending'", [current.goal_id]);
    for (const sibling of siblings) {
      const resolved = { ...sibling, status: "approved", row_version: sibling.row_version + 1, reviewed_by: context.actor.user_id, reviewed_at: now, review_reason: "Target telah ditangani melalui persetujuan anggota lain.", outcome };
      await db.execute("UPDATE goal_deletion_requests SET status='approved',row_version=?,reviewed_by=?,reviewed_at=?,review_reason=?,outcome=? WHERE request_id=? AND status='pending'", [resolved.row_version,resolved.reviewed_by,resolved.reviewed_at,resolved.review_reason,outcome,sibling.request_id]);
      await appendAudit(db, context, { entityType: "goal_deletion_request", entityId: sibling.request_id, previous: project(sibling), next: project(resolved) });
    }
  }
  await queueNotification(db, { userId: current.requested_by, type: "goal_deletion", title: decision === "approve" ? "Penghapusan Target disetujui" : "Penghapusan Target ditolak", body: decision === "approve" ? `${current.goal_name} sudah ${outcome === "deleted" ? "dihapus" : "diarsipkan"}.` : `${current.goal_name} muncul kembali di daftar Target.`, targetPath: decision === "approve" ? "/pengaturan/akun" : "/target", dedupeKey: `goal-delete:review:${current.request_id}:${next.status}` });
  return { request: project(next), outcome };
};

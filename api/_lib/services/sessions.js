import { appendAudit } from "./audit.js";
import { appError, nowIso, publicRow, sanitizeText } from "./core.js";

const publicSession = (row, currentSessionId) => publicRow({
  session_id: row.session_id,
  device_label: row.device_label || "Perangkat",
  client_family: row.client_family || "Browser",
  issued_at: row.issued_at,
  expires_at: row.expires_at,
  last_seen_at: row.last_seen_at || row.issued_at,
  is_current: row.session_id === currentSessionId,
});

export const listOwnSessions = async (db, context) => {
  const timestamp = nowIso();
  const rows = await db.all(`SELECT session_id,device_label,client_family,issued_at,expires_at,last_seen_at
    FROM user_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY issued_at DESC`, [context.actor.user_id, timestamp]);
  return { items: rows.map((row) => publicSession(row, context.signedActor?.sessionId)) };
};

export const revokeOwnSession = async (db, context) => {
  const sessionId = sanitizeText(context.payload?.session_id, 128);
  if (!sessionId) throw appError("SESSION_REQUIRED", "Session perangkat wajib dipilih.", 400);
  const row = await db.one("SELECT session_id,user_id,revoked_at,device_label FROM user_sessions WHERE session_id=?", [sessionId]);
  if (!row || row.user_id !== context.actor.user_id) throw appError("SESSION_NOT_FOUND", "Session perangkat tidak ditemukan.", 404);
  const timestamp = nowIso();
  if (!row.revoked_at) {
    await db.execute("UPDATE user_sessions SET revoked_at=?,revoked_reason='user_revoke',row_version=row_version+1,updated_at=? WHERE session_id=? AND user_id=? AND revoked_at IS NULL", [timestamp, timestamp, sessionId, context.actor.user_id]);
    await appendAudit(db, context, { entityType: "session", entityId: sessionId, next: { deviceLabel: row.device_label || "Perangkat", revokedAt: timestamp, reason: "user_revoke" } });
  }
  return { revoked: true, sessionId, revokedCurrent: sessionId === context.signedActor?.sessionId };
};

export const revokeAllOwnSessions = async (db, context) => {
  const timestamp = nowIso();
  const result = await db.execute("UPDATE user_sessions SET revoked_at=?,revoked_reason='user_revoke_all',row_version=row_version+1,updated_at=? WHERE user_id=? AND revoked_at IS NULL AND expires_at>?", [timestamp, timestamp, context.actor.user_id, timestamp]);
  await appendAudit(db, context, { entityType: "session", entityId: context.actor.user_id, next: { revokedAt: timestamp, revokedCount: Number(result.rowsAffected || 0), reason: "user_revoke_all" } });
  return { revoked: true, revokedCount: Number(result.rowsAffected || 0), revokedCurrent: true };
};

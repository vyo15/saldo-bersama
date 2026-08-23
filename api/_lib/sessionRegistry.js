import crypto from "node:crypto";
import { readSessionCredential, safeEqualText } from "./security.js";
import { appendAudit } from "./services/audit.js";
import { nowIso } from "./services/core.js";

const SESSION_TTL_SECONDS = 12 * 60 * 60;
const LAST_SEEN_WRITE_INTERVAL_MS = 15 * 60_000;
const SESSION_RETENTION_DAYS = 30;

const verifierHash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const randomToken = (bytes) => crypto.randomBytes(bytes).toString("base64url");

const deviceMetadata = (request) => {
  const userAgent = String(request?.headers?.["user-agent"] || "").slice(0, 1_024).toLowerCase();
  const client = userAgent.includes("edg/") ? "Edge"
    : userAgent.includes("firefox/") ? "Firefox"
      : userAgent.includes("chrome/") || userAgent.includes("crios/") ? "Chrome"
        : userAgent.includes("safari/") ? "Safari" : "Browser";
  const platform = userAgent.includes("android") ? "Android"
    : /iphone|ipad|ipod/.test(userAgent) ? "iOS"
      : userAgent.includes("windows") ? "Windows"
        : userAgent.includes("mac os") || userAgent.includes("macintosh") ? "macOS"
          : userAgent.includes("linux") ? "Linux" : "Perangkat";
  return { clientFamily: client, deviceLabel: `${client} · ${platform}` };
};

export const createRegisteredSession = async (db, { actor, signedActor, request, requestId, photoURL = "" }) => {
  const sessionId = randomToken(24);
  const sessionSecret = randomToken(32);
  const issuedAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1_000).toISOString();
  const { clientFamily, deviceLabel } = deviceMetadata(request);
  await db.execute(`INSERT INTO user_sessions(session_id,user_id,verifier_hash,issued_at,expires_at,last_seen_at,revoked_at,revoked_reason,device_label,client_family,row_version,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    sessionId,
    actor.user_id,
    verifierHash(sessionSecret),
    issuedAt,
    expiresAt,
    issuedAt,
    null,
    null,
    deviceLabel,
    clientFamily,
    1,
    issuedAt,
    issuedAt,
  ]);
  await appendAudit(db, { actor, action: "session.issue", requestId }, {
    entityType: "session",
    entityId: sessionId,
    next: { deviceLabel, issuedAt, expiresAt },
  });
  return {
    session: {
      uid: actor.firebase_uid || signedActor.uid,
      email: actor.email,
      name: actor.name || actor.email,
      photoURL,
      role: actor.role,
      sessionId,
    },
    credential: { sessionId, sessionSecret, expiresAt, photoURL },
  };
};

const sessionRow = (db, sessionId) => db.one(`SELECT s.*,u.firebase_uid,u.email,u.name,u.role,u.status AS user_status
  FROM user_sessions s JOIN users u ON u.user_id=s.user_id WHERE s.session_id=?`, [sessionId]);

export const resolveRegisteredSession = async (db, request) => {
  const credential = readSessionCredential(request);
  if (!credential) return null;
  const row = await sessionRow(db, credential.sessionId);
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const expectedHash = verifierHash(credential.sessionSecret);
  if (!safeEqualText(expectedHash, row.verifier_hash)) return null;
  // Runtime membership is authoritative in the backend users table. The environment
  // allowlist is bootstrap-only, so an active linked user remains valid without being
  // duplicated into ALLOWED_USERS_JSON. Role changes/deactivation revoke active sessions.
  if (row.user_status !== "active" || !row.firebase_uid || !["owner", "member"].includes(row.role)) return null;

  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen >= LAST_SEEN_WRITE_INTERVAL_MS) {
    const timestamp = nowIso();
    db.execute("UPDATE user_sessions SET last_seen_at=?,updated_at=? WHERE session_id=? AND revoked_at IS NULL", [timestamp, timestamp, row.session_id]).catch(() => undefined);
  }
  return {
    uid: row.firebase_uid,
    email: row.email,
    name: row.name || row.email,
    photoURL: credential.photoURL || "",
    role: row.role,
    sessionId: row.session_id,
    userId: row.user_id,
  };
};

export const revokeSessionFromRequest = async (db, request, reason = "logout") => {
  const credential = readSessionCredential(request);
  if (!credential) return { revoked: false, sessionId: null, userId: null };
  const row = await db.one("SELECT session_id,user_id,verifier_hash,revoked_at FROM user_sessions WHERE session_id=?", [credential.sessionId]);
  if (!row) return { revoked: false, sessionId: credential.sessionId, userId: null };
  if (!safeEqualText(verifierHash(credential.sessionSecret), row.verifier_hash)) return { revoked: false, sessionId: credential.sessionId, userId: null };
  if (row.revoked_at) return { revoked: true, sessionId: row.session_id, userId: row.user_id, alreadyRevoked: true };
  const timestamp = nowIso();
  await db.execute("UPDATE user_sessions SET revoked_at=?,revoked_reason=?,row_version=row_version+1,updated_at=? WHERE session_id=? AND revoked_at IS NULL", [timestamp, String(reason).slice(0, 80), timestamp, row.session_id]);
  return { revoked: true, sessionId: row.session_id, userId: row.user_id, alreadyRevoked: false };
};

export const revokeUserSessions = async (db, userId, reason) => {
  const timestamp = nowIso();
  const result = await db.execute("UPDATE user_sessions SET revoked_at=?,revoked_reason=?,row_version=row_version+1,updated_at=? WHERE user_id=? AND revoked_at IS NULL AND expires_at>?", [timestamp, String(reason || "security_change").slice(0, 80), timestamp, userId, timestamp]);
  return Number(result.rowsAffected || 0);
};

export const cleanupExpiredSessions = async (db, timestamp = nowIso()) => {
  const cutoff = new Date(new Date(timestamp).getTime() - SESSION_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
  const result = await db.execute(`DELETE FROM user_sessions
    WHERE (revoked_at IS NOT NULL AND revoked_at<?) OR (expires_at<? AND expires_at<?)`, [cutoff, timestamp, cutoff]);
  return Number(result.rowsAffected || 0);
};

export const sessionVerifierHash = verifierHash;

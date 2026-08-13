import { DATABASE_SCHEMA_VERSION } from "../../db/schema.js";
import { callGoogleBridge } from "../integrations.js";
import { appError, assertOwner, nowIso, sanitizeText, uuid } from "../core.js";
import { digest, encodeBackup, ensureBackupAudit, snapshotDatabase } from "./shared.js";

export const createTechnicalBackup = async (db, context, { type = "manual", audit = true } = {}) => {
  assertOwner(context.actor);
  const backupType = sanitizeText(type, 30) || "manual";
  const idempotencyMaterial = context.idempotencyKey
    ? `${context.actor.user_id}:${context.action}:${backupType}:${context.idempotencyKey}`
    : null;
  const backupId = idempotencyMaterial ? `bkp_${digest(idempotencyMaterial).slice(0, 32)}` : uuid();
  let existing = await db.one("SELECT * FROM backup_runs WHERE backup_id=?", [backupId]);
  if (existing?.status === "verified" && existing.external_file_id) {
    await ensureBackupAudit(db, context, backupId, { fileName: existing.file_name, status: "verified", checksum: existing.checksum }, audit);
    return { backupId, fileId: existing.external_file_id, fileName: existing.file_name, checksum: existing.checksum, status: "verified", replayed: true };
  }
  const snapshot = await snapshotDatabase(db);
  const timestamp = nowIso().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const proposedFileName = `saldo-bersama-backup-v${DATABASE_SCHEMA_VERSION}-${timestamp}-${backupId.slice(-8)}.json.gz`;
  await db.execute(`INSERT OR IGNORE INTO backup_runs(backup_id,backup_type,external_file_id,file_name,schema_version,status,checksum,created_by,created_at,verified_at,error_code)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [backupId, backupType, null, proposedFileName, DATABASE_SCHEMA_VERSION, "pending", snapshot.checksum, context.actor.user_id, nowIso(), null, null]);
  existing = await db.one("SELECT * FROM backup_runs WHERE backup_id=?", [backupId]);
  if (existing?.status === "verified" && existing.external_file_id) {
    await ensureBackupAudit(db, context, backupId, { fileName: existing.file_name, status: "verified", checksum: existing.checksum }, audit);
    return { backupId, fileId: existing.external_file_id, fileName: existing.file_name, checksum: existing.checksum, status: "verified", replayed: true };
  }
  const fileName = existing?.file_name || proposedFileName;
  await db.execute("UPDATE backup_runs SET status='pending',checksum=?,error_code=NULL WHERE backup_id=? AND status<>'verified'", [snapshot.checksum, backupId]);
  try {
    const stored = await callGoogleBridge("backup.store", { backupId, fileName, contentBase64: encodeBackup(snapshot, fileName.replace(/\.gz$/i, "")), checksum: snapshot.checksum });
    if (!stored?.fileId) throw appError("BACKUP_STORE_FAILED", "Google Drive tidak mengembalikan file backup.", 503);
    await db.execute("UPDATE backup_runs SET external_file_id=?,status='verified',checksum=?,verified_at=?,error_code=NULL WHERE backup_id=?", [stored.fileId, snapshot.checksum, nowIso(), backupId]);
    await ensureBackupAudit(db, context, backupId, { fileName, status: "verified", checksum: snapshot.checksum }, audit);
    return { backupId, fileId: stored.fileId, fileName, checksum: snapshot.checksum, status: "verified" };
  } catch (error) {
    await db.execute("UPDATE backup_runs SET status='failed',error_code=? WHERE backup_id=? AND status<>'verified'", [sanitizeText(error.code || "BACKUP_FAILED", 80), backupId]);
    throw error;
  }
};

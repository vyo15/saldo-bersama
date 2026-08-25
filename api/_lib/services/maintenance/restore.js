/** Restore is fail-closed: preview/validation, safety backup, maintenance lock, apply, integrity verification, then audit. */
import { DATABASE_SCHEMA_VERSION } from "../../db/schema.js";
import { appendAudit } from "../audit.js";
import { trustedProfilePhotoUrl } from "../../security.js";
import { callGoogleBridge, enqueueIntegration } from "../integrations.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, canonicalJson, nowIso, sanitizeText, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import { RESTORE_DELETE_ORDER, decodeBackup, expiry, insertRows, normalizeRestoredRows, quoted, validateSnapshot } from "./shared.js";
export const readBackupFromDrive = async (db, externalFileId) => {
  const run = await db.one("SELECT * FROM backup_runs WHERE external_file_id=? AND status IN ('verified','completed')", [externalFileId]);
  if (!run) throw appError("BACKUP_NOT_FOUND", "Backup terverifikasi tidak ditemukan.", 404);
  const file = await callGoogleBridge("backup.read", {
    fileId: externalFileId
  });
  const snapshot = decodeBackup(file?.contentBase64);
  const checksum = validateSnapshot(snapshot);
  if (run.checksum && run.checksum !== checksum) throw appError("BACKUP_CHECKSUM_INVALID", "Checksum Drive berbeda dengan catatan backup.", 409);
  return {
    run,
    snapshot,
    checksum
  };
};
export const previewRestore = async (db, context) => {
  assertOwner(context.actor);
  const fileId = sanitizeText(context.payload?.backupFileId, 200);
  const {
    run,
    snapshot,
    checksum
  } = await readBackupFromDrive(db, fileId);
  const summary = {
    schemaVersion: snapshot.manifest.schemaVersion,
    createdAt: snapshot.manifest.createdAt,
    tables: snapshot.manifest.tables,
    fileName: run.file_name
  };
  const previewId = uuid();
  const createdAt = nowIso();
  await db.transaction(async (tx) => {
    await tx.execute("DELETE FROM restore_previews WHERE expires_at<?", [createdAt]);
    await tx.execute("INSERT INTO restore_previews(preview_id,backup_id,actor_id,checksum,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,'pending',NULL,NULL,?,?)", [previewId, run.backup_id, context.actor.user_id, checksum, canonicalJson(summary), expiry(10), createdAt]);
  });
  return {
    previewToken: previewId,
    ...summary
  };
};
const restoredDataTables = Object.freeze([
  "notification_preferences", "accounts", "categories", "master_data_requests", "transfer_requests", "envelope_rules", "envelope_periods",
  "recurring_rules", "recurring_occurrences", "savings_goals", "transactions", "envelope_movements",
  "budgets", "goal_movements", "reconciliations", "period_closures", "manual_reminders", "idempotency_keys",
]);

const loadRestorePreview = async (db, context, payload) => {
  if (payload.confirmation !== "RESTORE SALDO BERSAMA") throw appError("CONFIRMATION_REQUIRED", "Konfirmasi restore tidak sesuai.", 400);
  if (payload.acknowledged !== true) throw appError("RESTORE_ACKNOWLEDGEMENT_REQUIRED", "Seluruh pernyataan pemahaman restore wajib diselesaikan.", 400);
  const reason = sanitizeText(payload.reason, 200);
  if (reason.length < 5) throw appError("RESTORE_REASON_REQUIRED", "Alasan restore minimal 5 karakter.", 400);
  const preview = await db.one("SELECT * FROM restore_previews WHERE preview_id=? AND actor_id=?", [payload.previewToken, context.actor.user_id]);
  if (!preview) throw appError("RESTORE_PREVIEW_EXPIRED", "Preview restore tidak ditemukan.", 409);
  if (preview.status === "applied" && preview.result_json) return { preview, appliedResult: JSON.parse(preview.result_json), reason };
  if (preview.expires_at <= nowIso()) throw appError("RESTORE_PREVIEW_EXPIRED", "Preview restore sudah kedaluwarsa.", 409);
  return { preview, appliedResult: null, reason };
};

const loadRestoreIdentityState = async (db) => {
  const currentUsers = await db.all("SELECT user_id,email,firebase_uid,photo_url,role,status,row_version FROM users");
  return {
    currentUsers,
    currentByEmail: new Map(currentUsers.map((user) => [String(user.email || "").toLowerCase(), user])),
  };
};

const assertRestoreIdentityCompatibility = (snapshot, currentByEmail) => {
  for (const backupUser of snapshot.tables.users) {
    const current = currentByEmail.get(String(backupUser.email || "").toLowerCase());
    if (current && current.user_id !== backupUser.user_id) {
      throw appError("RESTORE_IDENTITY_CONFLICT", "Backup memakai ID pengguna berbeda untuk email yang masih aktif. Restore dibatalkan agar referensi kepemilikan tidak tertukar.", 409, {
        email: backupUser.email,
      });
    }
  }
};

const restoredUserValues = (context, user, current) => {
  const email = String(user.email || "").trim().toLowerCase();
  const isActor = email === String(context.actor.email || "").toLowerCase();
  const firebaseUid = isActor ? context.signedActor.uid : (current?.firebase_uid || null);
  const role = isActor ? context.actor.role : (current?.role || user.role);
  // Restore data finansial tidak boleh menghidupkan kembali akses historis. Registry user yang aktif sebelum restore tetap canonical.
  const status = isActor ? "active" : (current?.status || "inactive");
  const rowVersion = Math.max(Number(user.row_version || 1), Number(current?.row_version || 0)) + 1;
  const photoURL = trustedProfilePhotoUrl(current?.photo_url || user.photo_url || "");
  return { email, firebaseUid, photoURL, role, status, rowVersion };
};

const upsertRestoredUsers = async (tx, context, users, currentByEmail) => {
  for (const user of users) {
    const email = String(user.email || "").trim().toLowerCase();
    const current = currentByEmail.get(email);
    const values = restoredUserValues(context, user, current);
    await tx.execute(`INSERT INTO users(user_id,firebase_uid,email,name,photo_url,role,status,row_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET firebase_uid=excluded.firebase_uid,email=excluded.email,name=excluded.name,photo_url=excluded.photo_url,role=excluded.role,status=excluded.status,row_version=excluded.row_version,updated_at=excluded.updated_at`, [user.user_id, values.firebaseUid, values.email, user.name, values.photoURL, values.role, values.status, values.rowVersion, user.created_at, nowIso()]);
  }
};

const restoreUsers = async (tx, context, snapshot, identityState) => {
  await upsertRestoredUsers(tx, context, snapshot.tables.users, identityState.currentByEmail);
  // User canonical yang tidak ada di backup sengaja dibiarkan apa adanya; perubahan akses tetap melalui user-management yang diaudit.
};

const restoreSnapshotTables = async (tx, snapshot) => {
  for (const table of restoredDataTables) {
    await insertRows(tx, table, normalizeRestoredRows(table, snapshot.tables[table] || []));
  }
  await insertRows(tx, "audit_log", snapshot.tables.audit_log, { mode: "INSERT OR IGNORE" });
};

const restoreIdempotencyReservation = async (tx, reservation) => {
  if (!reservation) return;
  await tx.execute(`INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(actor_id,idempotency_key) DO UPDATE SET action=excluded.action,request_fingerprint=excluded.request_fingerprint,entity_id=excluded.entity_id,response_json=excluded.response_json,created_at=excluded.created_at,expires_at=excluded.expires_at`,
  [
    reservation.actor_id,
    reservation.idempotency_key,
    reservation.action,
    reservation.request_fingerprint,
    reservation.entity_id,
    reservation.response_json,
    reservation.created_at,
    reservation.expires_at,
  ]);
};

const restoreSystemConfig = async (tx, snapshot) => {
  for (const row of snapshot.tables.system_config) {
    if (["maintenance_mode", "schema_version", "database_environment", "scheduler_last_run_at", "scheduler_last_success_at", "scheduler_last_failure_at", "scheduler_last_error_code"].includes(row.key)) continue;
    await tx.execute("INSERT INTO system_config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", [row.key, row.value, row.updated_at]);
  }
  await tx.execute("INSERT INTO system_config(key,value,updated_at) VALUES('schema_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", [String(DATABASE_SCHEMA_VERSION), nowIso()]);
};

const finalizeRestore = async (tx, context, { preview, run, checksum, safety, result, reason }) => {
  const issues = await integrityIssues(tx);
  if (issues.length) throw appError("RESTORE_INTEGRITY_FAILED", "Restore dibatalkan karena integrity check gagal.", 409, issues);
  await appendAudit(tx, { ...context, action: "restore.apply" }, {
    entityType: "restore",
    entityId: run.backup_id,
    next: { checksum, safetyBackupId: safety.backupId, reason },
  });
  await enqueueIntegration(tx, "sheets", "rebuild", "system", "mirror", { reason: "restore", backupId: run.backup_id });
  await enqueueIntegration(tx, "calendar", "rebuild", "system", "calendar", { reason: "restore", backupId: run.backup_id });
  const previewUpdate = await tx.execute("UPDATE restore_previews SET status='applied',result_json=?,applied_at=?,expires_at=? WHERE preview_id=? AND status='applying'", [canonicalJson(result), nowIso(), expiry(30 * 24 * 60), preview.preview_id]);
  if (previewUpdate.rowsAffected !== 1) throw appError("RESTORE_IN_PROGRESS", "Status preview restore berubah sebelum commit. Restore dibatalkan.", 409);
  const maintenanceUpdate = await tx.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
  if (maintenanceUpdate.rowsAffected !== 1) throw appError("MAINTENANCE_MODE", "Status maintenance tidak dapat dipastikan. Restore dibatalkan dan maintenance tetap aktif.", 409);
};

export const applyRestore = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const { preview, appliedResult, reason } = await loadRestorePreview(db, context, payload);
  if (appliedResult) return appliedResult;

  const activeIdempotencyReservation = context.idempotencyKey
    ? await db.one("SELECT actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND idempotency_key=?", [context.actor.user_id, context.idempotencyKey])
    : null;
  const { run, snapshot, checksum } = await readBackupFromDrive(db, sanitizeText(payload.backupFileId, 200));
  if (run.backup_id !== preview.backup_id || checksum !== preview.checksum) {
    throw appError("RESTORE_PREVIEW_CHANGED", "Backup berbeda dari preview yang disetujui.", 409);
  }

  const safety = await createTechnicalBackup(db, { ...context, action: "backup.safety" }, { type: "pre-restore", audit: true });
  const identityState = await loadRestoreIdentityState(db);
  assertRestoreIdentityCompatibility(snapshot, identityState.currentByEmail);

  const maintenanceLock = await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode' AND value='false'", [nowIso()]);
  if (maintenanceLock.rowsAffected !== 1) {
    throw appError("MAINTENANCE_MODE", "Restore lain atau proses pemulihan sedang aktif. Selesaikan integrity recovery sebelum mencoba lagi.", 409);
  }

  const result = { restored: true, backupId: run.backup_id, safetyBackupId: safety.backupId, checksum };
  try {
    await db.transaction(async (tx) => {
      const claim = await tx.execute("UPDATE restore_previews SET status='applying' WHERE preview_id=? AND status='pending'", [preview.preview_id]);
      if (claim.rowsAffected !== 1) throw appError("RESTORE_IN_PROGRESS", "Preview restore sudah diproses oleh request lain.", 409);
      await tx.execute("DELETE FROM user_sessions");
      await tx.batch(RESTORE_DELETE_ORDER.map((table) => ({ sql: `DELETE FROM ${quoted(table)}` })));
      await restoreUsers(tx, context, snapshot, identityState);
      await restoreSnapshotTables(tx, snapshot);
      await restoreIdempotencyReservation(tx, activeIdempotencyReservation);
      await restoreSystemConfig(tx, snapshot);
      await finalizeRestore(tx, context, { preview, run, checksum, safety, result, reason });
    });
    return result;
  } catch (error) {
    // Fail closed: maintenance tetap aktif sampai owner menjalankan recovery/integrity.
    throw error;
  }
};

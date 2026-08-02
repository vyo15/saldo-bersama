import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { appendAudit } from "./audit.js";
import { createTransactionInternal, normalizeTransaction } from "./finance.js";
import { callGoogleBridge, enqueueIntegration } from "./integrations.js";
import { integrityIssues, runIntegrity } from "./reports.js";
import { appError, assertOwner, canonicalJson, nowIso, publicRow, sanitizeText, uuid } from "./core.js";

const BACKUP_TABLES = [
  "system_config", "users", "accounts", "categories", "envelope_rules", "envelope_periods",
  "recurring_rules", "recurring_occurrences", "savings_goals", "transactions", "envelope_movements",
  "budgets", "goal_movements", "reconciliations", "period_closures", "audit_log", "idempotency_keys",
];
const RESTORE_DELETE_ORDER = [
  "notification_queue", "integration_links", "integration_outbox", "request_nonces", "goal_movements", "budgets", "envelope_movements",
  "transactions", "recurring_occurrences", "recurring_rules", "envelope_periods", "envelope_rules", "savings_goals",
  "reconciliations", "period_closures", "categories", "accounts", "push_subscriptions", "idempotency_keys",
];
const MAX_BACKUP_COMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES = 100 * 1024 * 1024;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const quoted = (name) => {
  if (!IDENTIFIER.test(name)) throw appError("BACKUP_SCHEMA_INVALID", "Nama tabel backup tidak valid.", 400);
  return `"${name}"`;
};
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const expiry = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();

const ensureBackupAudit = async (db, context, backupId, details, enabled) => {
  if (!enabled) return;
  const existing = await db.one("SELECT audit_id FROM audit_log WHERE action=? AND entity_type='backup' AND entity_id=? LIMIT 1", [context.action, backupId]);
  if (!existing) await appendAudit(db, context, { entityType: "backup", entityId: backupId, next: details });
};

const snapshotDatabase = async (db) => db.transaction(async (tx) => {
  const results = await tx.batch(BACKUP_TABLES.map((table) => ({ sql: `SELECT * FROM ${quoted(table)}` })));
  const tables = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, results[index].rows]));
  const manifest = {
    format: "saldo-bersama-backup",
    version: 3,
    schemaVersion: 3,
    createdAt: nowIso(),
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table].length])),
  };
  const payload = { manifest, tables };
  const checksum = digest(canonicalJson(payload));
  return { ...payload, checksum };
});

const encodeBackup = (snapshot) => gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8"), { level: 9 }).toString("base64");
const decodeBackup = (base64) => {
  try {
    const compressed = Buffer.from(String(base64 || ""), "base64");
    if (!compressed.length || compressed.length > MAX_BACKUP_COMPRESSED_BYTES) throw appError("BACKUP_SIZE_INVALID", "Ukuran backup tidak valid.", 413);
    const json = gunzipSync(compressed, { maxOutputLength: MAX_BACKUP_JSON_BYTES }).toString("utf8");
    return JSON.parse(json);
  } catch (error) {
    if (error?.code) throw error;
    throw appError("BACKUP_CORRUPT", "Isi backup tidak dapat dibaca.", 400);
  }
};

const validateSnapshot = (snapshot) => {
  if (!snapshot || snapshot.manifest?.format !== "saldo-bersama-backup" || Number(snapshot.manifest?.schemaVersion) !== 3 || !snapshot.tables) {
    throw appError("BACKUP_SCHEMA_UNSUPPORTED", "Format atau versi backup tidak didukung.", 409);
  }
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(snapshot.tables[table])) throw appError("BACKUP_TABLE_MISSING", `Tabel ${table} tidak tersedia pada backup.`, 409);
    if (Number(snapshot.manifest.tables?.[table]) !== snapshot.tables[table].length) throw appError("BACKUP_COUNT_INVALID", `Jumlah baris tabel ${table} tidak sesuai manifest.`, 409);
    if (snapshot.tables[table].some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw appError("BACKUP_ROW_INVALID", `Isi tabel ${table} tidak valid.`, 409);
  }
  const checksum = snapshot.checksum;
  const copy = { manifest: snapshot.manifest, tables: snapshot.tables };
  if (!checksum || digest(canonicalJson(copy)) !== checksum) throw appError("BACKUP_CHECKSUM_INVALID", "Checksum backup tidak sesuai.", 409);
  return checksum;
};

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
  const proposedFileName = `saldo-bersama-backup-v3-${timestamp}-${backupId.slice(-8)}.json.gz`;
  await db.execute(`INSERT OR IGNORE INTO backup_runs(backup_id,backup_type,external_file_id,file_name,schema_version,status,checksum,created_by,created_at,verified_at,error_code)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [backupId, backupType, null, proposedFileName, 3, "pending", snapshot.checksum, context.actor.user_id, nowIso(), null, null]);
  existing = await db.one("SELECT * FROM backup_runs WHERE backup_id=?", [backupId]);
  if (existing?.status === "verified" && existing.external_file_id) {
    await ensureBackupAudit(db, context, backupId, { fileName: existing.file_name, status: "verified", checksum: existing.checksum }, audit);
    return { backupId, fileId: existing.external_file_id, fileName: existing.file_name, checksum: existing.checksum, status: "verified", replayed: true };
  }
  const fileName = existing?.file_name || proposedFileName;
  await db.execute("UPDATE backup_runs SET status='pending',checksum=?,error_code=NULL WHERE backup_id=? AND status<>'verified'", [snapshot.checksum, backupId]);
  try {
    const stored = await callGoogleBridge("backup.store", { backupId, fileName, contentBase64: encodeBackup(snapshot), checksum: snapshot.checksum, folderId: process.env.BACKUP_FOLDER_ID || "" });
    if (!stored?.fileId) throw appError("BACKUP_STORE_FAILED", "Google Drive tidak mengembalikan file backup.", 503);
    await db.execute("UPDATE backup_runs SET external_file_id=?,status='verified',checksum=?,verified_at=?,error_code=NULL WHERE backup_id=?", [stored.fileId, snapshot.checksum, nowIso(), backupId]);
    await ensureBackupAudit(db, context, backupId, { fileName, status: "verified", checksum: snapshot.checksum }, audit);
    return { backupId, fileId: stored.fileId, fileName, checksum: snapshot.checksum, status: "verified" };
  } catch (error) {
    await db.execute("UPDATE backup_runs SET status='failed',error_code=? WHERE backup_id=? AND status<>'verified'", [sanitizeText(error.code || "BACKUP_FAILED", 80), backupId]);
    throw error;
  }
};

const readBackupFromDrive = async (db, externalFileId) => {
  const run = await db.one("SELECT * FROM backup_runs WHERE external_file_id=? AND status IN ('verified','completed')", [externalFileId]);
  if (!run) throw appError("BACKUP_NOT_FOUND", "Backup terverifikasi tidak ditemukan.", 404);
  const file = await callGoogleBridge("backup.read", { fileId: externalFileId });
  const snapshot = decodeBackup(file?.contentBase64);
  const checksum = validateSnapshot(snapshot);
  if (run.checksum && run.checksum !== checksum) throw appError("BACKUP_CHECKSUM_INVALID", "Checksum Drive berbeda dengan catatan backup.", 409);
  return { run, snapshot, checksum };
};

export const previewRestore = async (db, context) => {
  assertOwner(context.actor);
  const fileId = sanitizeText(context.payload?.backupFileId, 200);
  const { run, snapshot, checksum } = await readBackupFromDrive(db, fileId);
  const summary = { schemaVersion: snapshot.manifest.schemaVersion, createdAt: snapshot.manifest.createdAt, tables: snapshot.manifest.tables, fileName: run.file_name };
  const previewId = uuid();
  const createdAt = nowIso();
  await db.execute("DELETE FROM restore_previews WHERE expires_at<?", [createdAt]);
  await db.execute("INSERT INTO restore_previews(preview_id,backup_id,actor_id,checksum,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,'pending',NULL,NULL,?,?)", [previewId, run.backup_id, context.actor.user_id, checksum, canonicalJson(summary), expiry(10), createdAt]);
  return { previewToken: previewId, ...summary };
};

const insertRows = async (tx, table, rows, { mode = "INSERT" } = {}) => {
  if (!rows.length) return;
  const statements = rows.map((row) => {
    const columns = Object.keys(row);
    return { sql: `${mode} INTO ${quoted(table)}(${columns.map(quoted).join(",")}) VALUES(${columns.map(() => "?").join(",")})`, args: columns.map((column) => row[column]) };
  });
  for (let offset = 0; offset < statements.length; offset += 100) await tx.batch(statements.slice(offset, offset + 100));
};

export const applyRestore = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  if (p.confirmation !== "RESTORE SALDO BERSAMA") throw appError("CONFIRMATION_REQUIRED", "Konfirmasi restore tidak sesuai.", 400);
  const preview = await db.one("SELECT * FROM restore_previews WHERE preview_id=? AND actor_id=?", [p.previewToken, context.actor.user_id]);
  if (!preview) throw appError("RESTORE_PREVIEW_EXPIRED", "Preview restore tidak ditemukan.", 409);
  if (preview.status === "applied" && preview.result_json) return JSON.parse(preview.result_json);
  if (preview.expires_at <= nowIso()) throw appError("RESTORE_PREVIEW_EXPIRED", "Preview restore sudah kedaluwarsa.", 409);
  const { run, snapshot, checksum } = await readBackupFromDrive(db, sanitizeText(p.backupFileId, 200));
  if (run.backup_id !== preview.backup_id || checksum !== preview.checksum) throw appError("RESTORE_PREVIEW_CHANGED", "Backup berbeda dari preview yang disetujui.", 409);
  const safety = await createTechnicalBackup(db, { ...context, action: "backup.safety" }, { type: "pre-restore", audit: true });
  const currentUsers = await db.all("SELECT user_id,email,firebase_uid,role,status,row_version FROM users");
  const currentByEmail = new Map(currentUsers.map((user) => [String(user.email || "").toLowerCase(), user]));
  const allowedRoleByEmail = new Map((context.allowedUsers || []).map((user) => [String(user.email || "").toLowerCase(), user.role]));
  for (const backupUser of snapshot.tables.users) {
    const current = currentByEmail.get(String(backupUser.email || "").toLowerCase());
    if (current && current.user_id !== backupUser.user_id) throw appError("RESTORE_IDENTITY_CONFLICT", "Backup memakai ID pengguna berbeda untuk email yang masih aktif. Restore dibatalkan agar referensi kepemilikan tidak tertukar.", 409, { email: backupUser.email });
  }
  const maintenanceLock = await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode' AND value='false'", [nowIso()]);
  if (maintenanceLock.rowsAffected !== 1) throw appError("MAINTENANCE_MODE", "Restore lain atau proses pemulihan sedang aktif. Selesaikan integrity recovery sebelum mencoba lagi.", 409);
  const result = { restored: true, backupId: run.backup_id, safetyBackupId: safety.backupId, checksum };
  try {
    await db.transaction(async (tx) => {
      const claim = await tx.execute("UPDATE restore_previews SET status='applying' WHERE preview_id=? AND status='pending'", [preview.preview_id]);
      if (claim.rowsAffected !== 1) throw appError("RESTORE_IN_PROGRESS", "Preview restore sudah diproses oleh request lain.", 409);
      await tx.batch(RESTORE_DELETE_ORDER.map((table) => ({ sql: `DELETE FROM ${quoted(table)}` })));
      for (const user of snapshot.tables.users) {
        const email = String(user.email || "").trim().toLowerCase();
        const current = currentByEmail.get(email);
        const allowedRole = allowedRoleByEmail.get(email);
        const isActor = email === String(context.actor.email || "").toLowerCase();
        const firebaseUid = isActor ? context.signedActor.uid : (current?.firebase_uid || null);
        const role = isActor ? context.actor.role : (allowedRole || current?.role || user.role);
        const status = isActor ? "active" : (allowedRole ? (current?.status || user.status) : "inactive");
        const rowVersion = Math.max(Number(user.row_version || 1), Number(current?.row_version || 0)) + 1;
        await tx.execute(`INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET firebase_uid=excluded.firebase_uid,email=excluded.email,name=excluded.name,role=excluded.role,status=excluded.status,row_version=excluded.row_version,updated_at=excluded.updated_at`,
        [user.user_id, firebaseUid, email, user.name, role, status, rowVersion, user.created_at, nowIso()]);
      }
      const restoredUserIds = new Set(snapshot.tables.users.map((user) => user.user_id));
      for (const current of currentUsers) {
        if (restoredUserIds.has(current.user_id) || current.user_id === context.actor.user_id) continue;
        const allowedRole = allowedRoleByEmail.get(String(current.email || "").toLowerCase());
        const nextStatus = allowedRole ? current.status : "inactive";
        const nextRole = allowedRole || current.role;
        await tx.execute("UPDATE users SET role=?,status=?,row_version=row_version+1,updated_at=? WHERE user_id=?", [nextRole, nextStatus, nowIso(), current.user_id]);
      }
      for (const table of ["accounts", "categories", "envelope_rules", "envelope_periods", "recurring_rules", "recurring_occurrences", "savings_goals", "transactions", "envelope_movements", "budgets", "goal_movements", "reconciliations", "period_closures", "idempotency_keys"]) await insertRows(tx, table, snapshot.tables[table]);
      await insertRows(tx, "audit_log", snapshot.tables.audit_log, { mode: "INSERT OR IGNORE" });
      for (const row of snapshot.tables.system_config) {
        if (row.key === "maintenance_mode") continue;
        await tx.execute("INSERT INTO system_config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", [row.key, row.value, row.updated_at]);
      }
      const issues = await integrityIssues(tx);
      if (issues.length) throw appError("RESTORE_INTEGRITY_FAILED", "Restore dibatalkan karena integrity check gagal.", 409, issues);
      await appendAudit(tx, { ...context, action: "restore.apply" }, { entityType: "restore", entityId: run.backup_id, next: { checksum, safetyBackupId: safety.backupId } });
      await enqueueIntegration(tx, "sheets", "rebuild", "system", "mirror", { reason: "restore", backupId: run.backup_id });
      await enqueueIntegration(tx, "calendar", "rebuild", "system", "calendar", { reason: "restore", backupId: run.backup_id });
      await tx.execute("UPDATE restore_previews SET status='applied',result_json=?,applied_at=?,expires_at=? WHERE preview_id=? AND status='applying'", [canonicalJson(result), nowIso(), expiry(30 * 24 * 60), preview.preview_id]);
      await tx.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
    });
    return result;
  } catch (error) {
    // Fail closed: maintenance tetap aktif sampai owner menjalankan recovery/integrity.
    throw error;
  }
};

export const previewImport = async (db, context) => {
  assertOwner(context.actor);
  const records = context.payload?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 50) throw appError("INVALID_IMPORT", "Import harus berisi 1-50 transaksi agar apply tetap atomik dan aman pada runtime serverless.", 400);
  const valid = []; const invalid = []; const duplicates = []; const fingerprints = new Set();
  for (let index = 0; index < records.length; index += 1) {
    try {
      const normalized = await normalizeTransaction(db, context, records[index]);
      const fingerprint = digest(canonicalJson([normalized.transaction_date, normalized.transaction_type, normalized.source_account_id || "", normalized.destination_account_id || "", normalized.amount, normalized.description.toLowerCase()]));
      if (fingerprints.has(fingerprint)) duplicates.push({ index, record: normalized });
      else { fingerprints.add(fingerprint); valid.push({ index, record: normalized }); }
    } catch (error) {
      if (error.code === "POSSIBLE_DUPLICATE") duplicates.push({ index, record: records[index] });
      else invalid.push({ index, code: error.code || "INVALID_RECORD", message: error.message });
    }
  }
  const acceptable = valid.length > 0 && !invalid.length && !duplicates.length;
  const previewId = uuid();
  const normalizedRecords = valid.map((item) => item.record);
  const fingerprint = digest(canonicalJson(normalizedRecords));
  const summary = { validCount: valid.length, invalid, duplicates, acceptable };
  await db.execute("DELETE FROM import_previews WHERE expires_at<?", [nowIso()]);
  await db.execute("INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,'pending',NULL,NULL,?,?)", [previewId, context.actor.user_id, canonicalJson(normalizedRecords), fingerprint, canonicalJson(summary), expiry(15), nowIso()]);
  return { previewToken: previewId, fingerprint, ...summary };
};

export const applyImport = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  if (p.confirmation !== "IMPORT TRANSAKSI") throw appError("CONFIRMATION_REQUIRED", "Konfirmasi import tidak sesuai.", 400);
  const preview = await db.one("SELECT * FROM import_previews WHERE preview_id=? AND actor_id=?", [p.previewToken, context.actor.user_id]);
  if (!preview) throw appError("IMPORT_PREVIEW_EXPIRED", "Preview import tidak ditemukan.", 409);
  if (preview.status === "applied" && preview.result_json) return JSON.parse(preview.result_json);
  if (preview.expires_at <= nowIso()) throw appError("IMPORT_PREVIEW_EXPIRED", "Preview import sudah kedaluwarsa.", 409);
  const records = JSON.parse(preview.records_json || "[]");
  if (digest(canonicalJson(records)) !== preview.fingerprint) throw appError("IMPORT_PREVIEW_CHANGED", "Isi preview import berubah.", 409);
  const safety = await createTechnicalBackup(db, { ...context, action: "backup.preImport" }, { type: "pre-import", audit: true });
  return db.transaction(async (tx) => {
    const claim = await tx.execute("UPDATE import_previews SET status='applying' WHERE preview_id=? AND status='pending'", [preview.preview_id]);
    if (claim.rowsAffected !== 1) {
      const latest = await tx.one("SELECT status,result_json FROM import_previews WHERE preview_id=?", [preview.preview_id]);
      if (latest?.status === "applied" && latest.result_json) return JSON.parse(latest.result_json);
      throw appError("IMPORT_IN_PROGRESS", "Preview import sedang diproses oleh request lain.", 409);
    }
    const created = [];
    for (let index = 0; index < records.length; index += 1) created.push(await createTransactionInternal(tx, { ...context, action: "import.apply", idempotencyKey: `import:${preview.preview_id}:${index}` }, records[index], { audit: false }));
    const result = { applied: created.length, transactionIds: created.map((row) => row.transaction_id), safetyBackupId: safety.backupId };
    await appendAudit(tx, context, { entityType: "import", entityId: preview.preview_id, next: { count: created.length, safetyBackupId: safety.backupId, fingerprint: preview.fingerprint } });
    await tx.execute("UPDATE import_previews SET status='applied',result_json=?,applied_at=?,expires_at=? WHERE preview_id=? AND status='applying'", [canonicalJson(result), nowIso(), expiry(30 * 24 * 60), preview.preview_id]);
    return result;
  });
};

export const integrityWithMaintenanceRecovery = async (db, context) => {
  assertOwner(context.actor);
  const result = await runIntegrity(db, context);
  if (result.ok && context.payload?.clearMaintenance === true) await db.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
  return result;
};

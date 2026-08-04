import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { DATABASE_SCHEMA_VERSION } from "../../db/schema.js";
import { appendAudit } from "../audit.js";
import { appError, canonicalJson, nowIso } from "../core.js";

const SUPPORTED_BACKUP_SCHEMA_VERSIONS = new Set([3, 4, DATABASE_SCHEMA_VERSION]);
const BANK_TEMPLATES = new Set(["generic", "bca", "bni", "btn", "mandiri", "permata"]);

export const BACKUP_TABLES = [
  "system_config", "users", "accounts", "categories", "envelope_rules", "envelope_periods",
  "recurring_rules", "recurring_occurrences", "savings_goals", "transactions", "envelope_movements",
  "budgets", "goal_movements", "reconciliations", "period_closures", "audit_log", "idempotency_keys",
];

export const RESTORE_DELETE_ORDER = [
  "notification_queue", "integration_links", "integration_outbox", "request_nonces", "goal_movements", "budgets", "envelope_movements",
  "transactions", "recurring_occurrences", "recurring_rules", "envelope_periods", "envelope_rules", "savings_goals",
  "reconciliations", "period_closures", "categories", "accounts", "push_subscriptions", "idempotency_keys",
];

const MAX_BACKUP_COMPRESSED_BYTES = 20 * 1024 * 1024;

const MAX_BACKUP_JSON_BYTES = 100 * 1024 * 1024;

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export const quoted = (name) => {
  if (!IDENTIFIER.test(name)) throw appError("BACKUP_SCHEMA_INVALID", "Nama tabel backup tidak valid.", 400);
  return `"${name}"`;
};

export const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export const expiry = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();

export const ensureBackupAudit = async (db, context, backupId, details, enabled) => {
  if (!enabled) return;
  const existing = await db.one("SELECT audit_id FROM audit_log WHERE action=? AND entity_type='backup' AND entity_id=? LIMIT 1", [context.action, backupId]);
  if (!existing) await appendAudit(db, context, { entityType: "backup", entityId: backupId, next: details });
};

export const snapshotDatabase = async (db) => db.transaction(async (tx) => {
  const results = await tx.batch(BACKUP_TABLES.map((table) => ({ sql: `SELECT * FROM ${quoted(table)}` })));
  const tables = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, results[index].rows]));
  const manifest = {
    format: "saldo-bersama-backup",
    version: DATABASE_SCHEMA_VERSION,
    schemaVersion: DATABASE_SCHEMA_VERSION,
    createdAt: nowIso(),
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table].length])),
  };
  const payload = { manifest, tables };
  const checksum = digest(canonicalJson(payload));
  return { ...payload, checksum };
});

export const encodeBackup = (snapshot) => gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8"), { level: 9 }).toString("base64");

export const decodeBackup = (base64) => {
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

export const validateSnapshot = (snapshot) => {
  if (!snapshot || snapshot.manifest?.format !== "saldo-bersama-backup" || !SUPPORTED_BACKUP_SCHEMA_VERSIONS.has(Number(snapshot.manifest?.schemaVersion)) || !snapshot.tables) {
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


const legacyBankTemplate = (row = {}) => {
  if (String(row.account_type || "") !== "bank") return "generic";
  const name = String(row.name || "").trim().toLowerCase();
  for (const template of ["bca", "bni", "btn", "mandiri", "permata"]) {
    if (name.endsWith(` · ${template}`) || name.endsWith(` - ${template}`)) return template;
  }
  return "generic";
};

export const normalizeRestoredRows = (table, rows) => {
  if (table !== "accounts") return rows;
  return rows.map((row) => {
    const accountType = String(row.account_type || "");
    if (Object.hasOwn(row, "bank_template")) {
      const template = String(row.bank_template || "").toLowerCase();
      if (!BANK_TEMPLATES.has(template) || (accountType !== "bank" && template !== "generic")) {
        throw appError("BACKUP_ROW_INVALID", "Template kartu pada backup tidak valid untuk jenis rekening.", 409);
      }
      return { ...row, bank_template: template };
    }
    return { ...row, bank_template: legacyBankTemplate(row) };
  });
};

export const insertRows = async (tx, table, rows, { mode = "INSERT" } = {}) => {
  if (!rows.length) return;
  const statements = rows.map((row) => {
    const columns = Object.keys(row);
    return { sql: `${mode} INTO ${quoted(table)}(${columns.map(quoted).join(",")}) VALUES(${columns.map(() => "?").join(",")})`, args: columns.map((column) => row[column]) };
  });
  for (let offset = 0; offset < statements.length; offset += 100) await tx.batch(statements.slice(offset, offset + 100));
};

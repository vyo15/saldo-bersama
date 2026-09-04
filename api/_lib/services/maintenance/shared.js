import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { DATABASE_SCHEMA_VERSION } from "../../db/schema.js";
import { BANK_TEMPLATE_VALUES, EWALLET_TEMPLATE_VALUES } from "../../domainConstants.js";
import { appendAudit } from "../audit.js";
import { appError, canonicalJson, nowIso, parseJson } from "../core.js";

const SUPPORTED_BACKUP_SCHEMA_VERSIONS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, DATABASE_SCHEMA_VERSION]);
const BANK_TEMPLATES = new Set(BANK_TEMPLATE_VALUES);
const EWALLET_TEMPLATES = new Set(EWALLET_TEMPLATE_VALUES);

export const BACKUP_TABLES = [
  "system_config", "users", "accounts", "categories", "investment_instruments", "investment_portfolios", "master_data_requests", "transfer_requests", "envelope_rules", "envelope_periods",
  "recurring_rules", "recurring_occurrences", "savings_goals", "transactions", "investment_trades", "investment_valuations", "investment_reconciliations", "investment_corrections", "envelope_movements",
  "budgets", "goal_movements", "reconciliations", "period_closures", "notification_preferences", "manual_reminders", "audit_log", "idempotency_keys",
];

export const RESTORE_DELETE_ORDER = [
  "notification_deliveries", "notification_queue", "integration_links", "integration_outbox", "request_nonces", "rate_limit_buckets", "goal_movements", "budgets", "envelope_movements",
  "investment_reconciliations", "investment_valuations", "investment_corrections", "investment_trades", "transactions", "recurring_occurrences", "recurring_rules", "envelope_periods", "envelope_rules", "savings_goals",
  "reconciliations", "period_closures", "transfer_requests", "master_data_requests", "investment_portfolios", "investment_instruments", "categories", "accounts", "manual_reminders", "notification_preferences", "push_subscriptions", "idempotency_keys",
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


export const maintenanceBackupIdForIntent = ({ actorId, idempotencyKey, backupType }) => idempotencyKey
  ? `bkp_${digest(`${actorId}:backup.safety:${backupType}:${idempotencyKey}`).slice(0, 32)}`
  : null;

export const decodeMaintenanceIdempotency = (row) => {
  if (!row) return { state: "missing", result: null };
  const value = parseJson(row.response_json, {});
  const state = value?.__idempotency_state;
  if (state === "processing" || state === "unknown") return { state, result: null };
  return { state: "completed", result: value };
};

export const selectMaintenanceIntentRow = (rows, requestedKey) => requestedKey
  ? rows?.[0] || null
  : rows?.find((row) => ["processing", "unknown"].includes(decodeMaintenanceIdempotency(row).state)) || null;

export const resolveMaintenanceOutcome = ({ committed, intentState, maintenanceMode, requestedKey }) => {
  if (committed) return "committed";
  if (intentState === "processing") return "processing";
  if (maintenanceMode) return "recovery_required";
  if (intentState === "unknown" || (requestedKey && intentState === "missing")) return "not_committed";
  return "idle";
};

export const preferredMaintenanceValue = (primary, secondary, key, fallback = null) => {
  if (primary && primary[key] !== undefined && primary[key] !== null) return primary[key];
  if (secondary && secondary[key] !== undefined && secondary[key] !== null) return secondary[key];
  return fallback;
};

export const maintenanceIntentPresentation = (intentRow, intent) => {
  if (!intentRow) return null;
  return { state: intent.state, createdAt: intentRow.created_at, expiresAt: intentRow.expires_at };
};

export const maintenanceBackupPresentation = (backup) => backup ? {
  backupId: backup.backup_id,
  status: backup.status,
  fileId: backup.external_file_id || null,
  verifiedAt: backup.verified_at || null,
  errorCode: backup.error_code || null,
  createdAt: backup.created_at || null,
} : null;

export const maintenanceStatusPresentation = ({ state, intentRow, intent, commit, requestedKey, committedReset, currentSummary }) => {
  const outcome = resolveMaintenanceOutcome({
    committed: commit.committed,
    intentState: intent.state,
    maintenanceMode: state.maintenanceMode,
    requestedKey,
  });
  return {
    checkedAt: nowIso(),
    outcome,
    requiresAttention: ["processing", "recovery_required"].includes(outcome),
    canStartNewIntent: state.maintenanceMode ? false : outcome !== "processing",
    maintenanceMode: state.maintenanceMode,
    intent: maintenanceIntentPresentation(intentRow, intent),
    backup: maintenanceBackupPresentation(commit.backup),
    committedReset,
    currentSummary,
  };
};

export const claimMaintenanceMode = async (db, busyMessage) => {
  const result = await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode' AND value='false'", [nowIso()]);
  if (result.rowsAffected !== 1) throw appError("MAINTENANCE_MODE", busyMessage, 409);
};

export const releaseMaintenanceMode = async (db, failureMessage) => {
  const result = await db.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode' AND value='true'", [nowIso()]);
  if (result.rowsAffected !== 1) throw appError("MAINTENANCE_MODE", failureMessage, 409);
};

export const clearMaintenanceMode = async (db) => {
  await db.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
};

export const ensureBackupAudit = async (db, context, backupId, details, enabled) => {
  if (!enabled) return;
  const existing = await db.one("SELECT audit_id FROM audit_log WHERE action=? AND entity_type='backup' AND entity_id=? LIMIT 1", [context.action, backupId]);
  if (!existing) await appendAudit(db, context, { entityType: "backup", entityId: backupId, next: details });
};

const TRANSIENT_SYSTEM_CONFIG_KEYS = new Set([
  "maintenance_mode",
  "database_environment",
  "scheduler_last_run_at",
  "scheduler_last_success_at",
  "scheduler_last_failure_at",
  "scheduler_last_error_code",
]);

export const snapshotDatabase = async (db) => db.transaction(async (tx) => {
  const results = await tx.batch(BACKUP_TABLES.map((table) => ({ sql: `SELECT * FROM ${quoted(table)}` })));
  const tables = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, results[index].rows]));
  tables.system_config = tables.system_config.filter((row) => !TRANSIENT_SYSTEM_CONFIG_KEYS.has(String(row.key || "")));
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

const gzipWithOriginalName = (buffer, fileName) => {
  const compressed = gzipSync(buffer, { level: 9 });
  const cleanName = String(fileName || "saldo-bersama-backup.json")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 160) || "saldo-bersama-backup.json";
  const header = Buffer.from(compressed.subarray(0, 10));
  header[3] |= 0x08;
  return Buffer.concat([header, Buffer.from(`${cleanName}\0`, "latin1"), compressed.subarray(10)]);
};

export const encodeBackup = (snapshot, fileName = "saldo-bersama-backup.json") => gzipWithOriginalName(
  Buffer.from(JSON.stringify(snapshot), "utf8"),
  fileName,
).toString("base64");

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

const isLegacyOptionalBackupTable = (schemaVersion, table) => (
  (schemaVersion < 7 && table === "notification_preferences")
  || (schemaVersion < 10 && table === "manual_reminders")
  || (schemaVersion < 14 && ["master_data_requests", "transfer_requests"].includes(table))
  || (schemaVersion < 15 && ["investment_instruments", "investment_portfolios", "investment_trades", "investment_valuations", "investment_reconciliations", "investment_corrections"].includes(table))
);

export const validateSnapshot = (snapshot) => {
  if (!snapshot || snapshot.manifest?.format !== "saldo-bersama-backup" || !SUPPORTED_BACKUP_SCHEMA_VERSIONS.has(Number(snapshot.manifest?.schemaVersion)) || !snapshot.tables) {
    throw appError("BACKUP_SCHEMA_UNSUPPORTED", "Format atau versi backup tidak didukung.", 409);
  }
  const schemaVersion = Number(snapshot.manifest.schemaVersion);
  for (const table of BACKUP_TABLES) {
    const legacyOptional = isLegacyOptionalBackupTable(schemaVersion, table);
    if (!Array.isArray(snapshot.tables[table])) {
      if (legacyOptional) continue;
      throw appError("BACKUP_TABLE_MISSING", `Tabel ${table} tidak tersedia pada backup.`, 409);
    }
    if (!legacyOptional || snapshot.manifest.tables?.[table] !== undefined) {
      if (Number(snapshot.manifest.tables?.[table]) !== snapshot.tables[table].length) throw appError("BACKUP_COUNT_INVALID", `Jumlah baris tabel ${table} tidak sesuai manifest.`, 409);
    }
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

const legacyEwalletTemplate = (row = {}) => {
  if (String(row.account_type || "") !== "ewallet") return "generic";
  const name = String(row.name || "").trim();
  if (/\bshopee\s*pay\b|\bshopeepay\b/i.test(name)) return "shopeepay";
  if (/\bDANA\b/.test(name)) return "dana";
  if (/\bgo\s*pay\b|\bgopay\b/i.test(name)) return "gopay";
  if (/\bovo\b/i.test(name)) return "ovo";
  if (/\blink\s*aja!?\b|\blinkaja\b/i.test(name)) return "linkaja";
  return "generic";
};

const normalizedStoredTemplate = ({ row, accountType, field, allowed, requiredType, legacyValue, label }) => {
  if (!Object.hasOwn(row, field)) return legacyValue;
  const template = String(row[field] || "").toLowerCase();
  if (!allowed.has(template) || (accountType !== requiredType && template !== "generic")) {
    throw appError("BACKUP_ROW_INVALID", `${label} pada backup tidak valid untuk jenis rekening.`, 409);
  }
  return template;
};

export const normalizeRestoredRows = (table, rows) => {
  if (table === "transactions") {
    return rows.map((row) => ({
      ...row,
      cost_share_mode: Object.hasOwn(row, "cost_share_mode") ? String(row.cost_share_mode || "unspecified") : "unspecified",
      cost_share_json: Object.hasOwn(row, "cost_share_json") ? String(row.cost_share_json || "[]") : "[]",
    }));
  }
  if (table === "envelope_rules") {
    return rows.map((row) => ({
      ...row,
      assignee_user_id: Object.hasOwn(row, "assignee_user_id")
        ? row.assignee_user_id || null
        : row.scope === "personal" ? row.owner_user_id || null : null,
    }));
  }
  if (table === "investment_trades") {
    return rows.map((row) => ({ ...row, notes: Object.hasOwn(row, "notes") ? String(row.notes || "") : "" }));
  }
  if (table === "investment_corrections") {
    return rows.map((row) => ({
      ...row,
      correction_type: Object.hasOwn(row, "correction_type") ? String(row.correction_type || "correction") : "correction",
      reference_price: Object.hasOwn(row, "reference_price") ? Number(row.reference_price || 0) : 0,
      notes: Object.hasOwn(row, "notes") ? String(row.notes || "") : "",
    }));
  }
  if (table !== "accounts") return rows;
  return rows.map((row) => {
    const accountType = String(row.account_type || "");
    const bankTemplate = normalizedStoredTemplate({
      row, accountType, field: "bank_template", allowed: BANK_TEMPLATES, requiredType: "bank",
      legacyValue: legacyBankTemplate(row), label: "Template kartu bank",
    });
    const ewalletTemplate = normalizedStoredTemplate({
      row, accountType, field: "ewallet_template", allowed: EWALLET_TEMPLATES, requiredType: "ewallet",
      legacyValue: legacyEwalletTemplate(row), label: "Provider E-wallet",
    });
    return { ...row, bank_template: bankTemplate, ewallet_template: ewalletTemplate };
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

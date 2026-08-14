import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { enqueueIntegration } from "../integrations.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, canonicalJson, nowIso, parseJson, sanitizeText, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import {
  claimMaintenanceMode,
  clearMaintenanceMode,
  decodeMaintenanceIdempotency,
  digest,
  maintenanceBackupIdForIntent,
  maintenanceBackupPresentation,
  quoted,
  releaseMaintenanceMode,
  resolveMaintenanceOutcome,
  selectMaintenanceIntentRow,
} from "./shared.js";

export const FULL_RESET_CONFIRMATION = "RESET SEMUA DATA SALDO BERSAMA";

const FULL_RESET_DOMAIN_TABLES = Object.freeze([
  { table: "goal_movements", orderBy: "goal_movement_id", key: "goalMovements" },
  { table: "budgets", orderBy: "budget_id", key: "budgets" },
  { table: "envelope_movements", orderBy: "movement_id", key: "allocationMovements" },
  { table: "transactions", orderBy: "transaction_id", key: "transactions" },
  { table: "recurring_occurrences", orderBy: "occurrence_id", key: "recurringOccurrences" },
  { table: "recurring_rules", orderBy: "recurring_rule_id", key: "recurringRules" },
  { table: "envelope_periods", orderBy: "envelope_period_id", key: "allocationPeriods" },
  { table: "envelope_rules", orderBy: "envelope_rule_id", key: "allocationRules" },
  { table: "savings_goals", orderBy: "goal_id", key: "goals" },
  { table: "reconciliations", orderBy: "reconciliation_id", key: "reconciliations" },
  { table: "period_closures", orderBy: "closure_id", key: "periodClosures" },
]);

const FULL_RESET_MASTER_TABLES = Object.freeze([
  { table: "categories", orderBy: "category_id", key: "categories" },
  { table: "accounts", orderBy: "account_id", key: "accounts" },
]);

const FULL_RESET_OPERATIONAL_TABLES = Object.freeze([
  { table: "notification_deliveries", orderBy: "delivery_id", key: "notificationDeliveries" },
  { table: "notification_queue", orderBy: "notification_id", key: "notificationQueue" },
  { table: "integration_links", orderBy: "link_id", key: "integrationLinks" },
  { table: "integration_outbox", orderBy: "outbox_id", key: "integrationOutbox" },
  { table: "notification_preferences", orderBy: "user_id,notification_type", key: "notificationPreferences" },
  { table: "push_subscriptions", orderBy: "subscription_id", key: "pushSubscriptions" },
  { table: "import_previews", orderBy: "preview_id", key: "importPreviews" },
  { table: "restore_previews", orderBy: "preview_id", key: "restorePreviews" },
]);

const FULL_RESET_TABLES = Object.freeze([
  ...FULL_RESET_DOMAIN_TABLES,
  ...FULL_RESET_MASTER_TABLES,
  ...FULL_RESET_OPERATIONAL_TABLES,
]);

const FULL_RESET_GENERATED_OUTBOX_PREDICATE = `(
  entity_type='system'
  AND event_type='rebuild'
  AND ((provider='sheets' AND entity_id='mirror') OR (provider='calendar' AND entity_id='calendar'))
  AND json_extract(CASE WHEN json_valid(payload_json)=1 THEN payload_json ELSE '{}' END,'$.reason')='full-reset'
)`;

const FULL_RESET_DELETE_ORDER = Object.freeze([
  "notification_deliveries",
  "notification_queue",
  "integration_links",
  "integration_outbox",
  "goal_movements",
  "budgets",
  "envelope_movements",
  "transactions",
  "recurring_occurrences",
  "recurring_rules",
  "envelope_periods",
  "envelope_rules",
  "savings_goals",
  "reconciliations",
  "period_closures",
  "notification_preferences",
  "push_subscriptions",
  "import_previews",
  "restore_previews",
  "categories",
  "accounts",
]);

const FULL_RESET_STATE_STATEMENTS = Object.freeze(FULL_RESET_TABLES.map(({ table, orderBy }) => ({
  sql: table === "integration_outbox"
    ? `SELECT * FROM integration_outbox WHERE NOT ${FULL_RESET_GENERATED_OUTBOX_PREDICATE} ORDER BY ${orderBy.split(",").map((column) => quoted(column)).join(",")}`
    : `SELECT * FROM ${quoted(table)} ORDER BY ${orderBy.split(",").map((column) => quoted(column)).join(",")}`,
  args: [],
})));

const FULL_RESET_COUNT_STATEMENTS = Object.freeze(FULL_RESET_TABLES.map(({ table }) => ({
  sql: table === "integration_outbox"
    ? `SELECT COUNT(*) AS count FROM integration_outbox WHERE NOT ${FULL_RESET_GENERATED_OUTBOX_PREDICATE}`
    : `SELECT COUNT(*) AS count FROM ${quoted(table)}`,
  args: [],
})));

const FULL_RESET_PRESERVED_STATEMENTS = Object.freeze([
  { sql: "SELECT COUNT(*) AS count FROM users", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM audit_log", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM backup_runs", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM integrity_runs", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM idempotency_keys", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM system_config", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM schema_migrations", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM request_nonces", args: [] },
]);

const mapState = (rows) => {
  const rowsByTable = Object.fromEntries(FULL_RESET_TABLES.map(({ table }, index) => [table, rows[index] || []]));
  const counts = Object.fromEntries(FULL_RESET_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  return { counts, fingerprint: digest(canonicalJson(rowsByTable)) };
};

const mapCounts = (rows) => Object.fromEntries(FULL_RESET_TABLES.map(({ table }, index) => [
  table,
  Number(rows[index]?.[0]?.count || 0),
]));

const mapPreserved = (rows) => {
  const [users, audit, backups, integrityRuns, idempotencyKeys, systemConfig, schemaMigrations, requestNonces] = rows.map((items) => items?.[0] || null);
  return {
    users: Number(users?.count || 0),
    audit: Number(audit?.count || 0),
    backups: Number(backups?.count || 0),
    integrityRuns: Number(integrityRuns?.count || 0),
    idempotencyKeys: Number(idempotencyKeys?.count || 0),
    systemConfig: Number(systemConfig?.count || 0),
    schemaMigrations: Number(schemaMigrations?.count || 0),
    requestNonces: Number(requestNonces?.count || 0),
  };
};

const tableCount = (counts, table) => Number(counts[table] || 0);
const groupCount = (counts, descriptors) => descriptors.reduce((sum, { table }) => sum + tableCount(counts, table), 0);

const fullResetSummary = (counts) => {
  const domainRows = groupCount(counts, FULL_RESET_DOMAIN_TABLES);
  const masterRows = groupCount(counts, FULL_RESET_MASTER_TABLES);
  const operationalRows = groupCount(counts, FULL_RESET_OPERATIONAL_TABLES);
  return {
    transactions: tableCount(counts, "transactions"),
    reconciliations: tableCount(counts, "reconciliations"),
    goals: tableCount(counts, "savings_goals"),
    goalMovements: tableCount(counts, "goal_movements"),
    budgets: tableCount(counts, "budgets"),
    allocationRules: tableCount(counts, "envelope_rules"),
    allocationPeriods: tableCount(counts, "envelope_periods"),
    allocationMovements: tableCount(counts, "envelope_movements"),
    recurringRules: tableCount(counts, "recurring_rules"),
    recurringOccurrences: tableCount(counts, "recurring_occurrences"),
    periodClosures: tableCount(counts, "period_closures"),
    accounts: tableCount(counts, "accounts"),
    categories: tableCount(counts, "categories"),
    notificationDeliveries: tableCount(counts, "notification_deliveries"),
    notificationQueue: tableCount(counts, "notification_queue"),
    integrationLinks: tableCount(counts, "integration_links"),
    integrationOutbox: tableCount(counts, "integration_outbox"),
    notificationPreferences: tableCount(counts, "notification_preferences"),
    pushSubscriptions: tableCount(counts, "push_subscriptions"),
    importPreviews: tableCount(counts, "import_previews"),
    restorePreviews: tableCount(counts, "restore_previews"),
    domainRows,
    masterRows,
    operationalRows,
    totalRows: domainRows + masterRows + operationalRows,
  };
};

const readFullResetState = async (db) => mapState(await readBatchRows(db, FULL_RESET_STATE_STATEMENTS));

export const previewFullDataReset = async (db, context) => {
  assertOwner(context.actor);
  const rows = await readBatchRows(db, [...FULL_RESET_STATE_STATEMENTS, ...FULL_RESET_PRESERVED_STATEMENTS]);
  const state = mapState(rows.slice(0, FULL_RESET_STATE_STATEMENTS.length));
  const preserved = mapPreserved(rows.slice(FULL_RESET_STATE_STATEMENTS.length));
  return {
    scope: "full-data-reset",
    previewFingerprint: state.fingerprint,
    previewedAt: nowIso(),
    confirmationPhrase: FULL_RESET_CONFIRMATION,
    summary: fullResetSummary(state.counts),
    preserved,
  };
};

const assertFullResetRequest = (context) => {
  const payload = context.payload || {};
  if (payload.confirmation !== FULL_RESET_CONFIRMATION) {
    throw appError("FULL_RESET_CONFIRMATION_REQUIRED", `Ketik persis ${FULL_RESET_CONFIRMATION} untuk melanjutkan.`, 400);
  }
  if (payload.acknowledged !== true) {
    throw appError("FULL_RESET_ACKNOWLEDGEMENT_REQUIRED", "Seluruh pernyataan pemahaman full reset wajib diselesaikan.", 400);
  }
  const reason = sanitizeText(payload.reason, 200);
  if (reason.length < 5) throw appError("FULL_RESET_REASON_REQUIRED", "Alasan full reset minimal 5 karakter.", 400);
  const previewFingerprint = sanitizeText(payload.previewFingerprint, 128);
  if (!previewFingerprint) throw appError("FULL_RESET_PREVIEW_REQUIRED", "Jalankan preview reset semua data terlebih dahulu.", 409);
  return { reason, previewFingerprint };
};

const assertFullResetPreviewUnchanged = async (db, previewFingerprint) => {
  const state = await readFullResetState(db);
  if (state.fingerprint !== previewFingerprint) {
    throw appError("FULL_RESET_PREVIEW_CHANGED", "Data berubah sejak preview. Jalankan preview reset semua data lagi.", 409);
  }
  return state;
};

const purgeFullResetData = async (tx) => {
  for (const table of FULL_RESET_DELETE_ORDER) {
    if (table === "integration_outbox") {
      await tx.execute(`DELETE FROM integration_outbox WHERE NOT ${FULL_RESET_GENERATED_OUTBOX_PREDICATE}`);
      continue;
    }
    await tx.execute(`DELETE FROM ${quoted(table)}`);
  }
};

const fullResetAuditDetails = (row) => {
  if (!row) return null;
  const previous = parseJson(row.previous_value, {});
  const next = parseJson(row.new_value, {});
  return {
    resetId: row.entity_id,
    resetAt: next.resetAt || row.timestamp,
    summary: previous.summary || null,
    safetyBackupId: next.safetyBackupId || null,
  };
};

const fullResetAuditByBackupId = async (db, actorId, backupId) => {
  if (!backupId) return null;
  return db.one(`SELECT timestamp,entity_id,previous_value,new_value FROM audit_log
    WHERE actor_id=? AND action='fullReset.apply' AND entity_type='maintenance_full_reset' AND result='success'
      AND json_valid(new_value)=1 AND json_extract(new_value,'$.safetyBackupId')=?
    ORDER BY timestamp DESC LIMIT 1`, [actorId, backupId]);
};

export const readFullDataResetStatus = async (db, context) => {
  assertOwner(context.actor);
  const requestedKey = sanitizeText(context.payload?.idempotencyKey, 160);
  const intentSql = requestedKey
    ? "SELECT idempotency_key,response_json,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='fullReset.apply' AND idempotency_key=? AND expires_at>? LIMIT 1"
    : "SELECT idempotency_key,response_json,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='fullReset.apply' AND expires_at>? ORDER BY created_at DESC LIMIT 12";
  const intentArgs = requestedKey
    ? [context.actor.user_id, requestedKey, nowIso()]
    : [context.actor.user_id, nowIso()];
  const rows = await readBatchRows(db, [
    ...FULL_RESET_COUNT_STATEMENTS,
    { sql: "SELECT value FROM system_config WHERE key='maintenance_mode'", args: [] },
    { sql: intentSql, args: intentArgs },
  ]);
  const counts = mapCounts(rows.slice(0, FULL_RESET_COUNT_STATEMENTS.length));
  const offset = FULL_RESET_COUNT_STATEMENTS.length;
  const maintenanceMode = rows[offset]?.[0]?.value === "true";
  const candidates = rows[offset + 1] || [];
  const intentRow = selectMaintenanceIntentRow(candidates, requestedKey);
  const intent = decodeMaintenanceIdempotency(intentRow);
  const effectiveKey = intentRow?.idempotency_key || requestedKey || "";
  const expectedBackupId = maintenanceBackupIdForIntent({ actorId: context.actor.user_id, idempotencyKey: effectiveKey, backupType: "pre-full-reset" });
  const audit = fullResetAuditDetails(await fullResetAuditByBackupId(db, context.actor.user_id, expectedBackupId));
  const completed = intent.state === "completed" && intent.result?.fullReset === true ? intent.result : null;
  const committed = completed || audit;
  const safetyBackupId = completed?.safetyBackupId || audit?.safetyBackupId || expectedBackupId;
  const backup = safetyBackupId ? await db.one(
    "SELECT backup_id,status,external_file_id,verified_at,error_code,created_at FROM backup_runs WHERE backup_id=?",
    [safetyBackupId],
  ) : null;

  const outcome = resolveMaintenanceOutcome({
    committed,
    intentState: intent.state,
    maintenanceMode,
    requestedKey,
  });

  return {
    checkedAt: nowIso(),
    outcome,
    requiresAttention: outcome === "processing" || outcome === "recovery_required",
    canStartNewIntent: !maintenanceMode && outcome !== "processing",
    maintenanceMode,
    intent: intentRow ? { state: intent.state, createdAt: intentRow.created_at, expiresAt: intentRow.expires_at } : null,
    backup: maintenanceBackupPresentation(backup),
    committedReset: committed ? {
      resetId: completed?.resetId || audit?.resetId || null,
      resetAt: completed?.resetAt || audit?.resetAt || null,
      safetyBackupId: completed?.safetyBackupId || audit?.safetyBackupId || null,
      safetyBackupFileId: completed?.safetyBackupFileId || backup?.external_file_id || null,
      summary: completed?.summary || audit?.summary || null,
    } : null,
    currentSummary: fullResetSummary(counts),
  };
};

export const applyFullDataReset = async (db, context) => {
  assertOwner(context.actor);
  const { reason, previewFingerprint } = assertFullResetRequest(context);
  const preBackupState = await assertFullResetPreviewUnchanged(db, previewFingerprint);
  const summary = fullResetSummary(preBackupState.counts);
  if (summary.totalRows <= 0) {
    throw appError("FULL_RESET_NOTHING_TO_CLEAN", "Data aplikasi sudah berada pada kondisi awal. Tidak ada data yang perlu direset.", 409);
  }

  const safety = await createTechnicalBackup(db, { ...context, action: "backup.safety" }, { type: "pre-full-reset", audit: true });
  await claimMaintenanceMode(db, "Maintenance lain sedang aktif. Selesaikan recovery/integrity sebelum reset semua data.");

  const resetId = uuid();
  const resetAt = nowIso();
  const result = {
    fullReset: true,
    resetId,
    resetAt,
    safetyBackupId: safety.backupId,
    safetyBackupFileId: safety.fileId,
    summary,
  };

  let purgeStarted = false;
  try {
    await db.transaction(async (tx) => {
      await assertFullResetPreviewUnchanged(tx, previewFingerprint);
      purgeStarted = true;
      await purgeFullResetData(tx);
      const issues = await integrityIssues(tx);
      if (issues.length) throw appError("FULL_RESET_INTEGRITY_FAILED", "Reset semua data dibatalkan karena integrity check gagal.", 409, issues);
      await appendAudit(tx, { ...context, action: "fullReset.apply" }, {
        entityType: "maintenance_full_reset",
        entityId: resetId,
        reason,
        previous: { previewFingerprint, summary },
        next: { resetAt, safetyBackupId: safety.backupId, scope: "full-data-reset", reason },
      });
      await enqueueIntegration(tx, "sheets", "rebuild", "system", "mirror", { reason: "full-reset", resetId });
      await enqueueIntegration(tx, "calendar", "rebuild", "system", "calendar", { reason: "full-reset", resetId });
      await releaseMaintenanceMode(tx, "Status maintenance tidak dapat dipastikan. Reset semua data dibatalkan dan maintenance tetap aktif.");
    });
    return result;
  } catch (error) {
    if (!purgeStarted) {
      await clearMaintenanceMode(db);
    }
    throw error;
  }
};

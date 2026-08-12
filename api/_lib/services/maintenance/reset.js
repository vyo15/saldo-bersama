import { appendAudit } from "../audit.js";
import { enqueueIntegration } from "../integrations.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, canonicalJson, nowIso, sanitizeText, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import { digest, quoted } from "./shared.js";

export const TRIAL_RESET_CONFIRMATION = "BERSIHKAN DATA TESTING";

const RESET_BUSINESS_TABLES = Object.freeze([
  { table: "goal_movements", key: "goal_movement_id" },
  { table: "budgets", key: "budget_id" },
  { table: "envelope_movements", key: "movement_id" },
  { table: "transactions", key: "transaction_id" },
  { table: "recurring_occurrences", key: "occurrence_id" },
  { table: "recurring_rules", key: "recurring_rule_id" },
  { table: "envelope_periods", key: "envelope_period_id" },
  { table: "envelope_rules", key: "envelope_rule_id" },
  { table: "savings_goals", key: "goal_id" },
  { table: "reconciliations", key: "reconciliation_id" },
  { table: "period_closures", key: "closure_id" },
]);

const RESET_OPERATIONAL_TABLES = Object.freeze([
  { table: "notification_deliveries", key: "delivery_id" },
  { table: "notification_queue", key: "notification_id" },
  { table: "integration_links", key: "link_id" },
  { table: "integration_outbox", key: "outbox_id" },
  { table: "import_previews", key: "preview_id" },
]);

const RESET_STATE_TABLES = Object.freeze([...RESET_BUSINESS_TABLES, ...RESET_OPERATIONAL_TABLES]);
const RESET_OPERATIONAL_DELETE_ORDER = Object.freeze(RESET_OPERATIONAL_TABLES.map(({ table }) => table));
const RESET_BUSINESS_DELETE_ORDER = Object.freeze(RESET_BUSINESS_TABLES.map(({ table }) => table));

const RESET_STATE_STATEMENTS = Object.freeze(RESET_STATE_TABLES.map(({ table, key }) => ({
  sql: `SELECT * FROM ${quoted(table)} ORDER BY ${quoted(key)}`,
  args: [],
})));

const PRESERVED_COUNT_STATEMENTS = Object.freeze([
  { sql: "SELECT COUNT(*) AS count FROM accounts", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM categories", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM users", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM audit_log", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM backup_runs", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM push_subscriptions", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM notification_preferences", args: [] },
]);

const readBatchRows = async (db, statements) => {
  if (typeof db.batch === "function") {
    return (await db.batch(statements)).map((result) => result.rows || []);
  }
  return Promise.all(statements.map((statement) => db.all(statement.sql, statement.args || [])));
};

const mapResetStateRows = (resultRows) => {
  const rowsByTable = Object.fromEntries(RESET_STATE_TABLES.map(({ table }, index) => [table, resultRows[index] || []]));
  const counts = Object.fromEntries(RESET_STATE_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  return {
    counts,
    fingerprint: digest(canonicalJson(rowsByTable)),
  };
};

const mapPreservedCountRows = (resultRows) => {
  const [accounts, categories, users, audit, backups, pushSubscriptions, notificationPreferences] = resultRows.map((rows) => rows?.[0] || null);
  return {
    accounts: Number(accounts?.count || 0),
    categories: Number(categories?.count || 0),
    users: Number(users?.count || 0),
    audit: Number(audit?.count || 0),
    backups: Number(backups?.count || 0),
    pushSubscriptions: Number(pushSubscriptions?.count || 0),
    notificationPreferences: Number(notificationPreferences?.count || 0),
  };
};

const readResetState = async (db) => mapResetStateRows(await readBatchRows(db, RESET_STATE_STATEMENTS));

const sumCounts = (counts, tables) => tables.reduce((sum, { table }) => sum + Number(counts[table] || 0), 0);

const resetSummary = (counts) => {
  const businessRows = sumCounts(counts, RESET_BUSINESS_TABLES);
  const operationalRows = sumCounts(counts, RESET_OPERATIONAL_TABLES);
  return {
    transactions: Number(counts.transactions || 0),
    reconciliations: Number(counts.reconciliations || 0),
    goals: Number(counts.savings_goals || 0),
    goalMovements: Number(counts.goal_movements || 0),
    budgets: Number(counts.budgets || 0),
    allocationRules: Number(counts.envelope_rules || 0),
    allocationPeriods: Number(counts.envelope_periods || 0),
    allocationMovements: Number(counts.envelope_movements || 0),
    recurringRules: Number(counts.recurring_rules || 0),
    recurringOccurrences: Number(counts.recurring_occurrences || 0),
    periodClosures: Number(counts.period_closures || 0),
    notificationDeliveries: Number(counts.notification_deliveries || 0),
    notificationQueue: Number(counts.notification_queue || 0),
    integrationLinks: Number(counts.integration_links || 0),
    integrationOutbox: Number(counts.integration_outbox || 0),
    importPreviews: Number(counts.import_previews || 0),
    businessRows,
    operationalRows,
    totalRows: businessRows + operationalRows,
  };
};

export const previewTrialDataReset = async (db, context) => {
  assertOwner(context.actor);
  const resultRows = await readBatchRows(db, [...RESET_STATE_STATEMENTS, ...PRESERVED_COUNT_STATEMENTS]);
  const state = mapResetStateRows(resultRows.slice(0, RESET_STATE_STATEMENTS.length));
  const preserved = mapPreservedCountRows(resultRows.slice(RESET_STATE_STATEMENTS.length));
  return {
    scope: "prelaunch-testing-data",
    previewFingerprint: state.fingerprint,
    previewedAt: nowIso(),
    confirmationPhrase: TRIAL_RESET_CONFIRMATION,
    summary: resetSummary(state.counts),
    preserved,
  };
};

const assertResetRequest = (context) => {
  const payload = context.payload || {};
  if (payload.confirmation !== TRIAL_RESET_CONFIRMATION) {
    throw appError("RESET_CONFIRMATION_REQUIRED", `Ketik persis ${TRIAL_RESET_CONFIRMATION} untuk melanjutkan.`, 400);
  }
  if (payload.acknowledged !== true) {
    throw appError("RESET_ACKNOWLEDGEMENT_REQUIRED", "Pernyataan pemahaman wajib dicentang.", 400);
  }
  const reason = sanitizeText(payload.reason, 200);
  if (reason.length < 5) throw appError("RESET_REASON_REQUIRED", "Alasan pembersihan minimal 5 karakter.", 400);
  const previewFingerprint = sanitizeText(payload.previewFingerprint, 128);
  if (!previewFingerprint) throw appError("RESET_PREVIEW_REQUIRED", "Jalankan preview pembersihan terlebih dahulu.", 409);
  return { reason, previewFingerprint };
};

const assertPreviewUnchanged = async (db, previewFingerprint) => {
  const state = await readResetState(db);
  if (state.fingerprint !== previewFingerprint) {
    throw appError("RESET_PREVIEW_CHANGED", "Data berubah sejak preview. Jalankan preview lagi agar data terbaru diperiksa.", 409);
  }
  return state;
};

const claimMaintenance = async (db) => {
  const result = await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode' AND value='false'", [nowIso()]);
  if (result.rowsAffected !== 1) {
    throw appError("MAINTENANCE_MODE", "Maintenance lain sedang aktif. Selesaikan recovery/integrity sebelum pembersihan data testing.", 409);
  }
};

const purgeTrialData = async (tx) => {
  for (const table of RESET_OPERATIONAL_DELETE_ORDER) await tx.execute(`DELETE FROM ${quoted(table)}`);
  for (const table of RESET_BUSINESS_DELETE_ORDER) await tx.execute(`DELETE FROM ${quoted(table)}`);
};

export const applyTrialDataReset = async (db, context) => {
  assertOwner(context.actor);
  const { reason, previewFingerprint } = assertResetRequest(context);
  const preBackupState = await assertPreviewUnchanged(db, previewFingerprint);
  const safety = await createTechnicalBackup(db, { ...context, action: "backup.safety" }, { type: "pre-trial-reset", audit: true });
  await claimMaintenance(db);

  const resetId = uuid();
  const resetAt = nowIso();
  const result = {
    reset: true,
    resetId,
    resetAt,
    safetyBackupId: safety.backupId,
    safetyBackupFileId: safety.fileId,
    summary: resetSummary(preBackupState.counts),
  };

  let purgeStarted = false;
  try {
    await db.transaction(async (tx) => {
      await assertPreviewUnchanged(tx, previewFingerprint);
      purgeStarted = true;
      await purgeTrialData(tx);
      const issues = await integrityIssues(tx);
      if (issues.length) throw appError("RESET_INTEGRITY_FAILED", "Pembersihan dibatalkan karena integrity check gagal.", 409, issues);
      await appendAudit(tx, { ...context, action: "reset.apply" }, {
        entityType: "maintenance_reset",
        entityId: resetId,
        reason,
        previous: { previewFingerprint, summary: result.summary },
        next: { resetAt, safetyBackupId: safety.backupId, scope: "prelaunch-testing-data", reason },
      });
      await enqueueIntegration(tx, "sheets", "rebuild", "system", "mirror", { reason: "trial-reset", resetId });
      await enqueueIntegration(tx, "calendar", "rebuild", "system", "calendar", { reason: "trial-reset", resetId });
      await tx.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
    });
    return result;
  } catch (error) {
    if (!purgeStarted) {
      await db.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
    }
    // Setelah purge dimulai, fail closed: maintenance tetap aktif sampai owner menjalankan integrity recovery.
    throw error;
  }
};

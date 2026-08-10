import { appendAudit } from "../audit.js";
import { enqueueIntegration } from "../integrations.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, canonicalJson, nowIso, sanitizeText, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import { digest, quoted } from "./shared.js";

export const TRIAL_RESET_CONFIRMATION = "RESET DATA PERCOBAAN";

const RESET_DATA_TABLES = Object.freeze([
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

const RESET_OPERATIONAL_DELETE_ORDER = Object.freeze([
  "notification_deliveries",
  "notification_queue",
  "integration_links",
  "integration_outbox",
  "import_previews",
]);

const RESET_BUSINESS_DELETE_ORDER = Object.freeze(RESET_DATA_TABLES.map(({ table }) => table));

const readResetState = async (db) => {
  const rowsByTable = {};
  for (const { table, key } of RESET_DATA_TABLES) {
    rowsByTable[table] = await db.all(`SELECT * FROM ${quoted(table)} ORDER BY ${quoted(key)}`);
  }
  const counts = Object.fromEntries(RESET_DATA_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  return {
    counts,
    fingerprint: digest(canonicalJson(rowsByTable)),
  };
};

const readPreservedCounts = async (db) => {
  const [accounts, categories, users, audit] = await Promise.all([
    db.one("SELECT COUNT(*) AS count FROM accounts"),
    db.one("SELECT COUNT(*) AS count FROM categories"),
    db.one("SELECT COUNT(*) AS count FROM users"),
    db.one("SELECT COUNT(*) AS count FROM audit_log"),
  ]);
  return {
    accounts: Number(accounts?.count || 0),
    categories: Number(categories?.count || 0),
    users: Number(users?.count || 0),
    audit: Number(audit?.count || 0),
  };
};

const resetSummary = (counts) => ({
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
  totalRows: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0),
});

export const previewTrialDataReset = async (db, context) => {
  assertOwner(context.actor);
  const [state, preserved] = await Promise.all([readResetState(db), readPreservedCounts(db)]);
  return {
    scope: "trial-financial-data",
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
  if (reason.length < 5) throw appError("RESET_REASON_REQUIRED", "Alasan reset minimal 5 karakter.", 400);
  const previewFingerprint = sanitizeText(payload.previewFingerprint, 128);
  if (!previewFingerprint) throw appError("RESET_PREVIEW_REQUIRED", "Jalankan preview reset terlebih dahulu.", 409);
  return { reason, previewFingerprint };
};

const assertPreviewUnchanged = async (db, previewFingerprint) => {
  const state = await readResetState(db);
  if (state.fingerprint !== previewFingerprint) {
    throw appError("RESET_PREVIEW_CHANGED", "Data berubah sejak preview. Jalankan preview reset lagi agar data terbaru diperiksa.", 409);
  }
  return state;
};

const claimMaintenance = async (db) => {
  const result = await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode' AND value='false'", [nowIso()]);
  if (result.rowsAffected !== 1) {
    throw appError("MAINTENANCE_MODE", "Maintenance lain sedang aktif. Selesaikan recovery/integrity sebelum reset.", 409);
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
      if (issues.length) throw appError("RESET_INTEGRITY_FAILED", "Reset dibatalkan karena integrity check gagal.", 409, issues);
      await appendAudit(tx, { ...context, action: "reset.apply" }, {
        entityType: "maintenance_reset",
        entityId: resetId,
        reason,
        previous: { previewFingerprint, summary: result.summary },
        next: { resetAt, safetyBackupId: safety.backupId, scope: "trial-financial-data", reason },
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

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
  maintenanceStatusPresentation,
  preferredMaintenanceValue,
  quoted,
  releaseMaintenanceMode,
  selectMaintenanceIntentRow,
} from "./shared.js";

export const TRIAL_RESET_CONFIRMATION = "BERSIHKAN DATA TESTING";
export const TRIAL_RESET_SCOPE_ACTIVITY = "activity";
export const TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES = "activity_and_balances";

const TRIAL_RESET_SCOPES = new Set([TRIAL_RESET_SCOPE_ACTIVITY, TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES]);

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

const RESET_GENERATED_OUTBOX_PREDICATE = `(
  entity_type='system'
  AND event_type='rebuild'
  AND ((provider='sheets' AND entity_id='mirror') OR (provider='calendar' AND entity_id='calendar'))
  AND json_extract(CASE WHEN json_valid(payload_json)=1 THEN payload_json ELSE '{}' END,'$.reason')='trial-reset'
)`;

const RESET_COUNT_STATEMENTS = Object.freeze(RESET_STATE_TABLES.map(({ table }) => ({
  sql: table === "integration_outbox"
    ? `SELECT COUNT(*) AS count FROM integration_outbox WHERE NOT ${RESET_GENERATED_OUTBOX_PREDICATE}`
    : `SELECT COUNT(*) AS count FROM ${quoted(table)}`,
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

const accountBalanceResetStatement = (cutoffDate) => ({
  sql: `SELECT a.account_id,a.name,a.initial_balance,a.initial_balance_date,a.row_version,a.status,
    CASE WHEN a.initial_balance_date>? THEN 0 ELSE a.initial_balance + COALESCE(SUM(CASE
      WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
      WHEN t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
      WHEN t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
      WHEN t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
      WHEN t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
      ELSE 0 END),0) END AS current_balance
    FROM accounts a
    LEFT JOIN transactions t ON t.status='active'
      AND t.transaction_date BETWEEN a.initial_balance_date AND ?
      AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)
    GROUP BY a.account_id
    ORDER BY a.account_id`,
  args: [cutoffDate, cutoffDate],
});

const normalizedResetScope = (value) => {
  const scope = sanitizeText(value || TRIAL_RESET_SCOPE_ACTIVITY, 40);
  if (!TRIAL_RESET_SCOPES.has(scope)) {
    throw appError("RESET_SCOPE_INVALID", "Pilihan reset data testing tidak valid.", 400);
  }
  return scope;
};

const isResetGeneratedOutbox = (row) => {
  if (row?.entity_type !== "system" || row?.event_type !== "rebuild") return false;
  const canonicalTarget = (row.provider === "sheets" && row.entity_id === "mirror")
    || (row.provider === "calendar" && row.entity_id === "calendar");
  if (!canonicalTarget) return false;
  return parseJson(row.payload_json, {})?.reason === "trial-reset";
};

const resettableRows = (table, rows) => table === "integration_outbox"
  ? rows.filter((row) => !isResetGeneratedOutbox(row))
  : rows;

const rowsByResetTable = (resultRows) => Object.fromEntries(RESET_STATE_TABLES.map(({ table }, index) => [
  table,
  resettableRows(table, resultRows[index] || []),
]));

const accountStateForFingerprint = (accounts = []) => accounts.map((row) => ({
  account_id: row.account_id,
  initial_balance: Number(row.initial_balance || 0),
  initial_balance_date: row.initial_balance_date,
  row_version: Number(row.row_version || 1),
}));

const mapResetStateRows = (resultRows, scope, accountRows = []) => {
  const rowsByTable = rowsByResetTable(resultRows);
  const counts = Object.fromEntries(RESET_STATE_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  const fingerprintPayload = scope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES
    ? { rowsByTable, accounts: accountStateForFingerprint(accountRows), scope }
    : { rowsByTable, scope };
  return {
    counts,
    fingerprint: digest(canonicalJson(fingerprintPayload)),
  };
};

const mapResetCountRows = (resultRows) => Object.fromEntries(RESET_STATE_TABLES.map(({ table }, index) => [
  table,
  Number(resultRows[index]?.[0]?.count || 0),
]));

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

const balanceResetPreview = (accountRows = []) => {
  const accounts = accountRows
    .filter((row) => Number(row.current_balance || 0) !== 0 || Number(row.initial_balance || 0) !== 0)
    .map((row) => ({
      accountId: row.account_id,
      name: row.name,
      currentBalance: Number(row.current_balance || 0),
      initialBalance: Number(row.initial_balance || 0),
      nextBalance: 0,
      rowVersion: Number(row.row_version || 1),
    }));
  return {
    accountsAffected: accounts.length,
    totalCurrentBalance: accounts.reduce((sum, row) => sum + row.currentBalance, 0),
    totalInitialBalance: accounts.reduce((sum, row) => sum + row.initialBalance, 0),
    accounts,
  };
};

const readResetState = async (db, scope, cutoffDate) => {
  const withBalances = scope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES;
  const statements = withBalances ? [...RESET_STATE_STATEMENTS, accountBalanceResetStatement(cutoffDate)] : RESET_STATE_STATEMENTS;
  const resultRows = await readBatchRows(db, statements);
  const accountRows = withBalances ? resultRows.at(-1) || [] : [];
  return {
    ...mapResetStateRows(resultRows.slice(0, RESET_STATE_STATEMENTS.length), scope, accountRows),
    balanceReset: withBalances ? balanceResetPreview(accountRows) : null,
  };
};

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
  const resetScope = normalizedResetScope(context.payload?.resetScope);
  const withBalances = resetScope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES;
  const statements = [
    ...RESET_STATE_STATEMENTS,
    ...PRESERVED_COUNT_STATEMENTS,
    ...(withBalances ? [accountBalanceResetStatement(context.today)] : []),
  ];
  const resultRows = await readBatchRows(db, statements);
  const stateRows = resultRows.slice(0, RESET_STATE_STATEMENTS.length);
  const preservedStart = RESET_STATE_STATEMENTS.length;
  const preservedEnd = preservedStart + PRESERVED_COUNT_STATEMENTS.length;
  const preserved = mapPreservedCountRows(resultRows.slice(preservedStart, preservedEnd));
  const accountRows = withBalances ? resultRows[preservedEnd] || [] : [];
  const state = mapResetStateRows(stateRows, resetScope, accountRows);
  return {
    scope: "prelaunch-testing-data",
    resetScope,
    previewFingerprint: state.fingerprint,
    previewedAt: nowIso(),
    confirmationPhrase: TRIAL_RESET_CONFIRMATION,
    summary: resetSummary(state.counts),
    balanceReset: withBalances ? balanceResetPreview(accountRows) : null,
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
  const resetScope = normalizedResetScope(payload.resetScope);
  return { reason, previewFingerprint, resetScope };
};

const assertPreviewUnchanged = async (db, previewFingerprint, resetScope, cutoffDate) => {
  const state = await readResetState(db, resetScope, cutoffDate);
  if (state.fingerprint !== previewFingerprint) {
    throw appError("RESET_PREVIEW_CHANGED", "Data berubah sejak preview. Jalankan preview lagi agar data terbaru diperiksa.", 409);
  }
  return state;
};

const purgeTrialData = async (tx) => {
  for (const table of RESET_OPERATIONAL_DELETE_ORDER) {
    if (table === "integration_outbox") {
      await tx.execute(`DELETE FROM integration_outbox WHERE NOT ${RESET_GENERATED_OUTBOX_PREDICATE}`);
      continue;
    }
    await tx.execute(`DELETE FROM ${quoted(table)}`);
  }
  for (const table of RESET_BUSINESS_DELETE_ORDER) await tx.execute(`DELETE FROM ${quoted(table)}`);
};

const zeroInitialBalances = async (tx, context) => {
  const timestamp = nowIso();
  return tx.execute(`UPDATE accounts
    SET initial_balance=0,initial_balance_date=?,row_version=row_version+1,updated_by=?,updated_at=?
    WHERE initial_balance<>0`,
  [context.today, context.actor.user_id, timestamp]);
};

const resetAuditDetails = (row) => {
  if (!row) return null;
  const previous = parseJson(row.previous_value, {});
  const next = parseJson(row.new_value, {});
  return {
    resetId: row.entity_id,
    resetAt: next.resetAt || row.timestamp,
    previewFingerprint: previous.previewFingerprint || null,
    summary: previous.summary || null,
    balanceReset: previous.balanceReset || null,
    resetScope: next.resetScope || TRIAL_RESET_SCOPE_ACTIVITY,
    safetyBackupId: next.safetyBackupId || null,
  };
};

const matchingResetAudit = (rows, backupId) => backupId
  ? rows.find((row) => parseJson(row.new_value, {})?.safetyBackupId === backupId) || null
  : null;

const trialResetStatusPlan = (actorId, requestedKey, timestamp) => {
  const intentStatement = requestedKey
    ? { sql: "SELECT idempotency_key,response_json,request_fingerprint,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='reset.apply' AND idempotency_key=? AND expires_at>? LIMIT 1", args: [actorId, requestedKey, timestamp] }
    : { sql: "SELECT idempotency_key,response_json,request_fingerprint,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='reset.apply' AND expires_at>? ORDER BY created_at DESC LIMIT 12", args: [actorId, timestamp] };
  const requestedBackupId = maintenanceBackupIdForIntent({ actorId, idempotencyKey: requestedKey, backupType: "pre-trial-reset" });
  const auditStatement = requestedBackupId
    ? { sql: `SELECT timestamp,entity_id,previous_value,new_value FROM audit_log
        WHERE actor_id=? AND action='reset.apply' AND entity_type='maintenance_reset' AND result='success'
          AND json_valid(new_value)=1 AND json_extract(new_value,'$.safetyBackupId')=?
        ORDER BY timestamp DESC LIMIT 1`, args: [actorId, requestedBackupId] }
    : { sql: "SELECT timestamp,entity_id,previous_value,new_value FROM audit_log WHERE actor_id=? AND action='reset.apply' AND entity_type='maintenance_reset' AND result='success' ORDER BY timestamp DESC LIMIT 12", args: [actorId] };
  return { requestedBackupId, statements: [...RESET_COUNT_STATEMENTS, { sql: "SELECT value FROM system_config WHERE key='maintenance_mode'", args: [] }, intentStatement, auditStatement] };
};

const trialResetCommittedPresentation = ({ completed, audit, backup }) => {
  if (!completed && !audit) return null;
  return {
    resetId: preferredMaintenanceValue(completed, audit, "resetId"),
    resetAt: preferredMaintenanceValue(completed, audit, "resetAt"),
    safetyBackupId: preferredMaintenanceValue(completed, audit, "safetyBackupId"),
    safetyBackupFileId: preferredMaintenanceValue(completed, backup, "safetyBackupFileId", backup ? backup.external_file_id : null),
    summary: preferredMaintenanceValue(completed, audit, "summary"),
    balanceReset: preferredMaintenanceValue(completed, audit, "balanceReset"),
    resetScope: preferredMaintenanceValue(completed, audit, "resetScope", TRIAL_RESET_SCOPE_ACTIVITY),
  };
};

const trialResetStatusRows = (resultRows) => {
  const offset = RESET_COUNT_STATEMENTS.length;
  const maintenanceRow = resultRows[offset] && resultRows[offset][0] ? resultRows[offset][0] : null;
  return {
    counts: mapResetCountRows(resultRows.slice(0, offset)),
    maintenanceMode: maintenanceRow ? maintenanceRow.value === "true" : false,
    intentRows: resultRows[offset + 1] || [],
    auditRows: resultRows[offset + 2] || [],
  };
};

const trialResetStatusCommit = async (db, actorId, requestedKey, requestedBackupId, intentRow, intent, auditRows) => {
  const effectiveKey = intentRow && intentRow.idempotency_key ? intentRow.idempotency_key : requestedKey;
  const expectedBackupId = requestedBackupId || maintenanceBackupIdForIntent({ actorId, idempotencyKey: effectiveKey || "", backupType: "pre-trial-reset" });
  const audit = resetAuditDetails(matchingResetAudit(auditRows, expectedBackupId));
  const completed = intent.state === "completed" && intent.result && intent.result.reset === true ? intent.result : null;
  const committed = completed || audit;
  const safetyBackupId = preferredMaintenanceValue(committed, audit, "safetyBackupId", expectedBackupId);
  const backup = safetyBackupId
    ? await db.one("SELECT backup_id,status,external_file_id,verified_at,error_code,created_at FROM backup_runs WHERE backup_id=?", [safetyBackupId])
    : null;
  return { audit, backup, committed, completed };
};

export const readTrialDataResetStatus = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const requestedKey = sanitizeText(payload.idempotencyKey, 160);
  const plan = trialResetStatusPlan(context.actor.user_id, requestedKey, nowIso());
  const resultRows = await readBatchRows(db, plan.statements);
  const state = trialResetStatusRows(resultRows);
  const intentRow = selectMaintenanceIntentRow(state.intentRows, requestedKey);
  const intent = decodeMaintenanceIdempotency(intentRow);
  const commit = await trialResetStatusCommit(db, context.actor.user_id, requestedKey, plan.requestedBackupId, intentRow, intent, state.auditRows);
  return maintenanceStatusPresentation({
    state, intentRow, intent, commit, requestedKey,
    committedReset: trialResetCommittedPresentation(commit),
    currentSummary: resetSummary(state.counts),
  });
};

export const applyTrialDataReset = async (db, context) => {
  assertOwner(context.actor);
  const { reason, previewFingerprint, resetScope } = assertResetRequest(context);
  const preBackupState = await assertPreviewUnchanged(db, previewFingerprint, resetScope, context.today);
  const summary = resetSummary(preBackupState.counts);
  const balanceReset = preBackupState.balanceReset;
  const hasBalanceChanges = resetScope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES && Number(balanceReset?.accountsAffected || 0) > 0;
  if (summary.totalRows <= 0 && !hasBalanceChanges) {
    throw appError("RESET_NOTHING_TO_CLEAN", "Tidak ada data testing atau saldo awal yang perlu dibersihkan. Jalankan preview lagi jika data baru ditambahkan.", 409);
  }
  const safety = await createTechnicalBackup(db, { ...context, action: "backup.safety" }, { type: "pre-trial-reset", audit: true });
  await claimMaintenanceMode(db, "Maintenance lain sedang aktif. Selesaikan recovery/integrity sebelum pembersihan data testing.");

  const resetId = uuid();
  const resetAt = nowIso();
  const result = {
    reset: true,
    resetId,
    resetAt,
    resetScope,
    safetyBackupId: safety.backupId,
    safetyBackupFileId: safety.fileId,
    summary,
    balanceReset,
  };

  let purgeStarted = false;
  try {
    await db.transaction(async (tx) => {
      await assertPreviewUnchanged(tx, previewFingerprint, resetScope, context.today);
      purgeStarted = true;
      await purgeTrialData(tx);
      if (resetScope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES) await zeroInitialBalances(tx, context);
      const issues = await integrityIssues(tx);
      if (issues.length) throw appError("RESET_INTEGRITY_FAILED", "Pembersihan dibatalkan karena integrity check gagal.", 409, issues);
      await appendAudit(tx, { ...context, action: "reset.apply" }, {
        entityType: "maintenance_reset",
        entityId: resetId,
        reason,
        previous: {
          previewFingerprint,
          summary: result.summary,
          balanceReset: balanceReset ? {
            accountsAffected: balanceReset.accountsAffected,
            totalCurrentBalance: balanceReset.totalCurrentBalance,
            totalInitialBalance: balanceReset.totalInitialBalance,
          } : null,
        },
        next: { resetAt, safetyBackupId: safety.backupId, scope: "prelaunch-testing-data", resetScope, reason },
      });
      await enqueueIntegration(tx, "sheets", "rebuild", "system", "mirror", { reason: "trial-reset", resetId });
      await enqueueIntegration(tx, "calendar", "rebuild", "system", "calendar", { reason: "trial-reset", resetId });
      await releaseMaintenanceMode(tx, "Status maintenance tidak dapat dipastikan. Pembersihan dibatalkan dan maintenance tetap aktif.");
    });
    return result;
  } catch (error) {
    if (!purgeStarted) {
      await clearMaintenanceMode(db);
    }
    // Setelah purge dimulai, fail closed: maintenance tetap aktif sampai owner menjalankan integrity recovery.
    throw error;
  }
};

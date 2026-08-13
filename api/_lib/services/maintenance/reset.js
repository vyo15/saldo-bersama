import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { enqueueIntegration } from "../integrations.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, canonicalJson, nowIso, parseJson, sanitizeText, uuid } from "../core.js";
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

const mapResetStateRows = (resultRows) => {
  const rowsByTable = Object.fromEntries(RESET_STATE_TABLES.map(({ table }, index) => [
    table,
    resettableRows(table, resultRows[index] || []),
  ]));
  const counts = Object.fromEntries(RESET_STATE_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  return {
    counts,
    fingerprint: digest(canonicalJson(rowsByTable)),
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
  for (const table of RESET_OPERATIONAL_DELETE_ORDER) {
    if (table === "integration_outbox") {
      await tx.execute(`DELETE FROM integration_outbox WHERE NOT ${RESET_GENERATED_OUTBOX_PREDICATE}`);
      continue;
    }
    await tx.execute(`DELETE FROM ${quoted(table)}`);
  }
  for (const table of RESET_BUSINESS_DELETE_ORDER) await tx.execute(`DELETE FROM ${quoted(table)}`);
};

const resetBackupIdForIntent = (actorId, idempotencyKey) => idempotencyKey
  ? `bkp_${digest(`${actorId}:backup.safety:pre-trial-reset:${idempotencyKey}`).slice(0, 32)}`
  : null;

const decodeIdempotency = (row) => {
  if (!row) return { state: "missing", result: null };
  const value = parseJson(row.response_json, {});
  const state = value?.__idempotency_state;
  if (state === "processing" || state === "unknown") return { state, result: null };
  return { state: "completed", result: value };
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
    safetyBackupId: next.safetyBackupId || null,
  };
};

const matchingResetAudit = (rows, backupId) => backupId
  ? rows.find((row) => parseJson(row.new_value, {})?.safetyBackupId === backupId) || null
  : null;

export const readTrialDataResetStatus = async (db, context) => {
  assertOwner(context.actor);
  const requestedKey = sanitizeText(context.payload?.idempotencyKey, 160);
  const intentStatement = requestedKey
    ? {
      sql: "SELECT idempotency_key,response_json,request_fingerprint,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='reset.apply' AND idempotency_key=? AND expires_at>? LIMIT 1",
      args: [context.actor.user_id, requestedKey, nowIso()],
    }
    : {
      sql: "SELECT idempotency_key,response_json,request_fingerprint,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='reset.apply' AND expires_at>? ORDER BY created_at DESC LIMIT 12",
      args: [context.actor.user_id, nowIso()],
    };
  const statusStatements = [
    ...RESET_COUNT_STATEMENTS,
    { sql: "SELECT value FROM system_config WHERE key='maintenance_mode'", args: [] },
    intentStatement,
    {
      sql: "SELECT timestamp,entity_id,previous_value,new_value FROM audit_log WHERE actor_id=? AND action='reset.apply' AND entity_type='maintenance_reset' AND result='success' ORDER BY timestamp DESC LIMIT 12",
      args: [context.actor.user_id],
    },
  ];
  const resultRows = await readBatchRows(db, statusStatements);
  const counts = mapResetCountRows(resultRows.slice(0, RESET_COUNT_STATEMENTS.length));
  const offset = RESET_COUNT_STATEMENTS.length;
  const maintenanceMode = resultRows[offset]?.[0]?.value === "true";
  const candidateIntentRows = resultRows[offset + 1] || [];
  const intentRow = requestedKey
    ? candidateIntentRows[0] || null
    : candidateIntentRows.find((row) => ["processing", "unknown"].includes(decodeIdempotency(row).state)) || null;
  const auditRows = resultRows[offset + 2] || [];
  const intent = decodeIdempotency(intentRow);
  const effectiveKey = intentRow?.idempotency_key || requestedKey || "";
  const expectedBackupId = resetBackupIdForIntent(context.actor.user_id, effectiveKey);
  const auditRow = matchingResetAudit(auditRows, expectedBackupId);
  const audit = resetAuditDetails(auditRow);
  const completed = intent.state === "completed" && intent.result?.reset === true ? intent.result : null;
  const committed = completed || audit;
  const safetyBackupId = committed?.safetyBackupId || audit?.safetyBackupId || expectedBackupId;
  const backup = safetyBackupId ? await db.one(
    "SELECT backup_id,status,external_file_id,verified_at,error_code,created_at FROM backup_runs WHERE backup_id=?",
    [safetyBackupId],
  ) : null;

  let outcome = "idle";
  if (committed) outcome = "committed";
  else if (intent.state === "processing") outcome = "processing";
  else if (maintenanceMode) outcome = "recovery_required";
  else if (intent.state === "unknown") outcome = "not_committed";
  else if (requestedKey && intent.state === "missing") outcome = "not_committed";

  return {
    checkedAt: nowIso(),
    outcome,
    requiresAttention: outcome === "processing" || outcome === "recovery_required",
    canStartNewIntent: !maintenanceMode && !["processing"].includes(outcome),
    maintenanceMode,
    intent: intentRow ? { state: intent.state, createdAt: intentRow.created_at, expiresAt: intentRow.expires_at } : null,
    backup: backup ? {
      backupId: backup.backup_id,
      status: backup.status,
      fileId: backup.external_file_id || null,
      verifiedAt: backup.verified_at || null,
      errorCode: backup.error_code || null,
      createdAt: backup.created_at || null,
    } : null,
    committedReset: committed ? {
      resetId: completed?.resetId || audit?.resetId || null,
      resetAt: completed?.resetAt || audit?.resetAt || null,
      safetyBackupId: completed?.safetyBackupId || audit?.safetyBackupId || null,
      safetyBackupFileId: completed?.safetyBackupFileId || backup?.external_file_id || null,
      summary: completed?.summary || audit?.summary || null,
    } : null,
    currentSummary: resetSummary(counts),
  };
};

export const applyTrialDataReset = async (db, context) => {
  assertOwner(context.actor);
  const { reason, previewFingerprint } = assertResetRequest(context);
  const preBackupState = await assertPreviewUnchanged(db, previewFingerprint);
  const summary = resetSummary(preBackupState.counts);
  if (summary.totalRows <= 0) {
    throw appError("RESET_NOTHING_TO_CLEAN", "Tidak ada data testing yang perlu dibersihkan. Jalankan preview lagi jika data baru ditambahkan.", 409);
  }
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
    summary,
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

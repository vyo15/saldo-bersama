import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { enqueueIntegration } from "../integrations.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, nowIso, parseJson, sanitizeText, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import {
  claimMaintenanceMode,
  clearMaintenanceMode,
  decodeMaintenanceIdempotency,
  maintenanceBackupIdForIntent,
  maintenanceStatusPresentation,
  preferredMaintenanceValue,
  quoted,
  releaseMaintenanceMode,
  selectMaintenanceIntentRow,
} from "./shared.js";
import {
  PRESERVED_COUNT_STATEMENTS,
  RESET_BUSINESS_DELETE_ORDER,
  RESET_COUNT_STATEMENTS,
  RESET_GENERATED_OUTBOX_PREDICATE,
  RESET_OPERATIONAL_DELETE_ORDER,
  RESET_STATE_STATEMENTS,
  TRIAL_RESET_CONFIRMATION,
  TRIAL_RESET_SCOPE_ACTIVITY,
  TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES,
  accountBalanceResetStatement,
  balanceResetPreview,
  mapPreservedCountRows,
  mapResetCountRows,
  mapResetStateRows,
  normalizedResetScope,
  readResetState,
  resetSummary,
} from "./resetModel.js";

export { TRIAL_RESET_CONFIRMATION, TRIAL_RESET_SCOPE_ACTIVITY, TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES } from "./resetModel.js";

// Canonical confirmation phrase: "BERSIHKAN DATA TESTING" (defined in resetModel.js).
// Destructive sequence stays intentionally local: preview re-check -> safety backup ->
// maintenance claim -> transactional purge -> integrity check -> audit -> release.

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

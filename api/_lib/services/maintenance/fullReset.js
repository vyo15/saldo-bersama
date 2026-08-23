// Canonical confirmation phrase: "RESET SEMUA DATA SALDO BERSAMA". Full reset targets include
// "accounts", "categories", and "transactions" through the static model delete order; audit/users/backups are preserved.
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
  FULL_RESET_CONFIRMATION,
  FULL_RESET_COUNT_STATEMENTS,
  FULL_RESET_DELETE_ORDER,
  FULL_RESET_GENERATED_OUTBOX_PREDICATE,
  FULL_RESET_PRESERVED_STATEMENTS,
  FULL_RESET_STATE_STATEMENTS,
  fullResetSummary,
  mapCounts,
  mapPreserved,
  mapState,
  readFullResetState,
} from "./fullResetModel.js";

export { FULL_RESET_CONFIRMATION } from "./fullResetModel.js";

// Full reset remains fail-closed after purge starts; maintenance is released only after
// integrity, audit, and rebuild enqueue are committed in the same transaction.

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

const fullResetIntentQuery = (actorId, requestedKey, timestamp) => requestedKey
  ? { sql: "SELECT idempotency_key,response_json,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='fullReset.apply' AND idempotency_key=? AND expires_at>? LIMIT 1", args: [actorId, requestedKey, timestamp] }
  : { sql: "SELECT idempotency_key,response_json,created_at,expires_at FROM idempotency_keys WHERE actor_id=? AND action='fullReset.apply' AND expires_at>? ORDER BY created_at DESC LIMIT 12", args: [actorId, timestamp] };

const fullResetCommittedPresentation = ({ completed, audit, backup }) => {
  if (!completed && !audit) return null;
  return {
    resetId: preferredMaintenanceValue(completed, audit, "resetId"),
    resetAt: preferredMaintenanceValue(completed, audit, "resetAt"),
    safetyBackupId: preferredMaintenanceValue(completed, audit, "safetyBackupId"),
    safetyBackupFileId: preferredMaintenanceValue(completed, backup, "safetyBackupFileId", backup ? backup.external_file_id : null),
    summary: preferredMaintenanceValue(completed, audit, "summary"),
  };
};

const fullResetStatusRows = (rows) => {
  const offset = FULL_RESET_COUNT_STATEMENTS.length;
  const maintenanceRow = rows[offset] && rows[offset][0] ? rows[offset][0] : null;
  return {
    counts: mapCounts(rows.slice(0, offset)),
    maintenanceMode: maintenanceRow ? maintenanceRow.value === "true" : false,
    intentRows: rows[offset + 1] || [],
  };
};

const fullResetStatusCommit = async (db, actorId, requestedKey, intentRow, intent) => {
  const effectiveKey = intentRow && intentRow.idempotency_key ? intentRow.idempotency_key : requestedKey;
  const expectedBackupId = maintenanceBackupIdForIntent({ actorId, idempotencyKey: effectiveKey || "", backupType: "pre-full-reset" });
  const auditRow = await fullResetAuditByBackupId(db, actorId, expectedBackupId);
  const audit = fullResetAuditDetails(auditRow);
  const completed = intent.state === "completed" && intent.result && intent.result.fullReset === true ? intent.result : null;
  const committed = completed || audit;
  const safetyBackupId = preferredMaintenanceValue(completed, audit, "safetyBackupId", expectedBackupId);
  const backup = safetyBackupId
    ? await db.one("SELECT backup_id,status,external_file_id,verified_at,error_code,created_at FROM backup_runs WHERE backup_id=?", [safetyBackupId])
    : null;
  return { audit, backup, committed, completed };
};

export const readFullDataResetStatus = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const requestedKey = sanitizeText(payload.idempotencyKey, 160);
  const timestamp = nowIso();
  const intentQuery = fullResetIntentQuery(context.actor.user_id, requestedKey, timestamp);
  const rows = await readBatchRows(db, [
    ...FULL_RESET_COUNT_STATEMENTS,
    { sql: "SELECT value FROM system_config WHERE key='maintenance_mode'", args: [] },
    intentQuery,
  ]);
  const state = fullResetStatusRows(rows);
  const intentRow = selectMaintenanceIntentRow(state.intentRows, requestedKey);
  const intent = decodeMaintenanceIdempotency(intentRow);
  const commit = await fullResetStatusCommit(db, context.actor.user_id, requestedKey, intentRow, intent);
  return maintenanceStatusPresentation({
    state, intentRow, intent, commit, requestedKey,
    committedReset: fullResetCommittedPresentation(commit),
    currentSummary: fullResetSummary(state.counts),
  });
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

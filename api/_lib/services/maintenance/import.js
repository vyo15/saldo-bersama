/** Import remains preview-first: validate/normalize references before any apply path mutates canonical data. */
import { appendAudit } from "../audit.js";
import { createTransactionInternal } from "../finance.js";
import { integrityIssues } from "../reporting/index.js";
import { appError, assertOwner, canonicalJson, nowIso, parseJson, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import { digest, expiry } from "./shared.js";

const IMPORT_TRANSACTION_FIELDS = Object.freeze([
  "transaction_date", "transaction_type", "source_account_id", "destination_account_id", "category_id",
  "envelope_period_id", "amount", "description", "overspend_reason", "merchant", "payment_method",
]);
const IMPORT_PREVIEW_ROLLBACK = Symbol("IMPORT_PREVIEW_ROLLBACK");

const importInputRecord = (record) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw appError("INVALID_IMPORT_RECORD", "Setiap baris import harus berupa object transaksi.", 400);
  }
  const clean = {};
  for (const field of IMPORT_TRANSACTION_FIELDS) {
    if (Object.hasOwn(record, field)) clean[field] = record[field];
  }
  return clean;
};

const normalizedImportRecord = (created) => Object.fromEntries(
  IMPORT_TRANSACTION_FIELDS
    .filter((field) => Object.hasOwn(created || {}, field))
    .map((field) => [field, created[field]]),
);

const impactSummary = (records) => {
  const impact = { income: 0, expense: 0, transfer: 0, refund: 0, adjustment: 0, totalAmount: 0 };
  for (const record of records) {
    const type = String(record.transaction_type || "");
    const amount = Number(record.amount || 0);
    if (Object.hasOwn(impact, type)) impact[type] += amount;
    impact.totalAmount += amount;
  }
  return impact;
};

const simulateImport = async (db, context, records, previewId) => {
  let simulation = null;
  try {
    await db.transaction(async (tx) => {
      const valid = [];
      const invalid = [];
      const duplicates = [];
      for (let index = 0; index < records.length; index += 1) {
        try {
          const input = importInputRecord(records[index]);
          const created = await createTransactionInternal(tx, {
            ...context,
            action: "import.preview",
            idempotencyKey: `import-preview:${previewId}:${index}`,
            enqueueMirror: null,
          }, input, { audit: false });
          valid.push({ index, record: normalizedImportRecord(created) });
        } catch (error) {
          const issue = {
            index,
            code: error.code || "INVALID_RECORD",
            message: error.message || "Data transaksi tidak valid.",
          };
          if (error.code === "POSSIBLE_DUPLICATE") duplicates.push(issue);
          else invalid.push(issue);
        }
      }
      const normalizedRecords = valid.map((item) => item.record);
      simulation = {
        valid,
        invalid,
        duplicates,
        normalizedRecords,
        acceptable: valid.length > 0 && invalid.length === 0 && duplicates.length === 0 && valid.length === records.length,
        impact: impactSummary(normalizedRecords),
      };
      const rollback = new Error("Rollback preview import setelah simulasi kumulatif.");
      rollback[IMPORT_PREVIEW_ROLLBACK] = true;
      throw rollback;
    });
  } catch (error) {
    if (!error?.[IMPORT_PREVIEW_ROLLBACK]) throw error;
  }
  return simulation;
};

export const previewImport = async (db, context) => {
  assertOwner(context.actor);
  const records = context.payload?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 50) {
    throw appError("INVALID_IMPORT", "Import harus berisi 1-50 transaksi agar apply tetap atomik dan aman pada runtime serverless.", 400);
  }
  const previewId = uuid();
  const simulation = await simulateImport(db, context, records, previewId);
  const normalizedRecords = simulation.normalizedRecords;
  const fingerprint = digest(canonicalJson(normalizedRecords));
  const summary = {
    validCount: simulation.valid.length,
    invalid: simulation.invalid,
    duplicates: simulation.duplicates,
    acceptable: simulation.acceptable,
    impact: simulation.impact,
  };
  await db.execute("DELETE FROM import_previews WHERE expires_at<?", [nowIso()]);
  await db.execute("INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,'pending',NULL,NULL,?,?)", [previewId, context.actor.user_id, canonicalJson(normalizedRecords), fingerprint, canonicalJson(summary), expiry(15), nowIso()]);
  return {
    previewToken: previewId,
    fingerprint,
    ...summary,
  };
};

const assertImportPreviewAcceptable = (preview, records) => {
  const summary = parseJson(preview.summary_json, null);
  const validCount = Number(summary?.validCount || 0);
  const invalidCount = Array.isArray(summary?.invalid) ? summary.invalid.length : 0;
  const duplicateCount = Array.isArray(summary?.duplicates) ? summary.duplicates.length : 0;
  if (!summary || summary.acceptable !== true || validCount < 1 || invalidCount || duplicateCount || records.length !== validCount) {
    throw appError("IMPORT_PREVIEW_NOT_ACCEPTABLE", "Preview import masih memiliki data invalid atau duplikat. Perbaiki file lalu jalankan preview baru; tidak ada transaksi yang diterapkan.", 409, {
      validCount,
      invalidCount,
      duplicateCount,
    });
  }
  return summary;
};

export const applyImport = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  if (p.confirmation !== "IMPORT TRANSAKSI") throw appError("CONFIRMATION_REQUIRED", "Konfirmasi import tidak sesuai.", 400);
  const preview = await db.one("SELECT * FROM import_previews WHERE preview_id=? AND actor_id=?", [p.previewToken, context.actor.user_id]);
  if (!preview) throw appError("IMPORT_PREVIEW_EXPIRED", "Preview import tidak ditemukan.", 409);
  if (preview.status === "applied" && preview.result_json) return JSON.parse(preview.result_json);
  if (preview.expires_at <= nowIso()) throw appError("IMPORT_PREVIEW_EXPIRED", "Preview import sudah kedaluwarsa.", 409);
  const records = parseJson(preview.records_json, []);
  if (!Array.isArray(records) || digest(canonicalJson(records)) !== preview.fingerprint) throw appError("IMPORT_PREVIEW_CHANGED", "Isi preview import berubah.", 409);
  assertImportPreviewAcceptable(preview, records);

  const safety = await createTechnicalBackup(db, {
    ...context,
    action: "backup.preImport",
  }, {
    type: "pre-import",
    audit: true,
  });

  return db.transaction(async (tx) => {
    const claim = await tx.execute("UPDATE import_previews SET status='applying' WHERE preview_id=? AND status='pending'", [preview.preview_id]);
    if (claim.rowsAffected !== 1) {
      const latest = await tx.one("SELECT status,result_json FROM import_previews WHERE preview_id=?", [preview.preview_id]);
      if (latest?.status === "applied" && latest.result_json) return JSON.parse(latest.result_json);
      throw appError("IMPORT_IN_PROGRESS", "Preview import sedang diproses oleh request lain.", 409);
    }
    const created = [];
    for (let index = 0; index < records.length; index += 1) {
      created.push(await createTransactionInternal(tx, {
        ...context,
        action: "import.apply",
        idempotencyKey: `import:${preview.preview_id}:${index}`,
      }, records[index], {
        audit: false,
      }));
    }
    const issues = await integrityIssues(tx);
    if (issues.length) throw appError("IMPORT_INTEGRITY_FAILED", "Import dibatalkan karena integrity check gagal. Tidak ada transaksi import yang diterapkan.", 409, issues);
    const result = {
      applied: created.length,
      transactionIds: created.map((row) => row.transaction_id),
      safetyBackupId: safety.backupId,
      integrityVerified: true,
    };
    await appendAudit(tx, context, {
      entityType: "import",
      entityId: preview.preview_id,
      next: {
        count: created.length,
        safetyBackupId: safety.backupId,
        fingerprint: preview.fingerprint,
        integrityVerified: true,
      },
    });
    const updated = await tx.execute("UPDATE import_previews SET status='applied',result_json=?,applied_at=?,expires_at=? WHERE preview_id=? AND status='applying'", [canonicalJson(result), nowIso(), expiry(30 * 24 * 60), preview.preview_id]);
    if (updated.rowsAffected !== 1) throw appError("IMPORT_IN_PROGRESS", "Status preview import berubah saat apply. Seluruh import dibatalkan.", 409);
    return result;
  });
};

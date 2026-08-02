import { appendAudit } from "../audit.js";
import { createTransactionInternal, normalizeTransaction } from "../finance.js";
import { appError, assertOwner, canonicalJson, nowIso, uuid } from "../core.js";
import { createTechnicalBackup } from "./backup.js";
import { digest, expiry } from "./shared.js";
export const previewImport = async (db, context) => {
  assertOwner(context.actor);
  const records = context.payload?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 50) throw appError("INVALID_IMPORT", "Import harus berisi 1-50 transaksi agar apply tetap atomik dan aman pada runtime serverless.", 400);
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const fingerprints = new Set();
  for (let index = 0; index < records.length; index += 1) {
    try {
      const normalized = await normalizeTransaction(db, context, records[index]);
      const fingerprint = digest(canonicalJson([normalized.transaction_date, normalized.transaction_type, normalized.source_account_id || "", normalized.destination_account_id || "", normalized.amount, normalized.description.toLowerCase()]));
      if (fingerprints.has(fingerprint)) duplicates.push({
        index,
        record: normalized
      });else {
        fingerprints.add(fingerprint);
        valid.push({
          index,
          record: normalized
        });
      }
    } catch (error) {
      if (error.code === "POSSIBLE_DUPLICATE") duplicates.push({
        index,
        record: records[index]
      });else invalid.push({
        index,
        code: error.code || "INVALID_RECORD",
        message: error.message
      });
    }
  }
  const acceptable = valid.length > 0 && !invalid.length && !duplicates.length;
  const previewId = uuid();
  const normalizedRecords = valid.map(item => item.record);
  const fingerprint = digest(canonicalJson(normalizedRecords));
  const summary = {
    validCount: valid.length,
    invalid,
    duplicates,
    acceptable
  };
  await db.execute("DELETE FROM import_previews WHERE expires_at<?", [nowIso()]);
  await db.execute("INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,'pending',NULL,NULL,?,?)", [previewId, context.actor.user_id, canonicalJson(normalizedRecords), fingerprint, canonicalJson(summary), expiry(15), nowIso()]);
  return {
    previewToken: previewId,
    fingerprint,
    ...summary
  };
};
export const applyImport = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  if (p.confirmation !== "IMPORT TRANSAKSI") throw appError("CONFIRMATION_REQUIRED", "Konfirmasi import tidak sesuai.", 400);
  const preview = await db.one("SELECT * FROM import_previews WHERE preview_id=? AND actor_id=?", [p.previewToken, context.actor.user_id]);
  if (!preview) throw appError("IMPORT_PREVIEW_EXPIRED", "Preview import tidak ditemukan.", 409);
  if (preview.status === "applied" && preview.result_json) return JSON.parse(preview.result_json);
  if (preview.expires_at <= nowIso()) throw appError("IMPORT_PREVIEW_EXPIRED", "Preview import sudah kedaluwarsa.", 409);
  const records = JSON.parse(preview.records_json || "[]");
  if (digest(canonicalJson(records)) !== preview.fingerprint) throw appError("IMPORT_PREVIEW_CHANGED", "Isi preview import berubah.", 409);
  const safety = await createTechnicalBackup(db, {
    ...context,
    action: "backup.preImport"
  }, {
    type: "pre-import",
    audit: true
  });
  return db.transaction(async tx => {
    const claim = await tx.execute("UPDATE import_previews SET status='applying' WHERE preview_id=? AND status='pending'", [preview.preview_id]);
    if (claim.rowsAffected !== 1) {
      const latest = await tx.one("SELECT status,result_json FROM import_previews WHERE preview_id=?", [preview.preview_id]);
      if (latest?.status === "applied" && latest.result_json) return JSON.parse(latest.result_json);
      throw appError("IMPORT_IN_PROGRESS", "Preview import sedang diproses oleh request lain.", 409);
    }
    const created = [];
    for (let index = 0; index < records.length; index += 1) created.push(await createTransactionInternal(tx, {
      ...context,
      action: "import.apply",
      idempotencyKey: `import:${preview.preview_id}:${index}`
    }, records[index], {
      allowInternalLinks: true,
      audit: false
    }));
    const result = {
      applied: created.length,
      transactionIds: created.map(row => row.transaction_id),
      safetyBackupId: safety.backupId
    };
    await appendAudit(tx, context, {
      entityType: "import",
      entityId: preview.preview_id,
      next: {
        count: created.length,
        safetyBackupId: safety.backupId,
        fingerprint: preview.fingerprint
      }
    });
    await tx.execute("UPDATE import_previews SET status='applied',result_json=?,applied_at=?,expires_at=? WHERE preview_id=? AND status='applying'", [canonicalJson(result), nowIso(), expiry(30 * 24 * 60), preview.preview_id]);
    return result;
  });
};

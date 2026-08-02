import { appendAudit } from "../audit.js";
import { firstNegativeBalance } from "../readModels.js";
import { canonicalJson, nowIso, uuid } from "../core.js";

export const integrityIssues = async (db) => {
  const issues = [];
  const fk = await db.all("PRAGMA foreign_key_check");
  for (const row of fk) issues.push({ code: "FOREIGN_KEY", table: row.table, rowid: row.rowid, parent: row.parent });
  const duplicates = await db.all("SELECT idempotency_key,created_by,COUNT(*) AS count FROM transactions GROUP BY idempotency_key,created_by HAVING COUNT(*)>1");
  if (duplicates.length) issues.push({ code: "DUPLICATE_TRANSACTION_IDEMPOTENCY", count: duplicates.length });
  const invalidTransfer = await db.all("SELECT transaction_id FROM transactions WHERE transaction_type='transfer' AND (source_account_id IS NULL OR destination_account_id IS NULL OR source_account_id=destination_account_id)");
  if (invalidTransfer.length) issues.push({ code: "INVALID_TRANSFER", count: invalidTransfer.length });
  const brokenOwnership = await db.all("SELECT account_id FROM accounts WHERE (owner_scope='shared' AND owner_user_id IS NOT NULL) OR (owner_scope='personal' AND owner_user_id IS NULL)");
  if (brokenOwnership.length) issues.push({ code: "BROKEN_ACCOUNT_OWNERSHIP", count: brokenOwnership.length });
  const linkedCancelled = await db.all("SELECT occurrence_id FROM recurring_occurrences WHERE actual_amount<>(SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status='active' AND recurring_occurrence_id=recurring_occurrences.occurrence_id)");
  if (linkedCancelled.length) issues.push({ code: "RECURRING_ACTUAL_MISMATCH", count: linkedCancelled.length });
  const protectedAccounts = await db.all("SELECT * FROM accounts WHERE allow_negative=0");
  for (const account of protectedAccounts) {
    const negative = await firstNegativeBalance(db, account, { fromDate: account.initial_balance_date });
    if (negative) issues.push({ code: "NEGATIVE_BALANCE", accountId: account.account_id, date: negative.date, balance: negative.balance });
  }
  return issues;
};

export const runIntegrity = async (db, context, { audit = true } = {}) => {
  const issues = await integrityIssues(db);
  const timestamp = nowIso();
  const record = { integrity_run_id: uuid(), status: issues.length ? "failed" : "passed", issues_json: canonicalJson(issues), created_by: context.actor.user_id, created_at: timestamp };
  await db.execute("INSERT INTO integrity_runs(integrity_run_id,status,issues_json,created_by,created_at) VALUES(?,?,?,?,?)", Object.values(record));
  if (audit) await appendAudit(db, context, { entityType: "system", entityId: "integrity", next: { ok: !issues.length, issueCount: issues.length } });
  return { ok: !issues.length, checkedAt: timestamp, issues };
};

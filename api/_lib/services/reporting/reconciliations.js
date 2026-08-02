import { appendAudit } from "../audit.js";
import { accountBalanceAsOf } from "../readModels.js";
import { appError, nonNegativeInteger, nowIso, publicRow, sanitizeText, todayJakarta, uuid, visibleAccountSql } from "../core.js";

export const listReconciliations = async (db, context) => {
  const access = visibleAccountSql(context.actor, "a");
  const limit = Math.max(1, Math.min(100, Number(context.payload?.limit || 30)));
  const rows = await db.all(`SELECT r.*,a.name AS account_name FROM reconciliations r JOIN accounts a ON a.account_id=r.account_id WHERE ${access.sql} ORDER BY r.reconciled_at DESC LIMIT ?`, [...access.args, limit]);
  return { items: rows.map(publicRow) };
};

export const createReconciliation = async (db, context) => {
  const p = context.payload || {};
  const access = visibleAccountSql(context.actor, "a");
  const account = await db.one(`SELECT a.* FROM accounts a WHERE a.account_id=? AND a.status='active' AND ${access.sql}`, [p.account_id, ...access.args]);
  if (!account) throw appError("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak dapat diakses.", 404);
  const actual = nonNegativeInteger(p.actual_balance, "Saldo aktual");
  const system = await accountBalanceAsOf(db, account, todayJakarta());
  const timestamp = nowIso();
  const record = { reconciliation_id: uuid(), account_id: account.account_id, reconciled_at: timestamp, system_balance: system, actual_balance: actual, difference: actual - system, notes: sanitizeText(p.notes, 250), status: actual === system ? "matched" : "difference", created_by: context.actor.user_id, created_at: timestamp };
  await db.execute("INSERT INTO reconciliations(reconciliation_id,account_id,reconciled_at,system_balance,actual_balance,difference,notes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(record));
  await appendAudit(db, context, { entityType: "reconciliation", entityId: record.reconciliation_id, next: publicRow(record) });
  return publicRow(record);
};

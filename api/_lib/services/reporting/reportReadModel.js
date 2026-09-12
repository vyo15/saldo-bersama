import { monthBounds, publicRow, readableLedgerSql, visibleScopeSql } from "../core.js";

const NATURE_LABELS = Object.freeze({
  fixed: "Kebutuhan tetap",
  variable: "Kebutuhan variabel",
  unexpected: "Tidak terduga",
  discretionary: "Hiburan/pribadi",
  emergency: "Darurat",
  savings: "Tabungan/masa depan",
  other: "Lainnya",
});

const expenseScope = (allocationRuleId, alias = "t") => allocationRuleId
  ? { sql: `${alias}.envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)`, args: [allocationRuleId] }
  : { sql: "1=1", args: [] };

export const reportAllocationStatement = (actor, period, { usageEndDate = "" } = {}) => {
  const bounds = monthBounds(period);
  const usedThrough = usageEndDate || bounds.end;
  const access = visibleScopeSql(actor, "r");
  return {
    sql: `SELECT r.envelope_rule_id,COALESCE(NULLIF(TRIM(r.name),''),NULLIF(TRIM(p.name),''),'Alokasi') AS name,
      r.decoration_key,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id,
      COALESCE(SUM(p.allocated_amount),0) AS allocated_amount,
      COALESCE(SUM(p.reserved_amount),0) AS reserved_amount,
      COALESCE(SUM((SELECT SUM(t.amount) FROM transactions t
        WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id
          AND t.transaction_date BETWEEN ? AND ?)),0) AS used_amount
      FROM envelope_rules r JOIN envelope_periods p ON p.envelope_rule_id=r.envelope_rule_id
      WHERE p.period_start<=? AND p.period_end>=? AND ${access.sql}
      GROUP BY r.envelope_rule_id,r.name,r.decoration_key,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id
      ORDER BY r.name COLLATE NOCASE,r.envelope_rule_id`,
    args: [bounds.start, usedThrough, bounds.end, bounds.start, ...access.args],
  };
};

export const mapReportAllocations = (rows = []) => rows.map((row) => {
  const allocated = Number(row.allocated_amount || 0);
  const used = Number(row.used_amount || 0);
  return {
    ...publicRow(row),
    allocated_amount: allocated,
    reserved_amount: Number(row.reserved_amount || 0),
    used_amount: used,
    remaining_amount: allocated - used,
    usage_percent: allocated > 0 ? Math.round((used / allocated) * 100) : used > 0 ? 100 : 0,
  };
});

export const reportBreakdownStatements = (actor, startDate, endDate, { allocationRuleId = "" } = {}) => {
  const ledger = readableLedgerSql(actor, "t");
  const scope = expenseScope(allocationRuleId, "t");
  const where = `t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ? AND ${ledger.sql} AND ${scope.sql}`;
  const args = [startDate, endDate, ...ledger.args, ...scope.args];
  return [
    { sql: `SELECT a.account_id,a.name,a.owner_scope,a.owner_user_id,COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS owner_name,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t JOIN accounts a ON a.account_id=t.source_account_id
      LEFT JOIN users u ON u.user_id=a.owner_user_id
      WHERE ${where}
      GROUP BY a.account_id,a.name,a.owner_scope,a.owner_user_id,u.name ORDER BY amount DESC`, args },
    { sql: `SELECT u.user_id,u.name,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t JOIN users u ON u.user_id=t.created_by
      WHERE ${where}
      GROUP BY u.user_id,u.name ORDER BY amount DESC`, args },
    { sql: `SELECT COALESCE(c.nature,'other') AS nature,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id
      WHERE ${where}
      GROUP BY COALESCE(c.nature,'other') ORDER BY amount DESC`, args },
    { sql: `SELECT c.category_id,COALESCE(NULLIF(TRIM(c.name),''),'Tanpa kategori') AS label,c.icon,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id
      WHERE ${where}
      GROUP BY c.category_id,c.name,c.icon ORDER BY amount DESC,label`, args },
    { sql: `SELECT t.cost_share_json
      FROM transactions t
      WHERE ${where} AND t.scope='shared' AND t.cost_share_mode<>'unspecified'`, args },
    { sql: "SELECT user_id,name,role FROM users ORDER BY name COLLATE NOCASE,user_id", args: [] },
  ];
};

export const mapReportBreakdowns = ([accounts = [], creators = [], natures = [], categories = [], costShareRows = [], users = []], aggregateCostShares) => ({
  accountExpenses: accounts.map((row) => ({
    ...publicRow(row),
    label: row.owner_scope === "personal" ? `${row.name} · Pribadi · ${row.owner_name}` : `${row.name} · Bersama`,
  })),
  creatorExpenses: creators.map((row) => ({ ...publicRow(row), label: row.name })),
  natureExpenses: natures.map((row) => ({ ...publicRow(row), label: NATURE_LABELS[row.nature] || NATURE_LABELS.other })),
  categoryExpenses: categories.map((row) => ({ ...publicRow(row), amount: Number(row.amount || 0), transaction_count: Number(row.transaction_count || 0) })),
  costShareExpenses: aggregateCostShares(costShareRows, users),
});

export const reportTransactionsStatement = (actor, startDate, endDate, { allocationRuleId = "" } = {}) => {
  const ledger = readableLedgerSql(actor, "t");
  const scope = allocationRuleId
    ? { sql: "t.transaction_type='expense' AND ep.envelope_rule_id=?", args: [allocationRuleId] }
    : { sql: "1=1", args: [] };
  return {
    sql: `SELECT t.transaction_id,t.transaction_date,t.transaction_type,t.amount,t.description,t.merchant,t.payment_method,
      t.category_id,c.name AS category_name,t.budget_id,b.name AS budget_name,
      t.envelope_period_id,ep.envelope_rule_id,COALESCE(NULLIF(TRIM(er.name),''),NULLIF(TRIM(ep.name),''),'') AS allocation_name,
      sa.name AS source_account_name,da.name AS destination_account_name,
      COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS creator_name,t.created_at
      FROM transactions t
      LEFT JOIN categories c ON c.category_id=t.category_id
      LEFT JOIN budgets b ON b.budget_id=t.budget_id
      LEFT JOIN envelope_periods ep ON ep.envelope_period_id=t.envelope_period_id
      LEFT JOIN envelope_rules er ON er.envelope_rule_id=ep.envelope_rule_id
      LEFT JOIN accounts sa ON sa.account_id=t.source_account_id
      LEFT JOIN accounts da ON da.account_id=t.destination_account_id
      LEFT JOIN users u ON u.user_id=t.created_by
      WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${ledger.sql} AND ${scope.sql}
      ORDER BY t.transaction_date ASC,t.created_at ASC,t.transaction_id ASC`,
    args: [startDate, endDate, ...ledger.args, ...scope.args],
  };
};

const transactionDelta = (row, allocationScoped) => {
  const amount = Number(row.amount || 0);
  if (allocationScoped) return -amount;
  if (row.transaction_type === "expense") return -amount;
  if (["income", "refund", "adjustment"].includes(row.transaction_type)) return amount;
  return 0;
};

export const mapReportTransactions = (rows = [], { openingBalance = 0, allocationScoped = false } = {}) => {
  let running = Number(openingBalance || 0);
  const mapped = rows.map((row) => {
    const amount = Number(row.amount || 0);
    const debit = row.transaction_type === "expense" ? amount : 0;
    const credit = allocationScoped ? 0 : ["income", "refund", "adjustment"].includes(row.transaction_type) ? amount : 0;
    running += transactionDelta(row, allocationScoped);
    return {
      ...publicRow(row),
      amount,
      debit,
      credit,
      running_balance: running,
      description: row.description || row.merchant || row.category_name || "Transaksi",
      account_name: row.source_account_name || row.destination_account_name || "-",
    };
  });
  return mapped.reverse();
};

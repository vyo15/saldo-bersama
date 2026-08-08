import { monthBounds, publicRow, readableAccountSql, readableLedgerSql, todayJakarta, visibleScopeSql } from "./core.js";

export const transactionImpact = (accountId, transaction) => {
  if (transaction.status !== "active") return 0;
  const amount = Number(transaction.amount || 0);
  if (["income", "refund"].includes(transaction.transaction_type)) return transaction.destination_account_id === accountId ? amount : 0;
  if (transaction.transaction_type === "expense") return transaction.source_account_id === accountId ? -amount : 0;
  if (transaction.transaction_type === "transfer") {
    if (transaction.source_account_id === accountId) return -amount;
    if (transaction.destination_account_id === accountId) return amount;
  }
  if (transaction.transaction_type === "adjustment" && transaction.source_account_id === accountId) return amount;
  return 0;
};

export const visibleAccounts = async (db, actor, { includeArchived = false, cutoffDate = todayJakarta() } = {}) => {
  const access = readableAccountSql(actor, "a");
  const rows = await db.all(`SELECT a.*,COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS owner_name,
    CASE WHEN a.initial_balance_date <= ? THEN a.initial_balance ELSE 0 END + COALESCE((
      SELECT SUM(CASE
        WHEN t.status <> 'active' OR t.transaction_date > ? OR t.transaction_date < a.initial_balance_date THEN 0
        WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id = a.account_id THEN t.amount
        WHEN t.transaction_type = 'expense' AND t.source_account_id = a.account_id THEN -t.amount
        WHEN t.transaction_type = 'transfer' AND t.source_account_id = a.account_id THEN -t.amount
        WHEN t.transaction_type = 'transfer' AND t.destination_account_id = a.account_id THEN t.amount
        WHEN t.transaction_type = 'adjustment' AND t.source_account_id = a.account_id THEN t.amount
        ELSE 0 END)
      FROM transactions t
      WHERE t.source_account_id = a.account_id OR t.destination_account_id = a.account_id
    ),0) AS balance
    FROM accounts a
    LEFT JOIN users u ON u.user_id=a.owner_user_id
    WHERE ${access.sql} ${includeArchived ? "" : "AND a.status = 'active'"}
    ORDER BY a.status, a.name COLLATE NOCASE`, [cutoffDate, cutoffDate, ...access.args]);
  return rows.map((row) => {
    const item = publicRow(row, ["allow_negative"]);
    const actorOwnsAccount = item.owner_scope === "personal" && item.owner_user_id === actor.user_id;
    const canOperate = actor.role === "owner" || item.owner_scope === "shared" || actorOwnsAccount;
    return {
      ...item,
      owner_name: item.owner_scope === "personal" ? item.owner_name : "",
      is_owned_by_actor: actorOwnsAccount,
      can_transact: canOperate,
      can_reconcile: canOperate,
      can_manage: actor.role === "owner",
      read_only: !canOperate && actor.role !== "owner",
    };
  });
};

export const accountBalanceAsOf = async (db, account, cutoffDate = todayJakarta(), { excludeTransactionId = null, candidate = null } = {}) => {
  if (!account || cutoffDate < account.initial_balance_date) return 0;
  const rows = await db.all(`SELECT * FROM transactions
    WHERE status='active' AND transaction_date BETWEEN ? AND ?
      AND (source_account_id=? OR destination_account_id=?)
      ${excludeTransactionId ? "AND transaction_id <> ?" : ""}
    ORDER BY transaction_date, created_at`, [account.initial_balance_date, cutoffDate, account.account_id, account.account_id, ...(excludeTransactionId ? [excludeTransactionId] : [])]);
  let total = Number(account.initial_balance || 0);
  for (const row of rows) total += transactionImpact(account.account_id, row);
  if (candidate && candidate.transaction_date >= account.initial_balance_date && candidate.transaction_date <= cutoffDate) total += transactionImpact(account.account_id, { status: "active", ...candidate });
  return total;
};

export const firstNegativeBalance = async (db, account, { excludeTransactionId = null, candidate = null, fromDate = account.initial_balance_date } = {}) => {
  const rows = await db.all(`SELECT * FROM transactions
    WHERE status='active' AND transaction_date >= ?
      AND (source_account_id=? OR destination_account_id=?)
      ${excludeTransactionId ? "AND transaction_id <> ?" : ""}
    ORDER BY transaction_date, created_at, transaction_id`, [account.initial_balance_date, account.account_id, account.account_id, ...(excludeTransactionId ? [excludeTransactionId] : [])]);
  if (candidate) rows.push({ status: "active", created_at: "9999", transaction_id: "candidate", ...candidate });
  rows.sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)) || String(a.created_at).localeCompare(String(b.created_at)) || String(a.transaction_id).localeCompare(String(b.transaction_id)));
  let balance = Number(account.initial_balance || 0);
  if (balance < 0 && account.initial_balance_date >= fromDate) return { date: account.initial_balance_date, balance };
  for (const row of rows) {
    balance += transactionImpact(account.account_id, row);
    if (balance < 0 && row.transaction_date >= fromDate) return { date: row.transaction_date, balance };
  }
  return null;
};

export const visibleTransactions = async (db, actor, { startDate = null, endDate = null, includeCancelled = true } = {}) => {
  const access = readableLedgerSql(actor, "t");
  const conditions = [access.sql];
  const args = [...access.args];
  if (startDate) { conditions.push("t.transaction_date >= ?"); args.push(startDate); }
  if (endDate) { conditions.push("t.transaction_date <= ?"); args.push(endDate); }
  if (!includeCancelled) conditions.push("t.status = 'active'");
  const rows = await db.all(`SELECT t.* FROM transactions t WHERE ${conditions.join(" AND ")}
    ORDER BY t.transaction_date DESC, t.created_at DESC`, args);
  return rows.map((row) => publicRow(row));
};

export const categoryExpenseTotals = async (db, actor, startDate, endDate) => {
  const access = readableLedgerSql(actor, "t");
  const rows = await db.all(`SELECT t.category_id, COALESCE(c.name,'Tanpa kategori') AS name, SUM(t.amount) AS amount
    FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id
    WHERE t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ? AND ${access.sql}
    GROUP BY t.category_id,c.name ORDER BY amount DESC`, [startDate, endDate, ...access.args]);
  return rows.map((row) => publicRow(row));
};

export const envelopeItems = async (db, actor, { period = null, includeClosed = true } = {}) => {
  const access = visibleScopeSql(actor, "r");
  const conditions = [access.sql];
  const args = [...access.args];
  if (!includeClosed) conditions.push("p.status='active'");
  if (period) { const bounds = monthBounds(period); conditions.push("p.period_start <= ? AND p.period_end >= ?"); args.push(bounds.end, bounds.start); }
  const rows = await db.all(`SELECT p.*,r.name AS rule_name,r.period_type,r.scope,r.owner_user_id,r.source_account_id,r.rollover_policy,r.overspend_policy,r.row_version AS rule_row_version,
    COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0) AS used_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE r.status='active' AND ${conditions.join(" AND ")}
    ORDER BY p.period_start DESC,r.name`, args);
  return rows.map((row) => ({ ...publicRow(row), name: row.name || row.rule_name, remaining_amount: Number(row.allocated_amount) - Number(row.reserved_amount) - Number(row.used_amount) }));
};

export const goalProgress = async (db, goalId, cutoffDate = todayJakarta()) => {
  const row = await db.one(`SELECT COALESCE(SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END),0) AS total
    FROM goal_movements m LEFT JOIN transactions t ON t.transaction_id=m.transaction_id
    WHERE m.goal_id=? AND m.status='active' AND COALESCE(t.transaction_date,substr(m.created_at,1,10)) <= ?`, [goalId, cutoffDate]);
  return Number(row?.total || 0);
};

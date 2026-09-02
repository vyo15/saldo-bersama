import { monthBounds, publicRow, readableAccountSql, readableLedgerSql, todayJakarta, visibleScopeSql } from "./core.js";

export const transactionImpact = (accountId, transaction) => {
  if (transaction.status !== "active") return 0;
  if (transaction.investment_account_id === accountId) return Number(transaction.investment_cash_effect || 0);
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

export const visibleAccountsStatement = (actor, { includeArchived = false, cutoffDate = todayJakarta() } = {}) => {
  const access = readableAccountSql(actor, "a");
  return {
    sql: `SELECT a.*,COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS owner_name,
      CASE WHEN a.initial_balance_date <= ? THEN a.initial_balance ELSE 0 END + COALESCE((
        SELECT SUM(CASE
          WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id = a.account_id THEN t.amount
          WHEN t.transaction_type = 'expense' AND t.source_account_id = a.account_id THEN -t.amount
          WHEN t.transaction_type = 'transfer' AND t.source_account_id = a.account_id THEN -t.amount
          WHEN t.transaction_type = 'transfer' AND t.destination_account_id = a.account_id THEN t.amount
          WHEN t.transaction_type = 'adjustment' AND t.source_account_id = a.account_id THEN t.amount
          ELSE 0 END)
        FROM transactions t
        WHERE t.status='active'
          AND t.transaction_date BETWEEN a.initial_balance_date AND ?
          AND (t.source_account_id = a.account_id OR t.destination_account_id = a.account_id)
      ),0) + COALESCE((
        SELECT SUM(e.cash_effect)
        FROM investment_account_events e
        WHERE e.account_id=a.account_id AND e.event_date BETWEEN a.initial_balance_date AND ?
      ),0) AS balance,
      COALESCE((
        SELECT SUM(CASE
          WHEN p.allocated_amount - COALESCE((
            SELECT SUM(et.amount) FROM transactions et
            WHERE et.status='active' AND et.transaction_type='expense' AND et.envelope_period_id=p.envelope_period_id
              AND et.transaction_date <= ?
          ),0) > 0
          THEN p.allocated_amount - COALESCE((
            SELECT SUM(et.amount) FROM transactions et
            WHERE et.status='active' AND et.transaction_type='expense' AND et.envelope_period_id=p.envelope_period_id
              AND et.transaction_date <= ?
          ),0)
          ELSE 0 END)
        FROM envelope_periods p
        JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
        WHERE p.status='active' AND r.status='active' AND r.source_account_id=a.account_id
      ),0) AS allocated_remaining
      FROM accounts a
      LEFT JOIN users u ON u.user_id=a.owner_user_id
      WHERE ${access.sql} ${includeArchived ? "" : "AND a.status = 'active'"}
      ORDER BY a.status, a.name COLLATE NOCASE`,
    args: [cutoffDate, cutoffDate, cutoffDate, cutoffDate, cutoffDate, ...access.args],
  };
};

export const mapVisibleAccountRows = (rows, actor) => rows.map((row) => {
  const item = publicRow(row, ["allow_negative"]);
  const actorOwnsAccount = item.owner_scope === "personal" && item.owner_user_id === actor.user_id;
  const canOperate = actor.role === "owner" || item.owner_scope === "shared" || actorOwnsAccount;
  const balance = Number(item.balance || 0);
  const allocatedRemaining = Math.max(0, Number(item.allocated_remaining || 0));
  return {
    ...item,
    balance,
    allocated_remaining: allocatedRemaining,
    available_balance: balance - allocatedRemaining,
    owner_name: item.owner_scope === "personal" ? item.owner_name : "",
    is_owned_by_actor: actorOwnsAccount,
    can_transact: canOperate,
    can_reconcile: canOperate,
    can_manage: actor.role === "owner",
    read_only: !canOperate && actor.role !== "owner",
  };
});

export const visibleAccounts = async (db, actor, options = {}) => {
  const statement = visibleAccountsStatement(actor, options);
  return mapVisibleAccountRows(await db.all(statement.sql, statement.args), actor);
};

export const accountBalanceAsOf = async (db, account, cutoffDate = todayJakarta(), { excludeTransactionId = null, candidate = null } = {}) => {
  if (!account || cutoffDate < account.initial_balance_date) return 0;
  const rows = await db.all(`SELECT transaction_id,transaction_date,created_at,status,transaction_type,amount,source_account_id,destination_account_id,NULL AS investment_account_id,0 AS investment_cash_effect
    FROM transactions
    WHERE status='active' AND transaction_date BETWEEN ? AND ?
      AND (source_account_id=? OR destination_account_id=?)
      ${excludeTransactionId ? "AND transaction_id <> ?" : ""}
    UNION ALL
    SELECT event_id AS transaction_id,event_date AS transaction_date,created_at,'active' AS status,'investment' AS transaction_type,0 AS amount,NULL AS source_account_id,NULL AS destination_account_id,account_id AS investment_account_id,cash_effect AS investment_cash_effect
    FROM investment_account_events
    WHERE account_id=? AND event_date BETWEEN ? AND ?
    ORDER BY transaction_date, created_at`, [account.initial_balance_date, cutoffDate, account.account_id, account.account_id, ...(excludeTransactionId ? [excludeTransactionId] : []), account.account_id, account.initial_balance_date, cutoffDate]);
  let total = Number(account.initial_balance || 0);
  for (const row of rows) total += transactionImpact(account.account_id, row);
  if (candidate && candidate.transaction_date >= account.initial_balance_date && candidate.transaction_date <= cutoffDate) total += transactionImpact(account.account_id, { status: "active", ...candidate });
  return total;
};

export const accountAllocatedRemaining = async (db, accountId, { cutoffDate = todayJakarta(), excludePeriodId = null, excludeTransactionId = null, candidate = null } = {}) => {
  const rows = await db.all(`SELECT p.envelope_period_id,p.allocated_amount,p.reserved_amount,
      COALESCE(SUM(CASE WHEN t.transaction_id IS NOT NULL THEN t.amount ELSE 0 END),0) AS used_amount
    FROM envelope_periods p
    JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    LEFT JOIN transactions t ON t.envelope_period_id=p.envelope_period_id
      AND t.status='active' AND t.transaction_type='expense' AND t.transaction_date<=?
      ${excludeTransactionId ? "AND t.transaction_id<>?" : ""}
    WHERE p.status='active' AND r.status='active' AND r.source_account_id=?
      ${excludePeriodId ? "AND p.envelope_period_id<>?" : ""}
    GROUP BY p.envelope_period_id,p.allocated_amount,p.reserved_amount`, [
    cutoffDate,
    ...(excludeTransactionId ? [excludeTransactionId] : []),
    accountId,
    ...(excludePeriodId ? [excludePeriodId] : []),
  ]);
  return rows.reduce((sum, row) => {
    const candidateUsed = candidate
      && candidate.status !== "cancelled"
      && candidate.transaction_type === "expense"
      && candidate.source_account_id === accountId
      && candidate.envelope_period_id === row.envelope_period_id
      && candidate.transaction_date <= cutoffDate
      ? Number(candidate.amount || 0)
      : 0;
    return sum + Math.max(0, Number(row.allocated_amount || 0) - Number(row.used_amount || 0) - candidateUsed);
  }, 0);
};

export const firstNegativeBalanceFromRows = (account, transactionRows = [], { candidate = null, fromDate = account.initial_balance_date } = {}) => {
  const rows = [...transactionRows];
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

export const firstNegativeBalance = async (db, account, { excludeTransactionId = null, candidate = null, fromDate = account.initial_balance_date } = {}) => {
  const rows = await db.all(`SELECT event_id AS transaction_id,event_date AS transaction_date,created_at,'active' AS status,'investment' AS transaction_type,0 AS amount,NULL AS source_account_id,NULL AS destination_account_id,account_id AS investment_account_id,cash_effect AS investment_cash_effect
    FROM investment_account_events
    WHERE account_id=? AND event_date >= ?
    UNION ALL
    SELECT transaction_id,transaction_date,created_at,status,transaction_type,amount,source_account_id,destination_account_id,NULL AS investment_account_id,0 AS investment_cash_effect
    FROM transactions
    WHERE status='active' AND transaction_date >= ?
      AND (source_account_id=? OR destination_account_id=?)
      ${excludeTransactionId ? "AND transaction_id <> ?" : ""}
    ORDER BY transaction_date, created_at, transaction_id`, [account.account_id, account.initial_balance_date, account.initial_balance_date, account.account_id, account.account_id, ...(excludeTransactionId ? [excludeTransactionId] : [])]);
  return firstNegativeBalanceFromRows(account, rows, { candidate, fromDate });
};

export const visibleTransactions = async (db, actor, { startDate = null, endDate = null, includeCancelled = true, limit = null } = {}) => {
  const access = readableLedgerSql(actor, "t");
  const conditions = [access.sql];
  const args = [...access.args];
  if (startDate) { conditions.push("t.transaction_date >= ?"); args.push(startDate); }
  if (endDate) { conditions.push("t.transaction_date <= ?"); args.push(endDate); }
  if (!includeCancelled) conditions.push("t.status = 'active'");
  const safeLimit = Number.isSafeInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : null;
  const rows = await db.all(`SELECT t.* FROM transactions t WHERE ${conditions.join(" AND ")}
    ORDER BY t.transaction_date DESC, t.created_at DESC${safeLimit ? " LIMIT ?" : ""}`, [...args, ...(safeLimit ? [safeLimit] : [])]);
  return rows.map((row) => publicRow(row));
};

export const categoryExpenseTotalsStatement = (actor, startDate, endDate) => {
  const access = readableLedgerSql(actor, "t");
  return {
    sql: `SELECT t.category_id, COALESCE(c.name,'Tanpa kategori') AS name, SUM(t.amount) AS amount
      FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id
      WHERE t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ? AND ${access.sql}
      GROUP BY t.category_id,c.name ORDER BY amount DESC`,
    args: [startDate, endDate, ...access.args],
  };
};

export const mapCategoryExpenseRows = (rows) => rows.map((row) => publicRow(row));

export const categoryExpenseTotals = async (db, actor, startDate, endDate) => {
  const statement = categoryExpenseTotalsStatement(actor, startDate, endDate);
  return mapCategoryExpenseRows(await db.all(statement.sql, statement.args));
};

export const envelopeItemsStatement = (actor, { period = null, includeClosed = true } = {}) => {
  const access = visibleScopeSql(actor, "r");
  const conditions = [access.sql];
  const outerArgs = [...access.args];
  const usageConditions = ["status='active'", "transaction_type='expense'", "envelope_period_id IS NOT NULL"];
  const usageArgs = [];
  if (!includeClosed) conditions.push("p.status='active'");
  if (period) {
    const bounds = monthBounds(period);
    conditions.push("p.period_start <= ? AND p.period_end >= ?");
    outerArgs.push(bounds.end, bounds.start);
    usageConditions.push("transaction_date BETWEEN ? AND ?");
    usageArgs.push(bounds.start, bounds.end);
  }
  return {
    sql: `SELECT p.*,r.name AS rule_name,r.period_type,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id,r.rollover_policy,r.overspend_policy,r.row_version AS rule_row_version,
      sa.name AS source_account_name,
      COALESCE(NULLIF(TRIM(au.name),''),NULLIF(TRIM(au.email),''),'') AS assignee_name,au.role AS assignee_role,
      COALESCE(usage.used_amount,0) AS used_amount
      FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
      LEFT JOIN accounts sa ON sa.account_id=r.source_account_id
      LEFT JOIN users au ON au.user_id=r.assignee_user_id
      LEFT JOIN (
        SELECT envelope_period_id,SUM(amount) AS used_amount FROM transactions
        WHERE ${usageConditions.join(" AND ")}
        GROUP BY envelope_period_id
      ) usage ON usage.envelope_period_id=p.envelope_period_id
      WHERE r.status='active' AND ${conditions.join(" AND ")}
      ORDER BY p.period_start DESC,r.name`,
    args: [...usageArgs, ...outerArgs],
  };
};

export const mapEnvelopeItemRows = (rows) => rows.map((row) => ({
  ...publicRow(row),
  name: row.name || row.rule_name,
  remaining_amount: Number(row.allocated_amount) - Number(row.reserved_amount) - Number(row.used_amount),
}));

export const envelopeItems = async (db, actor, options = {}) => {
  const statement = envelopeItemsStatement(actor, options);
  return mapEnvelopeItemRows(await db.all(statement.sql, statement.args));
};

export const goalProgress = async (db, goalId, cutoffDate = todayJakarta()) => {
  const row = await db.one(`SELECT COALESCE(SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END),0) AS total
    FROM goal_movements m LEFT JOIN transactions t ON t.transaction_id=m.transaction_id
    WHERE m.goal_id=? AND m.status='active' AND COALESCE(t.transaction_date,substr(m.created_at,1,10)) <= ?`, [goalId, cutoffDate]);
  return Number(row?.total || 0);
};

function indexRowsByField_(items, field) {
  const index = {};
  (items || []).forEach(function(item) { index[String(item[field] || "")] = item; });
  return index;
}

function groupRowsByField_(items, field) {
  const groups = {};
  (items || []).forEach(function(item) {
    const key = String(item[field] || "");
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return groups;
}

function periodEndDate_(periodKey) {
  const parts = String(periodKey).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = new Date(year, month, 0).getDate();
  return periodKey + "-" + String(day).padStart(2, "0");
}

function periodStartDate_(periodKey) { return String(periodKey) + "-01"; }

function dateBefore_(dateString) {
  const date = new Date(String(dateString) + "T12:00:00+07:00");
  date.setDate(date.getDate() - 1);
  return Utilities.formatDate(date, SB_TIMEZONE, "yyyy-MM-dd");
}

function periodCutoffDate_(periodKey) {
  const period = periodKey_(periodKey);
  const current = monthKey_();
  if (period < current) return periodEndDate_(period);
  return today_();
}

function buildTransactionReadModel_(context, transactionSnapshot) {
  const cache = requestCache_();
  const actorKey = context && context.actor
    ? [context.actor.user_id || "", context.actor.role || ""].join(":")
    : "system";
  const cacheKey = "transactions:" + actorKey + ":" + (transactionSnapshot ? "snapshot" : "sheet");
  if (!transactionSnapshot && cache.readModels && cache.readModels[cacheKey]) return cache.readModels[cacheKey];

  const accounts = rows_("Accounts");
  const accountById = indexRowsByField_(accounts, "account_id");
  const source = transactionSnapshot || rows_("Transactions");
  const visible = source.filter(function(transaction) {
    if (context && !canAccessOwnedScope_(context, transaction.scope, transaction.owner_user_id)) return false;
    return [transaction.source_account_id, transaction.destination_account_id].filter(Boolean).every(function(accountId) {
      const account = accountById[String(accountId)];
      if (!account) return !context || !context.actor || context.actor.role === "owner";
      return !context || canAccessAccount_(context, account);
    });
  });

  const active = visible.filter(function(transaction) { return transaction.status === "active"; });
  const byPeriod = {};
  const activeByPeriod = {};
  const byAccount = {};
  const byEnvelope = {};
  const byCategory = {};
  visible.forEach(function(transaction) {
    const period = String(transaction.transaction_date || "").slice(0, 7);
    if (!byPeriod[period]) byPeriod[period] = [];
    byPeriod[period].push(transaction);
  });
  active.forEach(function(transaction) {
    const period = String(transaction.transaction_date || "").slice(0, 7);
    if (!activeByPeriod[period]) activeByPeriod[period] = [];
    activeByPeriod[period].push(transaction);
    [transaction.source_account_id, transaction.destination_account_id].filter(Boolean).forEach(function(accountId) {
      const key = String(accountId);
      if (!byAccount[key]) byAccount[key] = [];
      byAccount[key].push(transaction);
    });
    if (transaction.envelope_period_id) {
      const envelopeKey = String(transaction.envelope_period_id);
      if (!byEnvelope[envelopeKey]) byEnvelope[envelopeKey] = [];
      byEnvelope[envelopeKey].push(transaction);
    }
    if (transaction.category_id) {
      const categoryKey = String(transaction.category_id);
      if (!byCategory[categoryKey]) byCategory[categoryKey] = [];
      byCategory[categoryKey].push(transaction);
    }
  });

  const model = {
    accounts: accounts,
    accountById: accountById,
    transactionById: indexRowsByField_(visible, "transaction_id"),
    transactions: visible,
    activeTransactions: active,
    transactionsByPeriod: byPeriod,
    activeTransactionsByPeriod: activeByPeriod,
    transactionsByAccount: byAccount,
    transactionsByEnvelope: byEnvelope,
    transactionsByCategory: byCategory
  };
  if (!transactionSnapshot) {
    if (!cache.readModels) cache.readModels = {};
    cache.readModels[cacheKey] = model;
  }
  return model;
}

function accountBalancesAsOfFromModel_(model, cutoffDate) {
  const cutoff = String(cutoffDate || today_());
  const balances = {};
  (model.accounts || []).forEach(function(account) {
    const initialDate = accountInitialDate_(account);
    balances[String(account.account_id)] = cutoff < initialDate ? 0 : Number(account.initial_balance || 0);
  });
  (model.activeTransactions || []).forEach(function(transaction) {
    const date = String(transaction.transaction_date || "");
    if (!date || date > cutoff) return;
    [transaction.source_account_id, transaction.destination_account_id].filter(Boolean).forEach(function(accountId) {
      const account = model.accountById[String(accountId)];
      if (!account || date < accountInitialDate_(account)) return;
      balances[String(accountId)] = Number(balances[String(accountId)] || 0) + transactionBalanceImpact_(String(accountId), transaction);
    });
  });
  return balances;
}

function expenseTotalsByEnvelope_(transactions, cutoffDate) {
  const totals = {};
  const cutoff = cutoffDate ? String(cutoffDate) : "";
  (transactions || []).forEach(function(row) {
    if (row.status !== "active" || row.transaction_type !== "expense" || !row.envelope_period_id) return;
    if (cutoff && String(row.transaction_date || "") > cutoff) return;
    const key = String(row.envelope_period_id);
    totals[key] = Number(totals[key] || 0) + Number(row.amount || 0);
  });
  return totals;
}

function expenseTotalsByCategory_(transactions, cutoffDate) {
  const totals = {};
  const cutoff = cutoffDate ? String(cutoffDate) : "";
  (transactions || []).forEach(function(row) {
    if (row.status !== "active" || row.transaction_type !== "expense" || !row.category_id) return;
    if (cutoff && String(row.transaction_date || "") > cutoff) return;
    const key = String(row.category_id);
    totals[key] = Number(totals[key] || 0) + Number(row.amount || 0);
  });
  return totals;
}

function goalMovementReadModelAsOf_(cutoffDate, transactionSnapshot, movementSnapshot) {
  const cutoff = String(cutoffDate || today_());
  const transactions = transactionSnapshot || rows_("Transactions");
  const transactionById = indexRowsByField_(transactions, "transaction_id");
  const movements = movementSnapshot || rows_("Goal_Movements");
  const byGoal = {};
  const totals = {};
  const latestByGoal = {};
  movements.forEach(function(row) {
    if (row.status !== "active") return;
    let effectiveDate = String(row.created_at || "").slice(0, 10);
    if (row.transaction_id) {
      const transaction = transactionById[String(row.transaction_id)];
      if (!transaction || transaction.status !== "active") return;
      effectiveDate = String(transaction.transaction_date || "");
    }
    if (!effectiveDate || effectiveDate > cutoff) return;
    const key = String(row.goal_id || "");
    if (!byGoal[key]) byGoal[key] = [];
    byGoal[key].push(row);
    const amount = Number(row.amount || 0);
    totals[key] = Number(totals[key] || 0) + (row.movement_type === "withdraw" ? -amount : amount);
    const currentLatest = latestByGoal[key];
    if (!currentLatest || String(row.created_at || "").localeCompare(String(currentLatest.created_at || "")) > 0) latestByGoal[key] = row;
  });
  return { byGoal: byGoal, totals: totals, latestByGoal: latestByGoal, transactionById: transactionById };
}

function goalMovementTotalsAsOf_(movements, cutoffDate, transactionSnapshot) {
  return goalMovementReadModelAsOf_(cutoffDate, transactionSnapshot, movements).totals;
}

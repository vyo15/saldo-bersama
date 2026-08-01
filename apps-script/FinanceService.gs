function isPeriodClosed_(dateString) {
  const periodKey = String(dateString || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(periodKey)) return false;
  return rows_("Period_Closures").some(function(row) {
    return String(row.period_key) === periodKey && row.status === "closed";
  });
}

function assertPeriodOpen_(dateString) {
  const periodKey = String(dateString).slice(0, 7);
  if (isPeriodClosed_(dateString)) throw sbError_("PERIOD_CLOSED", "Periode " + periodKey + " sudah ditutup.", 409);
}

function transactionLockingClosure_(dateString) {
  const period = String(dateString || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  return rows_("Period_Closures").filter(function(row) {
    return row.status === "closed" && String(row.period_key || "") >= period;
  }).sort(function(left, right) {
    return String(left.period_key || "").localeCompare(String(right.period_key || ""));
  })[0] || null;
}

function isTransactionDateLocked_(dateString) {
  return Boolean(transactionLockingClosure_(dateString));
}

function assertTransactionDateUnlocked_(dateString) {
  const period = String(dateString || "").slice(0, 7);
  const closure = transactionLockingClosure_(dateString);
  if (!closure) return;
  throw sbError_("PERIOD_CLOSED", "Transaksi periode " + period + " dikunci karena periode " + closure.period_key + " sudah ditutup.", 409, {
    transactionPeriod: period,
    lockingPeriod: closure.period_key,
    closureId: closure.closure_id
  });
}

function assertPeriodRangeOpen_(startDate, endDate) {
  const startPeriod = periodKey_(String(startDate).slice(0, 7));
  const endPeriod = periodKey_(String(endDate).slice(0, 7));
  let cursor = startPeriod;
  let checked = 0;
  while (cursor <= endPeriod && checked < 120) {
    if (isPeriodClosed_(cursor + "-01")) throw sbError_("PERIOD_CLOSED", "Periode " + cursor + " sudah ditutup.", 409);
    const parts = cursor.split("-").map(Number);
    const next = new Date(parts[0], parts[1], 1);
    cursor = String(next.getFullYear()) + "-" + String(next.getMonth() + 1).padStart(2, "0");
    checked += 1;
  }
  if (checked >= 120 && cursor <= endPeriod) throw sbError_("INVALID_PERIOD_RANGE", "Rentang periode terlalu panjang.", 400);
}

function activeAccount_(id) {
  const row = findBy_("Accounts", "account_id", id);
  if (!row || row.status !== "active") throw sbError_("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak aktif.", 400);
  return row;
}

function assertAccountAccess_(context, account) {
  if (!canAccessAccount_(context, account)) throw sbError_("FORBIDDEN_ACCOUNT", "Rekening pribadi ini bukan milik pengguna aktif.", 403);
}

function activeCategory_(id, type) {
  if (!id) return null;
  const row = findBy_("Categories", "category_id", id);
  if (!row || row.status !== "active") throw sbError_("INVALID_CATEGORY", "Kategori tidak ditemukan atau tidak aktif.", 400);
  if (type && row.transaction_type !== type && !(type === "refund" && row.transaction_type === "expense")) throw sbError_("CATEGORY_TYPE_MISMATCH", "Kategori tidak sesuai jenis transaksi.", 400);
  return row;
}

function validateDate_(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw sbError_("INVALID_DATE", "Tanggal transaksi tidak valid.", 400);
  const parts = date.split("-").map(Number);
  const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
  if (parts[0] < 2000 || parts[0] > 2100 || parsed.getFullYear() !== parts[0] || parsed.getMonth() !== parts[1] - 1 || parsed.getDate() !== parts[2]) throw sbError_("INVALID_DATE", "Tanggal transaksi tidak valid.", 400);
  return date;
}

const SB_RESERVED_TRANSACTION_FIELDS = Object.freeze([
  "recurring_occurrence_id", "goal_id", "scope", "owner_user_id", "idempotency_key",
  "created_by", "created_at", "updated_by", "updated_at", "cancelled_by", "cancelled_at",
  "cancellation_reason", "status"
]);

function assertNoReservedTransactionFields_(payload) {
  const field = SB_RESERVED_TRANSACTION_FIELDS.find(function(key) {
    return Object.prototype.hasOwnProperty.call(payload || {}, key);
  });
  if (field) throw sbError_("RESERVED_TRANSACTION_FIELD", "Field internal transaksi tidak boleh dikirim: " + field + ".", 400, { field: field });
}

function assertAdjustmentAuthorized_(context, type, description) {
  if (type !== "adjustment") return;
  if (!context || !context.actor || context.actor.role !== "owner") throw sbError_("ADJUSTMENT_OWNER_ONLY", "Penyesuaian saldo hanya dapat dibuat owner.", 403);
  if (!sanitizeText_(description, 250)) throw sbError_("ADJUSTMENT_REASON_REQUIRED", "Alasan penyesuaian saldo wajib diisi.", 400);
}

function accountInitialDate_(account) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(account && account.initial_balance_date || ""))
    ? String(account.initial_balance_date)
    : "2000-01-01";
}

function assertAccountDate_(account, transactionDate) {
  const initialDate = accountInitialDate_(account);
  if (transactionDate < initialDate) {
    throw sbError_("TRANSACTION_BEFORE_INITIAL_BALANCE", "Tanggal transaksi tidak boleh sebelum tanggal saldo awal rekening.", 409, {
      accountId: account.account_id,
      initialBalanceDate: initialDate,
      transactionDate: transactionDate
    });
  }
}

function accountOwnershipKey_(account) {
  if (!account || account.owner_scope !== "personal") return "shared:";
  return "personal:" + String(account.owner_user_id || "");
}

function transactionOwnedScope_(source, destination) {
  const accounts = [source, destination].filter(Boolean);
  if (!accounts.length) throw sbError_("ACCOUNT_REQUIRED", "Transaksi wajib terhubung ke rekening.", 400);
  const keys = Array.from(new Set(accounts.map(accountOwnershipKey_)));
  if (keys.length !== 1) {
    throw sbError_("ACCOUNT_SCOPE_MISMATCH", "Transfer hanya dapat dilakukan antar rekening dengan kepemilikan yang sama.", 400);
  }
  const key = keys[0];
  if (key.indexOf("personal:") === 0) {
    const ownerUserId = key.slice("personal:".length);
    if (!ownerUserId) throw sbError_("ACCOUNT_OWNER_MISSING", "Rekening pribadi tidak memiliki owner yang valid.", 409);
    return { scope: "personal", owner_user_id: ownerUserId };
  }
  return { scope: "shared", owner_user_id: "" };
}

function assertTransactionScopeRequest_(payload, owned, allowInternalLinks) {
  if (allowInternalLinks !== true) return;
  if (payload.scope !== undefined && ["personal", "shared"].indexOf(payload.scope) === -1) throw sbError_("INVALID_SCOPE", "Scope transaksi harus personal atau shared.", 400);
  if (payload.scope !== undefined && String(payload.scope) !== owned.scope) throw sbError_("TRANSACTION_SCOPE_MISMATCH", "Scope transaksi ditentukan oleh rekening yang dipilih.", 400);
  if (payload.owner_user_id !== undefined && String(payload.owner_user_id || "") !== owned.owner_user_id) throw sbError_("TRANSACTION_OWNER_MISMATCH", "Owner transaksi harus sama dengan owner rekening pribadi.", 400);
}

function transactionBalanceImpact_(accountId, transaction) {
  if (transaction.status !== "active") return 0;
  const amount = Number(transaction.amount || 0);
  if (transaction.transaction_type === "income" || transaction.transaction_type === "refund") return transaction.destination_account_id === accountId ? amount : 0;
  if (transaction.transaction_type === "expense") return transaction.source_account_id === accountId ? -amount : 0;
  if (transaction.transaction_type === "transfer") {
    if (transaction.source_account_id === accountId) return -amount;
    if (transaction.destination_account_id === accountId) return amount;
  }
  if (transaction.transaction_type === "adjustment" && transaction.source_account_id === accountId) return amount;
  return 0;
}

function accountBalanceAsOf_(accountId, cutoffDate, transactions) {
  const account = findBy_("Accounts", "account_id", accountId);
  if (!account) return 0;
  const cutoff = String(cutoffDate || today_());
  const initialDate = accountInitialDate_(account);
  if (cutoff < initialDate) return 0;
  return (transactions || rows_("Transactions")).filter(function(transaction) {
    const date = String(transaction.transaction_date || "");
    return date >= initialDate && date <= cutoff;
  }).reduce(function(total, transaction) { return total + transactionBalanceImpact_(accountId, transaction); }, Number(account.initial_balance || 0));
}

function accountBalance_(accountId, transactions) {
  return accountBalanceAsOf_(accountId, today_(), transactions);
}

function firstNegativeAccountBalance_(account, transactions, reportFromDate) {
  const initialDate = accountInitialDate_(account);
  const reportFrom = String(reportFromDate || initialDate);
  let balance = Number(account.initial_balance || 0);
  if (balance < 0 && initialDate >= reportFrom) return { date: initialDate, balance: balance };
  const ledger = (transactions || rows_("Transactions")).filter(function(transaction) {
    return transaction.status === "active" && String(transaction.transaction_date || "") >= initialDate;
  }).sort(function(left, right) {
    return String(left.transaction_date || "").localeCompare(String(right.transaction_date || ""));
  });
  let activeDate = "";
  for (let index = 0; index < ledger.length; index += 1) {
    const transaction = ledger[index];
    const date = String(transaction.transaction_date || "");
    if (activeDate && date !== activeDate && balance < 0 && activeDate >= reportFrom) return { date: activeDate, balance: balance };
    activeDate = date;
    balance += transactionBalanceImpact_(account.account_id, transaction);
  }
  if (activeDate && balance < 0 && activeDate >= reportFrom) return { date: activeDate, balance: balance };
  return null;
}

function visibleTransactions_(context, transactions) {
  const accountMap = Object.fromEntries(rows_("Accounts").map(function(account) { return [String(account.account_id), account]; }));
  return (transactions || rows_("Transactions")).filter(function(transaction) {
    if (!canAccessOwnedScope_(context, transaction.scope, transaction.owner_user_id)) return false;
    return [transaction.source_account_id, transaction.destination_account_id].filter(Boolean).every(function(accountId) {
      const account = accountMap[String(accountId)];
      if (!account) return !context || !context.actor || context.actor.role === "owner";
      return canAccessAccount_(context, account);
    });
  });
}

function assertSufficientBalanceForCandidate_(source, candidate, transactions) {
  if (!source || source.allow_negative === true || String(source.allow_negative).toLowerCase() === "true") return;
  const candidateDate = String(candidate.transaction_date || today_());
  const projectedLedger = (transactions || rows_("Transactions")).concat([Object.assign({ status: "active" }, candidate)]);
  const issue = firstNegativeAccountBalance_(source, projectedLedger, candidateDate);
  if (issue) {
    throw sbError_("INSUFFICIENT_BALANCE", "Saldo rekening tidak mencukupi pada proyeksi tanggal " + issue.date + ".", 409, {
      accountId: source.account_id,
      offendingDate: issue.date,
      balanceAfter: issue.balance
    });
  }
}

function duplicateTransaction_(payload, excludeTransactionId, transactions) {
  return (transactions || rows_("Transactions")).find(function(row) {
    return row.status === "active"
      && row.transaction_id !== excludeTransactionId
      && row.transaction_date === payload.transaction_date
      && row.transaction_type === payload.transaction_type
      && String(row.source_account_id) === String(payload.source_account_id || "")
      && String(row.destination_account_id) === String(payload.destination_account_id || "")
      && Number(row.amount) === Number(payload.amount)
      && String(row.description || "").toLowerCase() === String(payload.description || "").toLowerCase();
  });
}

function envelopeUsage_(period, transactions) {
  const used = (transactions || rows_("Transactions")).filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && row.envelope_period_id === period.envelope_period_id; }).reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  return Object.assign(publicRow_(period), { used_amount: used, remaining_amount: Number(period.allocated_amount || 0) - Number(period.reserved_amount || 0) - used });
}

function validateEnvelopeForExpense_(payload, amount, transactions, context) {
  if (!payload.envelope_period_id) return null;
  const period = findBy_("Envelope_Periods", "envelope_period_id", payload.envelope_period_id);
  if (!period || period.status !== "active") throw sbError_("INVALID_ENVELOPE", "Kantong tidak aktif atau tidak ditemukan.", 400);
  const rule = findBy_("Envelope_Rules", "envelope_rule_id", period.envelope_rule_id);
  if (!rule || !canAccessEnvelopeRule_(context, rule)) throw sbError_("FORBIDDEN_ENVELOPE", "Kantong pribadi ini bukan milik pengguna aktif.", 403);
  if (String(payload.scope || "shared") !== String(rule.scope || "shared") || String(payload.owner_user_id || "") !== String(rule.owner_user_id || "")) throw sbError_("ENVELOPE_SCOPE_MISMATCH", "Kantong harus memiliki kepemilikan yang sama dengan transaksi.", 400);
  if (payload.transaction_date < period.period_start || payload.transaction_date > period.period_end) throw sbError_("ENVELOPE_PERIOD_MISMATCH", "Tanggal transaksi tidak termasuk periode jatah.", 400);
  const usage = envelopeUsage_(period, transactions);
  if (amount > usage.remaining_amount) {
    const policy = String(rule && rule.overspend_policy || "confirm");
    if (policy === "deny") throw sbError_("OVERSPEND_DENIED", "Kebijakan kantong menolak pengeluaran di atas sisa alokasi.", 409, { remainingAmount: usage.remaining_amount });
    if (policy === "owner_approval" && (!context || context.actor.role !== "owner")) throw sbError_("OWNER_APPROVAL_REQUIRED", "Pengeluaran di atas sisa kantong memerlukan tindakan owner.", 409, { remainingAmount: usage.remaining_amount });
    if (policy !== "warn" && !payload.overspend_reason) throw sbError_("OVER_BUDGET_CONFIRMATION_REQUIRED", "Pengeluaran melebihi sisa kantong. Alasan over-budget wajib diisi.", 409, { remainingAmount: usage.remaining_amount });
  }
  return period;
}

function createTransaction_(context, forcedPayload, options) {
  const payload = Object.assign({}, forcedPayload || context.payload);
  const settings = options || {};
  if (settings.allowInternalLinks !== true) assertNoReservedTransactionFields_(payload);
  const type = String(payload.transaction_type || "");
  if (!["income", "expense", "transfer", "refund", "adjustment"].includes(type)) throw sbError_("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  assertAdjustmentAuthorized_(context, type, payload.description);
  const date = validateDate_(payload.transaction_date);
  assertTransactionDateUnlocked_(date);
  const amount = intAmount_(payload.amount);
  let source = null; let destination = null;
  if (type !== "income" && type !== "refund") { source = activeAccount_(payload.source_account_id); assertAccountAccess_(context, source); }
  if (["income", "refund", "transfer"].includes(type)) { destination = activeAccount_(payload.destination_account_id); assertAccountAccess_(context, destination); }
  if (type === "transfer" && source.account_id === destination.account_id) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  if (source) assertAccountDate_(source, date);
  if (destination) assertAccountDate_(destination, date);
  const owned = transactionOwnedScope_(source, destination);
  assertTransactionScopeRequest_(payload, owned, settings.allowInternalLinks === true);
  payload.scope = owned.scope;
  payload.owner_user_id = owned.owner_user_id;
  payload.source_account_id = source ? source.account_id : "";
  payload.destination_account_id = destination ? destination.account_id : "";
  if (type !== "expense") payload.envelope_period_id = "";
  if (["transfer", "adjustment"].includes(type)) payload.category_id = "";
  if (["income", "expense", "refund"].includes(type) && !payload.category_id) throw sbError_("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
  activeCategory_(payload.category_id, type === "income" ? "income" : type === "expense" ? "expense" : type);
  payload.overspend_reason = sanitizeText_(payload.overspend_reason, 180);
  if (type === "expense") validateEnvelopeForExpense_(payload, amount, settings.transactionSnapshot, context);
  const candidate = {
    status: "active", transaction_date: date, transaction_type: type, source_account_id: payload.source_account_id || "",
    destination_account_id: payload.destination_account_id || "", amount: amount
  };
  assertSufficientBalanceForCandidate_(source, candidate, settings.transactionSnapshot);
  const duplicate = duplicateTransaction_(payload, null, settings.transactionSnapshot);
  if (duplicate && !payload.confirm_duplicate) throw sbError_("POSSIBLE_DUPLICATE", "Transaksi mirip sudah tercatat. Konfirmasi diperlukan.", 409, { transactionId: duplicate.transaction_id });
  const record = {
    transaction_id: uuid_(), transaction_date: date, transaction_type: type,
    source_account_id: payload.source_account_id || "", destination_account_id: payload.destination_account_id || "",
    category_id: payload.category_id || "", envelope_period_id: payload.envelope_period_id || "",
    recurring_occurrence_id: settings.allowInternalLinks === true ? payload.recurring_occurrence_id || "" : "",
    goal_id: settings.allowInternalLinks === true ? payload.goal_id || "" : "",
    amount: amount, description: sanitizeText_(payload.description, 250), overspend_reason: payload.overspend_reason, merchant: sanitizeText_(payload.merchant, 120),
    payment_method: sanitizeText_(payload.payment_method || "", 40), scope: owned.scope,
    owner_user_id: owned.owner_user_id, status: "active", row_version: 1,
    idempotency_key: context.idempotencyKey || "", created_by: context.actor.user_id, created_at: nowIso_(),
    updated_by: context.actor.user_id, updated_at: nowIso_(), cancelled_by: "", cancelled_at: "", cancellation_reason: ""
  };
  if (settings.deferWrite === true) return publicRow_(record);
  if (settings.skipAudit === true) appendRow_("Transactions", record);
  else appendAuditedRow_("Transactions", "transaction_id", record, context, "transactions.create", "transaction", null, publicRow_(record));
  return publicRow_(record);
}

function assertCanModifyTransaction_(context, transaction) {
  if (transaction.transaction_type === "adjustment" && context.actor.role !== "owner") throw sbError_("ADJUSTMENT_OWNER_ONLY", "Penyesuaian saldo hanya dapat diubah owner.", 403);
  if (context.actor.role === "owner") return;
  if (String(transaction.created_by) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN", "Member hanya dapat mengubah transaksi yang dibuat sendiri.", 403);
}

function transactionCapabilities_(context, transaction) {
  const active = transaction && transaction.status === "active";
  const linked = Boolean(transaction && (transaction.recurring_occurrence_id || transaction.goal_id));
  const ownerOrCreator = context.actor.role === "owner" || String(transaction.created_by) === String(context.actor.user_id);
  const adjustmentAllowed = transaction.transaction_type !== "adjustment" || context.actor.role === "owner";
  const periodOpen = transaction ? !isTransactionDateLocked_(transaction.transaction_date) : false;
  return {
    can_edit: Boolean(active && periodOpen && !linked && ownerOrCreator && adjustmentAllowed),
    can_cancel: Boolean(active && periodOpen && !linked && ownerOrCreator && adjustmentAllowed),
    period_closed: Boolean(active && !periodOpen),
    managed_by: transaction.recurring_occurrence_id ? "recurring" : transaction.goal_id ? "goal" : ""
  };
}

function assertGenericTransactionMutationAllowed_(transaction) {
  if (transaction.recurring_occurrence_id) throw sbError_("LINKED_RECURRING_TRANSACTION", "Transaksi ini terhubung ke tagihan/pemasukan rutin. Koreksi melalui menu Tagihan agar status jadwal tetap sinkron.", 409, { occurrenceId: transaction.recurring_occurrence_id });
  if (transaction.goal_id) throw sbError_("LINKED_GOAL_TRANSACTION", "Transaksi ini terhubung ke target tabungan. Koreksi melalui menu Target agar progress tetap sinkron.", 409, { goalId: transaction.goal_id });
}

function updateTransaction_(context) {
  const payload = context.payload;
  assertNoReservedTransactionFields_(payload);
  const current = findBy_("Transactions", "transaction_id", payload.transaction_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Transaksi aktif tidak ditemukan.", 404);
  assertCanModifyTransaction_(context, current);
  assertGenericTransactionMutationAllowed_(current);
  assertVersion_(current, context.rowVersion || payload.row_version);
  const previous = publicRow_(current);
  const type = String(payload.transaction_type === undefined ? current.transaction_type : payload.transaction_type);
  if (!["income", "expense", "transfer", "refund", "adjustment"].includes(type)) throw sbError_("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  if (type !== current.transaction_type && (type === "adjustment" || current.transaction_type === "adjustment")) throw sbError_("ADJUSTMENT_TYPE_IMMUTABLE", "Jenis adjustment tidak dapat diubah ke atau dari jenis transaksi lain. Batalkan lalu buat transaksi koreksi baru.", 409);
  assertAdjustmentAuthorized_(context, type, payload.description === undefined ? current.description : payload.description);
  const date = validateDate_(payload.transaction_date === undefined ? current.transaction_date : payload.transaction_date);
  assertTransactionDateUnlocked_(current.transaction_date);
  assertTransactionDateUnlocked_(date);
  const amount = intAmount_(payload.amount === undefined ? current.amount : payload.amount);
  const sourceAccountId = payload.source_account_id === undefined ? current.source_account_id : payload.source_account_id;
  const destinationAccountId = payload.destination_account_id === undefined ? current.destination_account_id : payload.destination_account_id;
  const categoryId = payload.category_id === undefined ? current.category_id : payload.category_id;
  const envelopePeriodId = payload.envelope_period_id === undefined ? current.envelope_period_id : payload.envelope_period_id;
  let source = null; let destination = null;
  if (type !== "income" && type !== "refund") { source = activeAccount_(sourceAccountId); assertAccountAccess_(context, source); }
  if (["income", "refund", "transfer"].includes(type)) { destination = activeAccount_(destinationAccountId); assertAccountAccess_(context, destination); }
  if (type === "transfer" && source.account_id === destination.account_id) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  if (source) assertAccountDate_(source, date);
  if (destination) assertAccountDate_(destination, date);
  const owned = transactionOwnedScope_(source, destination);
  assertTransactionScopeRequest_(payload, owned, false);
  const normalizedSourceAccountId = source ? source.account_id : "";
  const normalizedDestinationAccountId = destination ? destination.account_id : "";
  const normalizedCategoryId = ["transfer", "adjustment"].includes(type) ? "" : categoryId;
  const normalizedEnvelopePeriodId = type === "expense" ? envelopePeriodId : "";
  if (["income", "expense", "refund"].includes(type) && !normalizedCategoryId) throw sbError_("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
  activeCategory_(normalizedCategoryId, type === "income" ? "income" : type === "expense" ? "expense" : type);
  const overspendReason = sanitizeText_(payload.overspend_reason === undefined ? current.overspend_reason : payload.overspend_reason, 180);
  const normalized = {
    transaction_id: current.transaction_id, transaction_date: date, transaction_type: type,
    source_account_id: normalizedSourceAccountId, destination_account_id: normalizedDestinationAccountId, category_id: normalizedCategoryId || "",
    envelope_period_id: normalizedEnvelopePeriodId || "", amount: amount,
    scope: owned.scope, owner_user_id: owned.owner_user_id,
    description: sanitizeText_(payload.description === undefined ? current.description : payload.description, 250),
    overspend_reason: overspendReason,
    merchant: sanitizeText_(payload.merchant === undefined ? current.merchant : payload.merchant, 120),
    status: "active"
  };
  const otherTransactions = rows_("Transactions").filter(function(row) { return row.transaction_id !== current.transaction_id; });
  if (type === "expense") validateEnvelopeForExpense_(normalized, amount, otherTransactions, context);
  assertSufficientBalanceForCandidate_(source, normalized, otherTransactions);
  const duplicate = duplicateTransaction_(normalized, current.transaction_id);
  if (duplicate && !payload.confirm_duplicate) throw sbError_("POSSIBLE_DUPLICATE", "Transaksi mirip sudah tercatat. Konfirmasi diperlukan.", 409, { transactionId: duplicate.transaction_id });
  const updated = Object.assign({}, current, normalized, {
    recurring_occurrence_id: current.recurring_occurrence_id || "", goal_id: current.goal_id || "",
    payment_method: sanitizeText_(payload.payment_method === undefined ? current.payment_method : payload.payment_method, 40),
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    row_version: rowVersion_(current) + 1, updated_by: context.actor.user_id, updated_at: nowIso_()
  });
  updateAuditedRow_("Transactions", current, updated, context, "transactions.update", "transaction", updated.transaction_id, previous, publicRow_(updated));
  return publicRow_(updated);
}

function cancelTransaction_(context) {
  const payload = context.payload;
  const current = findBy_("Transactions", "transaction_id", payload.transactionId || payload.transaction_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Transaksi aktif tidak ditemukan.", 404);
  assertCanModifyTransaction_(context, current);
  assertGenericTransactionMutationAllowed_(current);
  assertVersion_(current, context.rowVersion || payload.rowVersion || payload.row_version);
  assertTransactionDateUnlocked_(current.transaction_date);
  const reason = sanitizeText_(payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  const previous = publicRow_(current);
  const updated = Object.assign({}, current, {
    status: "cancelled", cancelled_by: context.actor.user_id, cancelled_at: nowIso_(), cancellation_reason: reason,
    row_version: rowVersion_(current) + 1, updated_by: context.actor.user_id, updated_at: nowIso_()
  });
  updateAuditedRow_("Transactions", current, updated, context, "transactions.cancel", "transaction", updated.transaction_id, previous, publicRow_(updated));
  return publicRow_(updated);
}

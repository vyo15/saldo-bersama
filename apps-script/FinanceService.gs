function assertPeriodOpen_(dateString) {
  const periodKey = String(dateString).slice(0, 7);
  const closure = filterBy_("Period_Closures", function(row) { return row.period_key === periodKey && row.status === "closed"; })[0];
  if (closure) throw sbError_("PERIOD_CLOSED", "Periode " + periodKey + " sudah ditutup.", 409);
}

function activeAccount_(id) {
  const row = findBy_("Accounts", "account_id", id);
  if (!row || row.status !== "active") throw sbError_("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak aktif.", 400);
  return row;
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

function accountBalance_(accountId, transactions) {
  const account = findBy_("Accounts", "account_id", accountId);
  if (!account) return 0;
  return (transactions || rows_("Transactions")).reduce(function(total, transaction) { return total + transactionBalanceImpact_(accountId, transaction); }, Number(account.initial_balance || 0));
}

function duplicateTransaction_(payload, excludeTransactionId) {
  return rows_("Transactions").find(function(row) {
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

function validateEnvelopeForExpense_(payload, amount) {
  if (!payload.envelope_period_id) return null;
  const period = findBy_("Envelope_Periods", "envelope_period_id", payload.envelope_period_id);
  if (!period || period.status !== "active") throw sbError_("INVALID_ENVELOPE", "Kantong tidak aktif atau tidak ditemukan.", 400);
  if (payload.transaction_date < period.period_start || payload.transaction_date > period.period_end) throw sbError_("ENVELOPE_PERIOD_MISMATCH", "Tanggal transaksi tidak termasuk periode jatah.", 400);
  const usage = envelopeUsage_(period);
  if (amount > usage.remaining_amount && !payload.overspend_reason) throw sbError_("OVER_BUDGET_CONFIRMATION_REQUIRED", "Pengeluaran melebihi sisa kantong. Alasan over-budget wajib diisi.", 409, { remainingAmount: usage.remaining_amount });
  return period;
}

function createTransaction_(context, forcedPayload) {
  const payload = Object.assign({}, forcedPayload || context.payload);
  const type = String(payload.transaction_type || "");
  if (!["income", "expense", "transfer", "refund", "adjustment"].includes(type)) throw sbError_("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  const date = validateDate_(payload.transaction_date);
  assertPeriodOpen_(date);
  const amount = intAmount_(payload.amount);
  let source = null; let destination = null;
  if (type !== "income" && type !== "refund") source = activeAccount_(payload.source_account_id);
  if (["income", "refund", "transfer"].includes(type)) destination = activeAccount_(payload.destination_account_id);
  if (type === "transfer" && source.account_id === destination.account_id) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  payload.source_account_id = source ? source.account_id : "";
  payload.destination_account_id = destination ? destination.account_id : "";
  if (type !== "expense") payload.envelope_period_id = "";
  if (["transfer", "adjustment"].includes(type)) payload.category_id = "";
  if (["income", "expense", "refund"].includes(type) && !payload.category_id) throw sbError_("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
  activeCategory_(payload.category_id, type === "income" ? "income" : type === "expense" ? "expense" : type);
  payload.overspend_reason = sanitizeText_(payload.overspend_reason, 180);
  if (type === "expense") validateEnvelopeForExpense_(payload, amount);
  if (source && source.allow_negative !== true && String(source.allow_negative).toLowerCase() !== "true") {
    const balanceAfter = accountBalance_(source.account_id) - amount;
    if (balanceAfter < 0) throw sbError_("INSUFFICIENT_BALANCE", "Saldo rekening tidak mencukupi.", 409, { currentBalance: accountBalance_(source.account_id), balanceAfter: balanceAfter });
  }
  const duplicate = duplicateTransaction_(payload);
  if (duplicate && !payload.confirm_duplicate) throw sbError_("POSSIBLE_DUPLICATE", "Transaksi mirip sudah tercatat. Konfirmasi diperlukan.", 409, { transactionId: duplicate.transaction_id });
  const record = {
    transaction_id: uuid_(), transaction_date: date, transaction_type: type,
    source_account_id: payload.source_account_id || "", destination_account_id: payload.destination_account_id || "",
    category_id: payload.category_id || "", envelope_period_id: payload.envelope_period_id || "",
    recurring_occurrence_id: payload.recurring_occurrence_id || "", goal_id: payload.goal_id || "",
    amount: amount, description: sanitizeText_(payload.description, 250), overspend_reason: payload.overspend_reason, merchant: sanitizeText_(payload.merchant, 120),
    payment_method: sanitizeText_(payload.payment_method || "", 40), scope: payload.scope === "personal" ? "personal" : "shared",
    owner_user_id: context.actor.role === "owner" && payload.owner_user_id ? payload.owner_user_id : context.actor.user_id, status: "active", row_version: 1,
    idempotency_key: context.idempotencyKey || "", created_by: context.actor.user_id, created_at: nowIso_(),
    updated_by: context.actor.user_id, updated_at: nowIso_(), cancelled_by: "", cancelled_at: "", cancellation_reason: ""
  };
  appendRow_("Transactions", record);
  appendAudit_(context, "transactions.create", "transaction", record.transaction_id, null, publicRow_(record));
  return publicRow_(record);
}

function assertCanModifyTransaction_(context, transaction) {
  if (context.actor.role === "owner") return;
  if (String(transaction.created_by) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN", "Member hanya dapat mengubah transaksi yang dibuat sendiri.", 403);
}

function updateTransaction_(context) {
  const payload = context.payload;
  const current = findBy_("Transactions", "transaction_id", payload.transaction_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Transaksi aktif tidak ditemukan.", 404);
  assertCanModifyTransaction_(context, current);
  assertVersion_(current, context.rowVersion || payload.row_version);
  const previous = publicRow_(current);
  const type = String(payload.transaction_type === undefined ? current.transaction_type : payload.transaction_type);
  if (!["income", "expense", "transfer", "refund", "adjustment"].includes(type)) throw sbError_("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  const date = validateDate_(payload.transaction_date === undefined ? current.transaction_date : payload.transaction_date);
  assertPeriodOpen_(date);
  const amount = intAmount_(payload.amount === undefined ? current.amount : payload.amount);
  const sourceAccountId = payload.source_account_id === undefined ? current.source_account_id : payload.source_account_id;
  const destinationAccountId = payload.destination_account_id === undefined ? current.destination_account_id : payload.destination_account_id;
  const categoryId = payload.category_id === undefined ? current.category_id : payload.category_id;
  const envelopePeriodId = payload.envelope_period_id === undefined ? current.envelope_period_id : payload.envelope_period_id;
  let source = null; let destination = null;
  if (type !== "income" && type !== "refund") source = activeAccount_(sourceAccountId);
  if (["income", "refund", "transfer"].includes(type)) destination = activeAccount_(destinationAccountId);
  if (type === "transfer" && source.account_id === destination.account_id) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
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
    description: sanitizeText_(payload.description === undefined ? current.description : payload.description, 250),
    overspend_reason: overspendReason,
    merchant: sanitizeText_(payload.merchant === undefined ? current.merchant : payload.merchant, 120)
  };
  if (type === "expense") validateEnvelopeForExpense_(normalized, amount);
  if (source && source.allow_negative !== true && String(source.allow_negative).toLowerCase() !== "true") {
    const otherTransactions = rows_("Transactions").filter(function(row) { return row.transaction_id !== current.transaction_id; });
    const balanceAfter = accountBalance_(source.account_id, otherTransactions) - amount;
    if (balanceAfter < 0) throw sbError_("INSUFFICIENT_BALANCE", "Saldo rekening tidak mencukupi.", 409, { currentBalance: accountBalance_(source.account_id, otherTransactions), balanceAfter: balanceAfter });
  }
  const duplicate = duplicateTransaction_(normalized, current.transaction_id);
  if (duplicate && !payload.confirm_duplicate) throw sbError_("POSSIBLE_DUPLICATE", "Transaksi mirip sudah tercatat. Konfirmasi diperlukan.", 409, { transactionId: duplicate.transaction_id });
  const updated = Object.assign({}, current, normalized, {
    recurring_occurrence_id: current.recurring_occurrence_id || "", goal_id: current.goal_id || "",
    payment_method: sanitizeText_(payload.payment_method === undefined ? current.payment_method : payload.payment_method, 40),
    scope: payload.scope === undefined ? current.scope : (payload.scope === "personal" ? "personal" : "shared"),
    owner_user_id: context.actor.role === "owner" && payload.owner_user_id ? payload.owner_user_id : current.owner_user_id,
    row_version: rowVersion_(current) + 1, updated_by: context.actor.user_id, updated_at: nowIso_()
  });
  updateRow_("Transactions", current.__row, updated);
  appendAudit_(context, "transactions.update", "transaction", updated.transaction_id, previous, publicRow_(updated));
  return publicRow_(updated);
}

function cancelTransaction_(context) {
  const payload = context.payload;
  const current = findBy_("Transactions", "transaction_id", payload.transactionId || payload.transaction_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Transaksi aktif tidak ditemukan.", 404);
  assertCanModifyTransaction_(context, current);
  assertVersion_(current, context.rowVersion || payload.rowVersion || payload.row_version);
  assertPeriodOpen_(current.transaction_date);
  const reason = sanitizeText_(payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  const previous = publicRow_(current);
  current.status = "cancelled"; current.cancelled_by = context.actor.user_id; current.cancelled_at = nowIso_(); current.cancellation_reason = reason;
  current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
  updateRow_("Transactions", current.__row, current);
  appendAudit_(context, "transactions.cancel", "transaction", current.transaction_id, previous, publicRow_(current));
  return publicRow_(current);
}

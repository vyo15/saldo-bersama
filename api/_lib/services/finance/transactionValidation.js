import { TRANSACTION_TYPE_VALUES } from "../../domainConstants.js";
import { resolveTransactionCostShare } from "../costSharing.js";
import { accountAllocatedRemaining, accountBalanceAsOf, firstNegativeBalance } from "../readModels.js";
import { firstForbiddenTransactionField } from "../../transactionContract.js";
import { actorCanOperateTransaction, transferRouteMode } from "../transactionPolicy.js";
import {
  appError, dateValue, positiveInteger, sanitizeText, todayJakarta,
} from "../core.js";

const TRANSACTION_TYPES = new Set(TRANSACTION_TYPE_VALUES);

const assertNoReservedFields = (payload, allowInternalLinks = false) => {
  const field = firstForbiddenTransactionField(payload, { allowInternalLinks });
  if (field) throw appError("RESERVED_TRANSACTION_FIELD", `Field internal transaksi tidak boleh dikirim: ${field}.`, 400, { field });
};

const transactionLockingClosure = async (db, date) => db.one("SELECT closure_id,period_key FROM period_closures WHERE status='closed' AND period_key >= ? ORDER BY period_key LIMIT 1", [String(date).slice(0,7)]);
export const isTransactionDateLocked = async (db, date) => Boolean(await transactionLockingClosure(db, date));
export const assertTransactionDateUnlocked = async (db, date) => {
  const closure = await transactionLockingClosure(db, date);
  if (closure) throw appError("PERIOD_CLOSED", `Transaksi periode ${String(date).slice(0,7)} dikunci karena periode ${closure.period_key} sudah ditutup.`, 409, { closureId: closure.closure_id, lockingPeriod: closure.period_key });
};

// Account ids from the client are references only. Resolve active status and ownership
// again on the server before any financial rule uses the account.
const activeReadableAccount = async (db, accountId) => {
  const account = await db.one("SELECT * FROM accounts WHERE account_id=? AND status='active'", [accountId]);
  if (!account) throw appError("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak aktif.", 400);
  return account;
};

const activeAccount = async (db, actor, accountId) => {
  const account = await activeReadableAccount(db, accountId);
  if (actor.role !== "owner" && account.owner_scope === "personal" && account.owner_user_id !== actor.user_id) {
    throw appError("FORBIDDEN_ACCOUNT", "Rekening pribadi ini bukan milik pengguna aktif.", 403);
  }
  return account;
};

// Transfer authority belongs to the debited/source account. The destination is only a
// recipient reference and may belong to the other authorized household member.
const ledgerOwnershipFromAccount = (account) => account?.owner_scope === "personal"
  ? { scope: "personal", owner_user_id: account.owner_user_id }
  : { scope: "shared", owner_user_id: null };

// Category existence, active status, and transaction-type compatibility are all
// server-authoritative; a frontend select option is not sufficient validation.
const activeCategory = async (db, categoryId, type) => {
  if (!categoryId) return null;
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [categoryId]);
  if (!category) throw appError("INVALID_CATEGORY", "Kategori tidak ditemukan atau tidak aktif.", 400);
  const allowedTypes = type === "refund" ? new Set(["expense", "refund"]) : new Set([type]);
  if (!allowedTypes.has(category.transaction_type)) throw appError("CATEGORY_TYPE_MISMATCH", "Kategori tidak sesuai jenis transaksi.", 400);
  return category;
};

const assertAccountDate = (account, transactionDate) => {
  if (transactionDate < account.initial_balance_date) throw appError("TRANSACTION_BEFORE_INITIAL_BALANCE", "Tanggal transaksi tidak boleh sebelum tanggal saldo awal rekening.", 409, { accountId: account.account_id, initialBalanceDate: account.initial_balance_date, transactionDate });
};

export const assertCanModify = (context, transaction) => {
  if (transaction.transaction_type === "adjustment" && context.actor.role !== "owner") throw appError("ADJUSTMENT_OWNER_ONLY", "Penyesuaian saldo hanya dapat diubah Administrator.", 403);
  if (context.actor.role !== "owner" && (!actorCanOperateTransaction(context.actor, transaction) || transaction.created_by !== context.actor.user_id)) throw appError("FORBIDDEN", "Member hanya dapat mengubah transaksi miliknya pada rekening yang dapat dioperasikan.", 403);
  if (transaction.recurring_occurrence_id) throw appError("LINKED_RECURRING_TRANSACTION", "Koreksi transaksi rutin harus dilakukan melalui menu Tagihan.", 409, { occurrenceId: transaction.recurring_occurrence_id });
  if (transaction.goal_id) throw appError("LINKED_GOAL_TRANSACTION", "Koreksi transaksi target harus dilakukan melalui menu Target.", 409, { goalId: transaction.goal_id });
};

const assertEnvelopeCompatibility = (row, context, transaction) => {
  if (!row) throw appError("INVALID_ENVELOPE", "Alokasi Dana tidak ditemukan atau tidak aktif.", 400);
  if (transaction.transaction_date < row.period_start || transaction.transaction_date > row.period_end) throw appError("ENVELOPE_DATE_MISMATCH", "Tanggal transaksi berada di luar periode Alokasi Dana.", 409);
  if (row.scope !== transaction.scope || String(row.owner_user_id || "") !== String(transaction.owner_user_id || "")) throw appError("ENVELOPE_SCOPE_MISMATCH", "Alokasi Dana dan rekening transaksi harus memiliki kepemilikan ledger yang sama.", 409);
  if (!row.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Alokasi Dana belum memiliki rekening sumber dan tidak aman dipakai untuk transaksi.", 409);
  if (row.source_account_id !== transaction.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_MISMATCH", "Alokasi Dana hanya dapat dipakai dari rekening sumber yang sama.", 409, { sourceAccountId: row.source_account_id });
  if (context.actor.role !== "owner" && row.assignee_user_id && row.assignee_user_id !== context.actor.user_id) throw appError("ENVELOPE_ASSIGNEE_FORBIDDEN", "Member hanya dapat memakai Alokasi Dana Bersama atau alokasi miliknya sendiri.", 403);
};

const assertEnvelopeCapacity = (row, transaction, remaining) => {
  if (transaction.amount <= remaining) return;
  if (row.overspend_policy === "block") throw appError("ENVELOPE_LIMIT", "Nominal melebihi dana tersisa pada Alokasi Dana.", 409, { remainingAmount: remaining });
  if (row.overspend_policy === "confirm" && !transaction.overspend_reason) throw appError("OVERSPEND_REASON_REQUIRED", "Alasan melebihi dana Alokasi Dana wajib diisi.", 409, { remainingAmount: remaining });
};

const validateEnvelope = async (db, context, transaction, { excludeTransactionId = null } = {}) => {
  if (transaction.transaction_type !== "expense" || !transaction.envelope_period_id) return null;
  const row = await db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.overspend_policy,r.source_account_id
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [transaction.envelope_period_id]);
  assertEnvelopeCompatibility(row, context, transaction);
  const usage = await db.one(`SELECT COALESCE(SUM(amount),0) AS used FROM transactions
    WHERE status='active' AND transaction_type='expense' AND envelope_period_id=? ${excludeTransactionId ? "AND transaction_id<>?" : ""}`, [row.envelope_period_id, ...(excludeTransactionId ? [excludeTransactionId] : [])]);
  const remaining = Number(row.allocated_amount) - Number(row.reserved_amount) - Number(usage?.used || 0);
  assertEnvelopeCapacity(row, transaction, remaining);
  return { row, remaining };
};

const validateBudgetLink = async (db, transaction, envelopeState, current = null) => {
  if (!transaction.budget_id) return null;
  if (transaction.transaction_type !== "expense") throw appError("BUDGET_TRANSACTION_TYPE_MISMATCH", "Kebutuhan hanya dapat ditautkan ke transaksi pengeluaran.", 409);
  const budget = await db.one("SELECT * FROM budgets WHERE budget_id=?", [transaction.budget_id]);
  if (!budget) throw appError("INVALID_BUDGET", "Kebutuhan transaksi tidak ditemukan.", 409);
  const unchangedArchivedLink = current?.budget_id === budget.budget_id && budget.status === "archived";
  if (budget.status !== "active" && !unchangedArchivedLink) throw appError("BUDGET_INACTIVE", "Kebutuhan sudah tidak aktif dan tidak dapat dipakai untuk transaksi baru.", 409);
  if (budget.period_key !== String(transaction.transaction_date).slice(0, 7)) throw appError("BUDGET_DATE_MISMATCH", "Tanggal transaksi berada di luar periode Kebutuhan.", 409);
  if (budget.category_id !== transaction.category_id) throw appError("BUDGET_CATEGORY_MISMATCH", "Kategori transaksi harus sama dengan Kebutuhan.", 409);
  if (budget.scope !== transaction.scope || String(budget.owner_user_id || "") !== String(transaction.owner_user_id || "")) {
    throw appError("BUDGET_SCOPE_MISMATCH", "Kebutuhan dan transaksi harus memiliki kepemilikan yang sama.", 409);
  }
  if (budget.envelope_rule_id) {
    if (!envelopeState?.row || envelopeState.row.envelope_rule_id !== budget.envelope_rule_id) {
      throw appError("BUDGET_ENVELOPE_MISMATCH", "Transaksi Kebutuhan harus menggunakan Alokasi Dana yang terkait.", 409);
    }
  }
  return budget;
};

const duplicateTransaction = async (db, transaction, excludeTransactionId = null) => db.one(`SELECT transaction_id FROM transactions
  WHERE status='active' AND transaction_date=? AND transaction_type=? AND COALESCE(source_account_id,'')=COALESCE(?,'')
    AND COALESCE(destination_account_id,'')=COALESCE(?,'') AND amount=? AND lower(description)=lower(?)
    ${excludeTransactionId ? "AND transaction_id<>?" : ""} LIMIT 1`, [transaction.transaction_date, transaction.transaction_type, transaction.source_account_id, transaction.destination_account_id, transaction.amount, transaction.description, ...(excludeTransactionId ? [excludeTransactionId] : [])]);

const assertSufficientBalance = async (db, account, transaction, excludeTransactionId = null) => {
  if (!account || Boolean(account.allow_negative)) return;
  const issue = await firstNegativeBalance(db, account, { excludeTransactionId, candidate: transaction, fromDate: transaction.transaction_date });
  if (issue) throw appError("INSUFFICIENT_BALANCE", `Saldo rekening tidak mencukupi pada proyeksi tanggal ${issue.date}.`, 409, { accountId: account.account_id, offendingDate: issue.date, balanceAfter: issue.balance });
};

const unallocatedDebitAmount = (transaction, envelopeState) => {
  if (!transaction?.source_account_id) return 0;
  if (transaction.transaction_type === "transfer") return Number(transaction.amount || 0);
  if (transaction.transaction_type !== "expense") return 0;
  if (!transaction.envelope_period_id) return Number(transaction.amount || 0);
  const coveredByEnvelope = Math.max(0, Math.min(Number(transaction.amount || 0), Number(envelopeState?.remaining || 0)));
  return Math.max(0, Number(transaction.amount || 0) - coveredByEnvelope);
};

const assertUnallocatedFunds = async (db, account, transaction, envelopeState, excludeTransactionId = null) => {
  if (!account || Boolean(account.allow_negative)) return;
  const debit = unallocatedDebitAmount(transaction, envelopeState);
  if (debit <= 0) return;
  const [balance, allocatedRemaining] = await Promise.all([
    accountBalanceAsOf(db, account, transaction.transaction_date, { excludeTransactionId }),
    accountAllocatedRemaining(db, account.account_id, { cutoffDate: transaction.transaction_date, excludeTransactionId }),
  ]);
  const available = balance - allocatedRemaining;
  if (debit > available) throw appError("UNALLOCATED_FUNDS_INSUFFICIENT", "Dana rekening yang belum dialokasikan tidak mencukupi. Pilih Alokasi Dana yang sesuai atau kurangi nominal.", 409, {
    accountId: account.account_id,
    availableAmount: available,
    accountBalance: balance,
    allocatedRemaining,
    requiredUnallocatedAmount: debit,
  });
};

const projectedTransactionCandidate = (current, candidate) => candidate ? {
  ...candidate,
  status: "active",
  created_at: current?.created_at || candidate.created_at,
  transaction_id: current?.transaction_id || candidate.transaction_id,
} : null;

const assertProjectedAccountFunds = async (db, { accountId, current, projectedCandidate, fromDate }) => {
  const account = await db.one("SELECT * FROM accounts WHERE account_id=?", [accountId]);
  if (!account || Boolean(account.allow_negative)) return;
  const excludeTransactionId = current?.transaction_id || null;
  const issue = await firstNegativeBalance(db, account, {
    excludeTransactionId,
    candidate: projectedCandidate,
    fromDate: fromDate || account.initial_balance_date,
  });
  if (issue) throw appError("INSUFFICIENT_BALANCE", `Perubahan membuat saldo rekening negatif pada ${issue.date}.`, 409, { accountId, offendingDate: issue.date, balanceAfter: issue.balance });

  const cutoffDate = todayJakarta();
  const [projectedBalance, projectedAllocated] = await Promise.all([
    accountBalanceAsOf(db, account, cutoffDate, { excludeTransactionId, candidate: projectedCandidate }),
    accountAllocatedRemaining(db, accountId, { cutoffDate, excludeTransactionId, candidate: projectedCandidate }),
  ]);
  if (projectedBalance < projectedAllocated) throw appError("UNALLOCATED_FUNDS_INSUFFICIENT", "Perubahan akan memakai dana yang sudah disiapkan di Alokasi Dana.", 409, {
    accountId,
    availableAmount: projectedBalance - projectedAllocated,
    accountBalance: projectedBalance,
    allocatedRemaining: projectedAllocated,
  });
};

// Validate the projected historical ledger, not only today's balance. Backdated edits,
// cancellation, or restoration can make an intermediate account balance invalid even
// when the current balance would still look sufficient.
export const assertAffectedBalances = async (db, current, candidate = null) => {
  const accountIds = [...new Set([
    current?.source_account_id, current?.destination_account_id,
    candidate?.source_account_id, candidate?.destination_account_id,
  ].filter(Boolean))];
  const fromDate = [current?.transaction_date, candidate?.transaction_date].filter(Boolean).sort()[0];
  const projectedCandidate = projectedTransactionCandidate(current, candidate);
  for (const accountId of accountIds) {
    await assertProjectedAccountFunds(db, { accountId, current, projectedCandidate, fromDate });
  }
};

const validateTransactionTypePolicy = (context, payload, current, type) => {
  if (!TRANSACTION_TYPES.has(type)) throw appError("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  if (type === "adjustment") {
    if (context.actor.role !== "owner") throw appError("ADJUSTMENT_OWNER_ONLY", "Penyesuaian saldo hanya dapat dibuat Administrator.", 403);
    if (!sanitizeText(payload.description ?? current?.description, 250)) throw appError("ADJUSTMENT_REASON_REQUIRED", "Alasan penyesuaian saldo wajib diisi.", 400);
  }
  if (current && type !== current.transaction_type && (type === "adjustment" || current.transaction_type === "adjustment")) {
    throw appError("ADJUSTMENT_TYPE_IMMUTABLE", "Jenis adjustment tidak dapat diubah. Batalkan lalu buat koreksi baru.", 409);
  }
};

const assertInvestmentTransactionPolicy = (type, source, destination) => {
  if (type === "transfer") return;
  if (source?.account_type !== "investment" && destination?.account_type !== "investment") return;
  throw appError(
    "INVESTMENT_ACCOUNT_TRANSFER_ONLY",
    "Rekening investasi hanya dapat digunakan melalui Transfer atau pencatatan Investasi.",
    409,
  );
};

const resolveTransactionAccounts = async (db, context, { type, sourceId, destinationId, transactionDate }, { allowSharedToPersonalRequest = false } = {}) => {
  const source = ["income", "refund"].includes(type) ? null : await activeAccount(db, context.actor, sourceId);
  const destination = ["income", "refund"].includes(type)
    ? await activeAccount(db, context.actor, destinationId)
    : type === "transfer"
      ? await activeReadableAccount(db, destinationId)
      : null;
  assertInvestmentTransactionPolicy(type, source, destination);
  if (type === "transfer") {
    const routeMode = transferRouteMode(context.actor, source, destination);
    if (routeMode === "denied") throw appError("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
    if (routeMode === "approval_required" && !allowSharedToPersonalRequest) {
      throw appError("TRANSFER_APPROVAL_REQUIRED", "Transfer dari rekening Bersama ke rekening pribadi memerlukan persetujuan Administrator.", 409, { sourceAccountId: source.account_id, destinationAccountId: destination.account_id });
    }
  }
  if (source) assertAccountDate(source, transactionDate);
  if (destination) assertAccountDate(destination, transactionDate);
  return { source, destination, ownership: ledgerOwnershipFromAccount(source || destination) };
};

const resolveTransactionCategory = async (db, payload, current, type) => {
  const categoryId = ["transfer", "adjustment"].includes(type)
    ? null
    : String(payload.category_id ?? current?.category_id ?? "") || null;
  if (["income", "expense", "refund"].includes(type) && !categoryId) {
    throw appError("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
  }
  await activeCategory(db, categoryId, type);
  return categoryId;
};

const transactionField = (payload, current, key, fallback = undefined) => {
  if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  if (current && current[key] !== undefined && current[key] !== null) return current[key];
  return fallback;
};

const optionalTransactionId = (value) => String(value ?? "") || null;
const accountIdOrNull = (account) => account ? account.account_id : null;
const currentTransactionId = (current) => current ? (current.transaction_id || null) : null;

const internalLinkId = (payload, current, key, allowInternalLinks) => {
  if (allowInternalLinks) return optionalTransactionId(transactionField(payload, current, key, ""));
  return current ? (current[key] || null) : null;
};

const envelopePeriodId = (payload, current, type) => {
  if (type !== "expense") return null;
  return optionalTransactionId(transactionField(payload, current, "envelope_period_id", ""));
};

const normalizedTransactionText = (payload, current, key, maxLength) => (
  sanitizeText(transactionField(payload, current, key), maxLength)
);

const buildNormalizedTransactionRecord = ({
  payload,
  current,
  allowInternalLinks,
  type,
  transactionDate,
  amount,
  source,
  destination,
  ownership,
  categoryId,
}) => ({
  transaction_date: transactionDate,
  transaction_type: type,
  source_account_id: accountIdOrNull(source),
  destination_account_id: accountIdOrNull(destination),
  category_id: categoryId,
  envelope_period_id: envelopePeriodId(payload, current, type),
  budget_id: type === "expense" ? optionalTransactionId(transactionField(payload, current, "budget_id", "")) : null,
  recurring_occurrence_id: internalLinkId(payload, current, "recurring_occurrence_id", allowInternalLinks),
  goal_id: internalLinkId(payload, current, "goal_id", allowInternalLinks),
  amount,
  description: normalizedTransactionText(payload, current, "description", 250),
  overspend_reason: normalizedTransactionText(payload, current, "overspend_reason", 180),
  merchant: normalizedTransactionText(payload, current, "merchant", 120),
  payment_method: normalizedTransactionText(payload, current, "payment_method", 40),
  scope: ownership.scope,
  owner_user_id: ownership.owner_user_id,
});

const resolveTransactionInput = (context, payload, current) => ({
  type: String(transactionField(payload, current, "transaction_type", "expense")),
  transactionDate: dateValue(transactionField(payload, current, "transaction_date", context.today), "Tanggal transaksi"),
  amount: positiveInteger(transactionField(payload, current, "amount"), "Nominal transaksi"),
  sourceId: optionalTransactionId(transactionField(payload, current, "source_account_id", "")),
  destinationId: optionalTransactionId(transactionField(payload, current, "destination_account_id", "")),
});

const assertTransactionDatesUnlocked = async (db, transactionDate, current) => {
  await assertTransactionDateUnlocked(db, transactionDate);
  if (current) await assertTransactionDateUnlocked(db, current.transaction_date);
};

const assertNoUnconfirmedDuplicate = async (db, payload, record, excludeTransactionId) => {
  const duplicate = await duplicateTransaction(db, record, excludeTransactionId);
  if (!duplicate || payload.confirm_duplicate === true) return;
  throw appError("POSSIBLE_DUPLICATE", "Transaksi mirip sudah tercatat. Konfirmasi diperlukan.", 409, { transactionId: duplicate.transaction_id });
};

// Canonical transaction normalization composes all server-side references and financial
// invariants before a row is written. Keep this as the single mutation preparation path.
export const normalizeTransaction = async (db, context, payload, { current = null, allowInternalLinks = false, allowSharedToPersonalRequest = false } = {}) => {
  assertNoReservedFields(payload, allowInternalLinks);
  const input = resolveTransactionInput(context, payload, current);
  validateTransactionTypePolicy(context, payload, current, input.type);
  await assertTransactionDatesUnlocked(db, input.transactionDate, current);
  const accounts = await resolveTransactionAccounts(db, context, input, { allowSharedToPersonalRequest });
  const categoryId = await resolveTransactionCategory(db, payload, current, input.type);
  const baseRecord = buildNormalizedTransactionRecord({
    payload,
    current,
    allowInternalLinks,
    type: input.type,
    transactionDate: input.transactionDate,
    amount: input.amount,
    ...accounts,
    categoryId,
  });
  const costShare = await resolveTransactionCostShare(db, payload, current, baseRecord);
  const record = { ...baseRecord, ...costShare };
  const excludeTransactionId = currentTransactionId(current);
  const envelopeState = await validateEnvelope(db, context, record, { excludeTransactionId });
  await validateBudgetLink(db, record, envelopeState, current);
  await assertUnallocatedFunds(db, accounts.source, record, envelopeState, excludeTransactionId);
  await assertSufficientBalance(db, accounts.source, { ...record, status: "active" }, excludeTransactionId);
  await assertNoUnconfirmedDuplicate(db, payload, record, excludeTransactionId);
  return record;
};


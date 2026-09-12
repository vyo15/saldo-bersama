import { readBatchRows } from "../../db/readBatchRows.js";
import { TRANSACTION_TYPE_VALUES } from "../../domainConstants.js";
import { transactionCostSharePresentation } from "../costSharing.js";
import { transactionCapabilities } from "../transactionPolicy.js";
import { appError, boundedInteger, monthBounds, periodKey, publicRow, readableLedgerSql, sanitizeText } from "../core.js";

const TRANSACTION_TYPES = new Set(TRANSACTION_TYPE_VALUES);

const transactionListRequest = (context) => {
  const payload = context.payload || {};
  const request = {
    period: periodKey(payload.period),
    limit: boundedInteger(payload.limit, 20, 1, 200, "Limit transaksi"),
    offset: boundedInteger(payload.offset, 0, 0, 100000, "Offset transaksi"),
    query: sanitizeText(payload.query, 100).toLowerCase(),
    type: String(payload.transaction_type || "all"),
    allocation: String(payload.allocation || "all"),
    accountId: sanitizeText(payload.account_id, 100),
    categoryId: sanitizeText(payload.category_id, 100),
    createdBy: sanitizeText(payload.created_by, 100),
  };
  if (!["all", ...TRANSACTION_TYPES].includes(request.type)) throw appError("INVALID_TRANSACTION_TYPE", "Filter jenis transaksi tidak valid.", 400);
  if (!["all", "allocated", "unallocated"].includes(request.allocation)) throw appError("INVALID_ALLOCATION_FILTER", "Filter Alokasi Dana tidak valid.", 400);
  return request;
};

const transactionListFilters = (context, request) => {
  const access = readableLedgerSql(context.actor, "t");
  const bounds = monthBounds(request.period);
  const baseConditions = ["t.transaction_date BETWEEN ? AND ?", access.sql];
  const baseArgs = [bounds.start, bounds.end, ...access.args];
  const conditions = [...baseConditions];
  const args = [...baseArgs];

  if (request.type !== "all") {
    conditions.push("t.transaction_type=?");
    args.push(request.type);
  }
  if (request.allocation === "allocated") conditions.push("(t.transaction_type<>'expense' OR t.envelope_period_id IS NOT NULL)");
  if (request.allocation === "unallocated") conditions.push("t.transaction_type='expense' AND t.envelope_period_id IS NULL");
  if (request.accountId && request.accountId !== "all") {
    conditions.push("(t.source_account_id=? OR t.destination_account_id=?)");
    args.push(request.accountId, request.accountId);
  }
  if (request.categoryId && request.categoryId !== "all") {
    conditions.push("t.category_id=?");
    args.push(request.categoryId);
  }
  if (request.createdBy && request.createdBy !== "all") {
    conditions.push("t.created_by=?");
    args.push(request.createdBy === "me" ? context.actor.user_id : request.createdBy);
  }
  if (request.query) {
    conditions.push("(lower(t.description) LIKE ? OR lower(t.merchant) LIKE ? OR lower(COALESCE(c.name,'')) LIKE ?)");
    args.push(`%${request.query}%`, `%${request.query}%`, `%${request.query}%`);
  }
  return { baseConditions, baseArgs, conditions, args };
};

const transactionListStatements = (request, filters) => [
  { sql: `SELECT COUNT(*) AS total FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id WHERE ${filters.conditions.join(" AND ")}`, args: filters.args },
  { sql: `SELECT t.* FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id WHERE ${filters.conditions.join(" AND ")}
    ORDER BY t.transaction_date DESC,t.created_at DESC LIMIT ? OFFSET ?`, args: [...filters.args, request.limit, request.offset] },
  { sql: `SELECT DISTINCT a.account_id,a.name,a.account_type,a.bank_template,a.ewallet_template,a.owner_scope,a.owner_user_id,COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS owner_name
    FROM accounts a JOIN transactions t ON t.source_account_id=a.account_id OR t.destination_account_id=a.account_id
    LEFT JOIN users u ON u.user_id=a.owner_user_id
    WHERE ${filters.baseConditions.join(" AND ")} ORDER BY a.name COLLATE NOCASE`, args: filters.baseArgs },
  { sql: `SELECT DISTINCT c.category_id,c.name,c.transaction_type,c.icon
    FROM categories c JOIN transactions t ON t.category_id=c.category_id
    WHERE ${filters.baseConditions.join(" AND ")} ORDER BY c.name COLLATE NOCASE`, args: filters.baseArgs },
  { sql: `SELECT DISTINCT u.user_id,u.name,u.email,u.photo_url,u.role
    FROM users u JOIN transactions t ON t.created_by=u.user_id
    WHERE ${filters.baseConditions.join(" AND ")} ORDER BY u.name COLLATE NOCASE`, args: filters.baseArgs },
  { sql: "SELECT closure_id,period_key FROM period_closures WHERE status='closed' AND period_key >= ? ORDER BY period_key LIMIT 1", args: [request.period] },
];

const transactionListResponse = (context, request, resultRows) => {
  const [countRows, rows, filterAccounts, filterCategories, filterCreators, closureRows] = resultRows;
  const periodLocked = Boolean(closureRows[0]);
  const periodOpen = !periodLocked;
  const items = rows.map((row) => ({ ...publicRow(row), ...transactionCostSharePresentation(row), ...transactionCapabilities(context.actor, row, { periodOpen }) }));
  const total = Number(countRows[0]?.total || 0);
  return {
    items,
    total,
    offset: request.offset,
    limit: request.limit,
    hasMore: request.offset + items.length < total,
    nextOffset: request.offset + items.length,
    periodLocked,
    filterOptions: {
      accounts: filterAccounts.map((row) => publicRow(row)),
      categories: filterCategories.map((row) => publicRow(row)),
      creators: filterCreators.map((row) => publicRow(row)),
    },
  };
};

export const listTransactions = async (db, context) => {
  const request = transactionListRequest(context);
  const filters = transactionListFilters(context, request);
  const resultRows = await readBatchRows(db, transactionListStatements(request, filters));
  return transactionListResponse(context, request, resultRows);
};

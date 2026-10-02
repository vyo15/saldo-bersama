import { appendAudit } from "../audit.js";
import { createTransactionInternal } from "../finance.js";
import { appError, assertVersion, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, uuid } from "../core.js";
import {
  assertShoppingBudgetOperable, assertShoppingItemCapacity, assertShoppingListOperable, newShoppingRow,
  normalizeShoppingItemInput, normalizeShoppingItemState, touchShoppingList,
} from "./shared.js";

const monthLabel = (period) => {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return "Belanja";
  return `Belanja ${new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(Date.UTC(year, month - 1, 1)))}`;
};

export const createShoppingList = async (db, context) => {
  const budgetId = String(context.payload?.budget_id || context.payload?.budgetId || "");
  const budget = await assertShoppingBudgetOperable(db, context, budgetId);
  const existing = await db.one("SELECT * FROM shopping_lists WHERE budget_id=? AND status IN ('draft','active') ORDER BY updated_at DESC LIMIT 1", [budgetId]);
  if (existing) return publicRow(existing);
  const name = sanitizeText(context.payload?.name || monthLabel(budget.period_key), 120) || monthLabel(budget.period_key);
  const row = newShoppingRow(context, budgetId, name);
  await db.execute(`INSERT INTO shopping_lists(shopping_list_id,budget_id,name,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`, Object.values(row));
  await appendAudit(db, context, { entityType: "shopping_list", entityId: row.shopping_list_id, next: publicRow(row) });
  return publicRow(row);
};

export const createShoppingItem = async (db, context) => {
  const listId = String(context.payload?.shopping_list_id || context.payload?.shoppingListId || "");
  const { list } = await assertShoppingListOperable(db, context, listId, { expectedVersion: context.payload?.list_row_version ?? context.payload?.listRowVersion });
  await assertShoppingItemCapacity(db, listId);
  const normalized = normalizeShoppingItemInput(context.payload || {});
  const timestamp = nowIso();
  const sort = await db.one("SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM shopping_items WHERE shopping_list_id=?", [listId]);
  const row = { shopping_item_id: uuid(), shopping_list_id: listId, ...normalized, status: "pending", purchased_checkout_id: null, sort_order: Number(sort?.next_order || 0), row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
  await db.execute(`INSERT INTO shopping_items(shopping_item_id,shopping_list_id,name,quantity_milli,unit_key,estimated_unit_price,estimated_amount,actual_amount,note,group_name,status,purchased_checkout_id,sort_order,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(row));
  const nextList = await touchShoppingList(db, context, list);
  return { item: publicRow(row), list: publicRow(nextList) };
};

const mutableItem = async (db, context, payload) => {
  const itemId = String(payload?.shopping_item_id || payload?.shoppingItemId || "");
  const item = await db.one("SELECT * FROM shopping_items WHERE shopping_item_id=?", [itemId]);
  if (!item) throw appError("SHOPPING_ITEM_NOT_FOUND", "Barang tidak ditemukan.", 404);
  const expected = context.rowVersion ?? payload?.row_version ?? payload?.rowVersion;
  assertVersion(item, expected);
  const state = await assertShoppingListOperable(db, context, item.shopping_list_id);
  if (item.status === "purchased") throw appError("SHOPPING_ITEM_PURCHASED", "Barang yang sudah dicatat sebagai transaksi tidak dapat diubah.", 409);
  return { item, ...state };
};

export const updateShoppingItem = async (db, context) => {
  const { item, list } = await mutableItem(db, context, context.payload || {});
  const normalized = normalizeShoppingItemInput(context.payload || {}, item);
  const next = { ...item, ...normalized, row_version: Number(item.row_version) + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute(`UPDATE shopping_items SET name=?,quantity_milli=?,unit_key=?,estimated_unit_price=?,estimated_amount=?,actual_amount=?,note=?,group_name=?,row_version=?,updated_by=?,updated_at=?
    WHERE shopping_item_id=? AND row_version=?`, [next.name,next.quantity_milli,next.unit_key,next.estimated_unit_price,next.estimated_amount,next.actual_amount,next.note,next.group_name,next.row_version,next.updated_by,next.updated_at,item.shopping_item_id,item.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Barang berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  const nextList = await touchShoppingList(db, context, list);
  return { item: publicRow(next), list: publicRow(nextList) };
};

export const setShoppingItemState = async (db, context) => {
  const { item, list } = await mutableItem(db, context, context.payload || {});
  const status = normalizeShoppingItemState(context.payload?.status);
  const actualAmount = context.payload?.actual_amount === undefined ? Number(item.actual_amount || 0) : Number(context.payload.actual_amount);
  if (!Number.isSafeInteger(actualAmount) || actualAmount < 0) throw appError("SHOPPING_ACTUAL_AMOUNT_INVALID", "Harga aktual tidak valid.", 400);
  const next = { ...item, status, actual_amount: actualAmount, row_version: Number(item.row_version) + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute("UPDATE shopping_items SET status=?,actual_amount=?,row_version=?,updated_by=?,updated_at=? WHERE shopping_item_id=? AND row_version=?", [next.status,next.actual_amount,next.row_version,next.updated_by,next.updated_at,item.shopping_item_id,item.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Barang berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  const nextList = await touchShoppingList(db, context, list);
  return { item: publicRow(next), list: publicRow(nextList) };
};

export const removeShoppingItem = async (db, context) => {
  const { item, list } = await mutableItem(db, context, context.payload || {});
  const nextVersion = Number(item.row_version) + 1;
  const updatedAt = nowIso();
  const result = await db.execute("UPDATE shopping_items SET status='removed',purchased_checkout_id=NULL,row_version=?,updated_by=?,updated_at=? WHERE shopping_item_id=? AND row_version=?", [nextVersion,context.actor.user_id,updatedAt,item.shopping_item_id,item.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Barang berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  const nextList = await touchShoppingList(db, context, list);
  return { removed: true, shopping_item_id: item.shopping_item_id, list: publicRow(nextList) };
};

const activeEnvelopePeriod = async (db, budget, transactionDate) => {
  const row = await db.one(`SELECT p.envelope_period_id FROM envelope_periods p
    WHERE p.envelope_rule_id=? AND p.status='active' AND ? BETWEEN p.period_start AND p.period_end
    ORDER BY p.period_start DESC LIMIT 1`, [budget.envelope_rule_id, transactionDate]);
  if (!row) throw appError("SHOPPING_ENVELOPE_PERIOD_NOT_FOUND", "Periode Alokasi Dana aktif untuk tanggal belanja tidak ditemukan.", 409);
  return row.envelope_period_id;
};

const checkoutTotal = (items, payload) => {
  const derivedTotal = items.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
  const suppliedTotal = payload.total_amount;
  if (suppliedTotal === undefined || suppliedTotal === null || suppliedTotal === "") return derivedTotal;
  return positiveInteger(suppliedTotal, "Total belanja");
};

const checkoutDateForBudget = (payload, context, budget) => {
  const transactionDate = dateValue(payload.checkout_date || context.today, "Tanggal belanja");
  if (budget.period_key !== transactionDate.slice(0, 7)) throw appError("SHOPPING_DATE_PERIOD_MISMATCH", "Tanggal belanja harus berada pada periode Kebutuhan.", 409);
  return transactionDate;
};

const createCheckoutTransaction = async (db, context, { payload, list, budget, transactionDate, envelopePeriodId, totalAmount }) => createTransactionInternal(db, { ...context, action: "shopping.checkout" }, {
  transaction_date: transactionDate,
  transaction_type: "expense",
  source_account_id: budget.source_account_id,
  category_id: budget.category_id,
  envelope_period_id: envelopePeriodId,
  budget_id: budget.budget_id,
  amount: totalAmount,
  description: sanitizeText(payload.description || list.name || budget.name, 250),
  overspend_reason: sanitizeText(payload.overspend_reason || "", 180),
  merchant: sanitizeText(payload.merchant || "", 120),
  payment_method: sanitizeText(payload.payment_method || "", 40),
  confirm_duplicate: payload.confirm_duplicate === true,
}, { audit: true });

const markCheckoutItemsPurchased = async (db, context, items, checkoutId, timestamp) => {
  for (const item of items) {
    await db.execute("UPDATE shopping_items SET status='purchased',purchased_checkout_id=?,row_version=row_version+1,updated_by=?,updated_at=? WHERE shopping_item_id=? AND status='in_cart'", [checkoutId, context.actor.user_id, timestamp, item.shopping_item_id]);
  }
};

const applyCheckoutLeftoverAction = async (db, context, payload, listId, timestamp) => {
  if (String(payload.leftover_action || "keep") !== "remove") return;
  await db.execute("UPDATE shopping_items SET status='removed',row_version=row_version+1,updated_by=?,updated_at=? WHERE shopping_list_id=? AND status='pending'", [context.actor.user_id, timestamp, listId]);
};

const updateListAfterCheckout = async (db, context, list, listId, timestamp) => {
  const remaining = await db.one("SELECT COUNT(*) AS count FROM shopping_items WHERE shopping_list_id=? AND status IN ('pending','in_cart')", [listId]);
  const nextStatus = Number(remaining?.count || 0) === 0 ? "completed" : "active";
  const nextVersion = Number(list.row_version) + 1;
  const updated = await db.execute("UPDATE shopping_lists SET status=?,row_version=?,updated_by=?,updated_at=? WHERE shopping_list_id=? AND row_version=?", [nextStatus, nextVersion, context.actor.user_id, timestamp, listId, list.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Daftar belanja berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  return { nextStatus, nextVersion };
};

const checkoutPublicRecord = ({ checkoutId, listId, transactionId, totalAmount, itemCount, transactionDate }) => ({
  shopping_checkout_id: checkoutId,
  shopping_list_id: listId,
  transaction_id: transactionId,
  total_amount: totalAmount,
  item_count: itemCount,
  checkout_date: transactionDate,
});

export const checkoutShoppingList = async (db, context) => {
  const payload = context.payload || {};
  const listId = String(payload.shopping_list_id || payload.shoppingListId || "");
  const { list, budget } = await assertShoppingListOperable(db, context, listId, { expectedVersion: payload.row_version ?? payload.rowVersion });
  const items = await db.all("SELECT * FROM shopping_items WHERE shopping_list_id=? AND status='in_cart' ORDER BY sort_order,created_at", [listId]);
  if (!items.length) throw appError("SHOPPING_CART_EMPTY", "Belum ada barang di keranjang untuk dicatat.", 409);
  const totalAmount = checkoutTotal(items, payload);
  if (totalAmount <= 0) throw appError("SHOPPING_TOTAL_REQUIRED", "Isi total aktual belanja sebelum mencatat transaksi.", 400);
  const transactionDate = checkoutDateForBudget(payload, context, budget);
  const envelopePeriodId = await activeEnvelopePeriod(db, budget, transactionDate);
  const transaction = await createCheckoutTransaction(db, context, { payload, list, budget, transactionDate, envelopePeriodId, totalAmount });
  const checkoutId = uuid();
  const timestamp = nowIso();
  const checkout = checkoutPublicRecord({ checkoutId, listId, transactionId: transaction.transaction_id, totalAmount, itemCount: items.length, transactionDate });
  await db.execute(`INSERT INTO shopping_checkouts(shopping_checkout_id,shopping_list_id,transaction_id,total_amount,item_count,checkout_date,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?)`, [checkoutId, listId, transaction.transaction_id, totalAmount, items.length, transactionDate, context.actor.user_id, timestamp]);
  await markCheckoutItemsPurchased(db, context, items, checkoutId, timestamp);
  await applyCheckoutLeftoverAction(db, context, payload, listId, timestamp);
  const { nextStatus, nextVersion } = await updateListAfterCheckout(db, context, list, listId, timestamp);
  await appendAudit(db, context, {
    entityType: "shopping_checkout",
    entityId: checkoutId,
    next: { shopping_list_id: listId, transaction_id: transaction.transaction_id, total_amount: totalAmount, item_count: items.length, checkout_date: transactionDate },
  });
  return { checkout, transaction, list: { ...publicRow(list), status: nextStatus, row_version: nextVersion, updated_by: context.actor.user_id, updated_at: timestamp } };
};

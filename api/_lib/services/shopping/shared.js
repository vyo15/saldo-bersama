import { appError, assertVersion, nonNegativeInteger, nowIso, positiveInteger, sanitizeText, uuid } from "../core.js";

const MAX_ITEMS = 100;
const ITEM_STATES = new Set(["pending", "in_cart", "purchased", "removed"]);
const LIST_MUTABLE_STATES = new Set(["draft", "active"]);

export const shoppingBudgetContext = async (db, budgetId) => {
  const row = await db.one(`SELECT b.*,c.name AS category_name,er.name AS envelope_name,er.source_account_id,er.assignee_user_id,
    a.name AS source_account_name,a.account_type AS source_account_type,
    COALESCE((SELECT SUM(t.amount) FROM transactions t
      LEFT JOIN envelope_periods tep ON tep.envelope_period_id=t.envelope_period_id
      WHERE t.status='active' AND t.transaction_type='expense'
        AND t.transaction_date BETWEEN b.period_key||'-01' AND date(b.period_key||'-01','+1 month','-1 day')
        AND t.category_id=b.category_id AND t.scope=b.scope
        AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
        AND (t.budget_id=b.budget_id OR (t.budget_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM budgets sibling WHERE sibling.budget_id<>b.budget_id AND sibling.status='active'
            AND sibling.period_key=b.period_key AND sibling.category_id=b.category_id AND sibling.scope=b.scope
            AND COALESCE(sibling.owner_user_id,'')=COALESCE(b.owner_user_id,'')
            AND COALESCE(sibling.envelope_rule_id,'')=COALESCE(b.envelope_rule_id,''))
          AND (b.envelope_rule_id IS NULL OR tep.envelope_rule_id=b.envelope_rule_id)))),0) AS used_amount
    FROM budgets b
    LEFT JOIN categories c ON c.category_id=b.category_id
    LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
    LEFT JOIN accounts a ON a.account_id=er.source_account_id
    WHERE b.budget_id=?`, [String(budgetId || "")]);
  if (!row) throw appError("SHOPPING_BUDGET_NOT_FOUND", "Kebutuhan untuk daftar belanja tidak ditemukan.", 404);
  return row;
};

export const assertShoppingBudgetReadable = async (db, context, budgetId) => shoppingBudgetContext(db, budgetId);

export const assertShoppingBudgetOperable = async (db, context, budgetId) => {
  const budget = await shoppingBudgetContext(db, budgetId);
  if (budget.status !== "active") throw appError("SHOPPING_BUDGET_INACTIVE", "Kebutuhan sudah tidak aktif.", 409);
  const personalDenied = budget.scope === "personal" && String(budget.owner_user_id || "") !== String(context.actor.user_id || "");
  const sharedAssignedDenied = budget.scope === "shared" && budget.assignee_user_id && budget.assignee_user_id !== context.actor.user_id && context.actor.role !== "owner";
  if (personalDenied || sharedAssignedDenied) throw appError("SHOPPING_FORBIDDEN", "Daftar belanja ini tidak dapat diubah oleh pengguna aktif.", 403);
  if (!budget.category_id) throw appError("SHOPPING_CATEGORY_REQUIRED", "Kebutuhan harus memiliki kategori pengeluaran sebelum dipakai untuk daftar belanja.", 409);
  if (!budget.envelope_rule_id || !budget.source_account_id) throw appError("SHOPPING_ALLOCATION_REQUIRED", "Daftar belanja membutuhkan Kebutuhan yang terhubung ke Alokasi Dana dan rekening sumber.", 409);
  return budget;
};

export const shoppingListRow = async (db, listId) => {
  const row = await db.one("SELECT * FROM shopping_lists WHERE shopping_list_id=?", [String(listId || "")]);
  if (!row) throw appError("SHOPPING_LIST_NOT_FOUND", "Daftar belanja tidak ditemukan.", 404);
  return row;
};

export const assertShoppingListOperable = async (db, context, listId, { expectedVersion = null, mutable = true } = {}) => {
  const list = await shoppingListRow(db, listId);
  const budget = await assertShoppingBudgetOperable(db, context, list.budget_id);
  if (mutable && !LIST_MUTABLE_STATES.has(list.status)) throw appError("SHOPPING_LIST_READ_ONLY", "Daftar belanja ini sudah selesai dan hanya dapat dilihat.", 409);
  if (expectedVersion !== null && expectedVersion !== undefined) assertVersion(list, expectedVersion);
  return { list, budget };
};

const shoppingItemValue = (payload, current, key, fallback) => {
  const inputValue = payload[key];
  if (inputValue !== undefined && inputValue !== null) return inputValue;
  const currentValue = current?.[key];
  return currentValue === undefined || currentValue === null ? fallback : currentValue;
};

export const normalizeShoppingItemInput = (payload = {}, current = null) => {
  const name = sanitizeText(shoppingItemValue(payload, current, "name", ""), 120);
  if (!name) throw appError("SHOPPING_ITEM_NAME_REQUIRED", "Nama barang wajib diisi.", 400);
  const quantityMilli = positiveInteger(shoppingItemValue(payload, current, "quantity_milli", 1000), "Jumlah barang");
  if (quantityMilli > 1_000_000) throw appError("SHOPPING_ITEM_QUANTITY_INVALID", "Jumlah barang terlalu besar.", 400);
  const unitKey = sanitizeText(shoppingItemValue(payload, current, "unit_key", "pcs"), 24) || "pcs";
  const estimatedUnitPrice = nonNegativeInteger(shoppingItemValue(payload, current, "estimated_unit_price", 0), "Perkiraan harga satuan");
  const estimatedAmountInput = payload.estimated_amount;
  const estimatedAmount = estimatedAmountInput === undefined || estimatedAmountInput === null
    ? Math.round((quantityMilli / 1000) * estimatedUnitPrice)
    : nonNegativeInteger(estimatedAmountInput, "Total estimasi");
  const actualAmount = nonNegativeInteger(shoppingItemValue(payload, current, "actual_amount", 0), "Harga aktual");
  const note = sanitizeText(shoppingItemValue(payload, current, "note", ""), 300);
  const groupName = sanitizeText(shoppingItemValue(payload, current, "group_name", ""), 60);
  return { name, quantity_milli: quantityMilli, unit_key: unitKey, estimated_unit_price: estimatedUnitPrice, estimated_amount: estimatedAmount, actual_amount: actualAmount, note, group_name: groupName };
};

export const normalizeShoppingItemState = (value) => {
  const status = String(value || "");
  if (!ITEM_STATES.has(status) || status === "purchased") throw appError("SHOPPING_ITEM_STATE_INVALID", "Status barang tidak valid.", 400);
  return status;
};

export const assertShoppingItemCapacity = async (db, listId) => {
  const row = await db.one("SELECT COUNT(*) AS count FROM shopping_items WHERE shopping_list_id=? AND status<>'removed'", [listId]);
  if (Number(row?.count || 0) >= MAX_ITEMS) throw appError("SHOPPING_ITEM_LIMIT", `Satu daftar belanja maksimal ${MAX_ITEMS} barang aktif.`, 409);
};

export const shoppingSummary = (items = []) => {
  const active = items.filter((item) => item.status !== "removed");
  const purchased = active.filter((item) => item.status === "purchased");
  const inCart = active.filter((item) => item.status === "in_cart");
  const pending = active.filter((item) => item.status === "pending");
  return {
    total_items: active.length,
    pending_items: pending.length,
    in_cart_items: inCart.length,
    purchased_items: purchased.length,
    estimated_total: active.reduce((sum, item) => sum + Number(item.estimated_amount || 0), 0),
    in_cart_estimated_total: inCart.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0),
    purchased_total: purchased.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0),
  };
};

export const touchShoppingList = async (db, context, list) => {
  const nextVersion = Number(list.row_version || 1) + 1;
  const updatedAt = nowIso();
  const result = await db.execute("UPDATE shopping_lists SET row_version=?,updated_by=?,updated_at=? WHERE shopping_list_id=? AND row_version=?", [nextVersion, context.actor.user_id, updatedAt, list.shopping_list_id, list.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Daftar belanja berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  return { ...list, row_version: nextVersion, updated_by: context.actor.user_id, updated_at: updatedAt };
};

export const newShoppingRow = (context, budgetId, name) => {
  const timestamp = nowIso();
  return { shopping_list_id: uuid(), budget_id: budgetId, name, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
};

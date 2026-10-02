import { appError, publicRow, sanitizeText } from "../core.js";
import { assertShoppingBudgetReadable, shoppingSummary } from "./shared.js";

const listByBudget = async (db, budgetId) => db.one(`SELECT * FROM shopping_lists
  WHERE budget_id=? AND status<>'archived'
  ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,updated_at DESC LIMIT 1`, [budgetId]);

const itemsForList = async (db, listId) => db.all(`SELECT i.*,COALESCE(NULLIF(TRIM(u.name),''),NULLIF(TRIM(u.email),''),'Pengguna') AS creator_name
  FROM shopping_items i LEFT JOIN users u ON u.user_id=i.created_by
  WHERE i.shopping_list_id=? ORDER BY CASE i.status WHEN 'pending' THEN 0 WHEN 'in_cart' THEN 1 WHEN 'purchased' THEN 2 ELSE 3 END,i.sort_order,i.created_at`, [listId]);

const checkoutHistory = (db, listId) => db.all(`SELECT sc.*,t.status AS transaction_status,t.row_version AS transaction_row_version
  FROM shopping_checkouts sc JOIN transactions t ON t.transaction_id=sc.transaction_id
  WHERE sc.shopping_list_id=? ORDER BY sc.checkout_date DESC,sc.created_at DESC`, [listId]);

const budgetPresentation = (budget) => ({
  budget_id: budget.budget_id, name: budget.name, amount: Number(budget.amount || 0), period_key: budget.period_key,
  category_id: budget.category_id || "", category_name: budget.category_name || "", envelope_rule_id: budget.envelope_rule_id || "",
  envelope_name: budget.envelope_name || "", source_account_id: budget.source_account_id || "", source_account_name: budget.source_account_name || "",
  scope: budget.scope, owner_user_id: budget.owner_user_id || "", assignee_user_id: budget.assignee_user_id || "", used_amount: Number(budget.used_amount || 0), remaining_amount: Math.max(0, Number(budget.amount || 0) - Number(budget.used_amount || 0)), row_version: Number(budget.row_version || 1), status: budget.status,
});

const resolveShoppingDetailContext = async (db, context) => {
  const budgetId = String(context.payload?.budget_id || context.payload?.budgetId || "");
  const requestedListId = String(context.payload?.shopping_list_id || context.payload?.shoppingListId || "");
  if (requestedListId) {
    const list = await db.one("SELECT * FROM shopping_lists WHERE shopping_list_id=?", [requestedListId]);
    if (!list) throw appError("SHOPPING_LIST_NOT_FOUND", "Daftar belanja tidak ditemukan.", 404);
    const budget = await assertShoppingBudgetReadable(db, context, list.budget_id);
    return { budget, list };
  }
  if (!budgetId) throw appError("SHOPPING_BUDGET_REQUIRED", "Kebutuhan wajib dipilih.", 400);
  const budget = await assertShoppingBudgetReadable(db, context, budgetId);
  return { budget, list: await listByBudget(db, budgetId) };
};

const canManageShoppingBudget = (budget, actor) => {
  if (budget.status !== "active") return false;
  if (budget.scope === "personal") return budget.owner_user_id === actor.user_id;
  if (budget.scope !== "shared") return false;
  return !budget.assignee_user_id || budget.assignee_user_id === actor.user_id || actor.role === "owner";
};

export const shoppingDetail = async (db, context) => {
  const { budget, list } = await resolveShoppingDetailContext(db, context);
  const items = list ? await itemsForList(db, list.shopping_list_id) : [];
  const checkouts = list ? await checkoutHistory(db, list.shopping_list_id) : [];
  const summary = shoppingSummary(items);
  return {
    budget: budgetPresentation(budget),
    list: list ? publicRow(list) : null,
    items: items.map((row) => publicRow(row)),
    checkouts: checkouts.map((row) => publicRow(row)),
    summary,
    can_manage: canManageShoppingBudget(budget, context.actor),
  };
};

export const shoppingSuggestions = async (db, context) => {
  const budgetId = String(context.payload?.budget_id || context.payload?.budgetId || "");
  await assertShoppingBudgetReadable(db, context, budgetId);
  const query = sanitizeText(context.payload?.query || "", 120).toLowerCase();
  if (!query) return { items: [] };
  const rows = await db.all(`SELECT i.name,i.unit_key,i.quantity_milli,
    MAX(CASE WHEN i.actual_amount>0 THEN i.actual_amount ELSE i.estimated_amount END) AS last_amount,
    COUNT(DISTINCT i.shopping_list_id) AS list_count,MAX(i.updated_at) AS last_seen_at
    FROM shopping_items i JOIN shopping_lists l ON l.shopping_list_id=i.shopping_list_id
    WHERE l.budget_id=? AND i.status<>'removed' AND lower(i.name) LIKE ?
    GROUP BY lower(i.name),i.unit_key,i.quantity_milli ORDER BY list_count DESC,last_seen_at DESC LIMIT 8`, [budgetId, `${query}%`]);
  return { items: rows.map((row) => publicRow(row)) };
};

export const shoppingByTransaction = async (db, context) => {
  const transactionId = String(context.payload?.transaction_id || context.payload?.transactionId || "");
  if (!transactionId) throw appError("TRANSACTION_REQUIRED", "Transaksi wajib dipilih.", 400);
  const checkout = await db.one(`SELECT sc.*,l.name AS list_name,l.shopping_list_id,l.budget_id,b.name AS budget_name
    FROM shopping_checkouts sc JOIN shopping_lists l ON l.shopping_list_id=sc.shopping_list_id JOIN budgets b ON b.budget_id=l.budget_id
    WHERE sc.transaction_id=?`, [transactionId]);
  if (!checkout) return { checkout: null, items: [] };
  const items = await db.all(`SELECT name,quantity_milli,unit_key,actual_amount,estimated_amount,group_name
    FROM shopping_items WHERE purchased_checkout_id=? ORDER BY sort_order,created_at`, [checkout.shopping_checkout_id]);
  return { checkout: publicRow(checkout), items: items.map((row) => publicRow(row)) };
};

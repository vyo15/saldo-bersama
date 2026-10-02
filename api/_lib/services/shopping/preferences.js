import { appendAudit } from "../audit.js";
import { appError, nowIso, publicRow, sanitizeText } from "../core.js";
import { newShoppingRow } from "./shared.js";

const nonArchivedLists = (db, budgetId) => db.all(`SELECT * FROM shopping_lists
  WHERE budget_id=? AND status<>'archived'
  ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,updated_at DESC`, [budgetId]);

const listDependencies = async (db, listId) => {
  const row = await db.one(`SELECT
    COUNT(i.shopping_item_id) AS item_count,
    SUM(CASE WHEN i.status IN ('pending','in_cart') THEN 1 ELSE 0 END) AS open_item_count,
    (SELECT COUNT(*) FROM shopping_checkouts sc WHERE sc.shopping_list_id=?) AS checkout_count
    FROM shopping_lists l LEFT JOIN shopping_items i ON i.shopping_list_id=l.shopping_list_id
    WHERE l.shopping_list_id=?`, [listId, listId]);
  return {
    itemCount: Number(row?.item_count || 0),
    openItemCount: Number(row?.open_item_count || 0),
    checkoutCount: Number(row?.checkout_count || 0),
  };
};

const createPreferenceList = async (db, context, budget) => {
  const name = sanitizeText(`Daftar ${budget.name || 'belanja'}`, 120) || "Daftar belanja";
  const row = newShoppingRow(context, budget.budget_id, name);
  await db.execute(`INSERT INTO shopping_lists(shopping_list_id,budget_id,name,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`, Object.values(row));
  await appendAudit(db, context, { entityType: "shopping_list", entityId: row.shopping_list_id, next: { ...publicRow(row), enabled_from_budget: true } });
  return row;
};

const disablePreferenceLists = async (db, context, lists) => {
  const dependencies = [];
  for (const list of lists) dependencies.push({ list, ...(await listDependencies(db, list.shopping_list_id)) });
  const open = dependencies.reduce((total, entry) => total + entry.openItemCount, 0);
  if (open > 0) {
    throw appError(
      "SHOPPING_DISABLE_OPEN_ITEMS",
      "Daftar belanja masih memiliki barang yang belum selesai. Selesaikan atau hapus barang tersebut sebelum menonaktifkan daftar belanja.",
      409,
      { open_item_count: open },
    );
  }

  for (const entry of dependencies) {
    const { list } = entry;
    const next = {
      ...list,
      status: "archived",
      row_version: Number(list.row_version || 1) + 1,
      updated_by: context.actor.user_id,
      updated_at: nowIso(),
    };
    const result = await db.execute("UPDATE shopping_lists SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE shopping_list_id=? AND row_version=? AND status<>'archived'", [next.row_version, next.updated_by, next.updated_at, list.shopping_list_id, list.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Daftar belanja berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
    await appendAudit(db, context, { entityType: "shopping_list", entityId: list.shopping_list_id, previous: publicRow(list), next: publicRow(next) });
  }
};

export const syncBudgetShoppingPreference = async (db, context, budget, enabled) => {
  if (typeof enabled !== "boolean") return null;
  const lists = await nonArchivedLists(db, budget.budget_id);
  if (enabled) return lists[0] || createPreferenceList(db, context, budget);
  if (!lists.length) return null;
  await disablePreferenceLists(db, context, lists);
  return null;
};

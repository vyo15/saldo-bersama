import { appError, nowIso } from "./core.js";

const entityAccess = {
  wishlist_item: {
    sql: "SELECT w.scope,w.owner_user_id FROM wishlist_items w WHERE w.wishlist_item_id=?",
  },
  shopping_item: {
    sql: "SELECT b.scope,b.owner_user_id FROM shopping_items i JOIN shopping_lists l ON l.shopping_list_id=i.shopping_list_id JOIN budgets b ON b.budget_id=l.budget_id WHERE i.shopping_item_id=?",
  },
};

// Visibility is deliberately user-scoped. It must not mutate purchase status,
// cancel transactions, or remove data from any shared financial aggregation.
export const setItemVisibility = async (db, context) => {
  const kind = String(context.payload?.entity_kind || "");
  const id = String(context.payload?.entity_id || "");
  if (!Object.hasOwn(entityAccess, kind) || !id || id.length > 120 || typeof context.payload?.hidden !== "boolean") {
    throw appError("INVALID_VISIBILITY_INPUT", "Pilihan data yang akan disembunyikan tidak valid.", 400);
  }
  const entity = await db.one(entityAccess[kind].sql, [id]);
  if (!entity || (entity.scope !== "shared" && !(entity.scope === "personal" && entity.owner_user_id === context.actor.user_id))) {
    throw appError("VISIBILITY_NOT_FOUND", "Data tidak ditemukan atau tidak dapat diakses.", 404);
  }
  await db.execute(`INSERT INTO user_hidden_items(user_id,entity_kind,entity_id,hidden,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,entity_kind,entity_id) DO UPDATE SET hidden=excluded.hidden,updated_at=excluded.updated_at`,
  [context.actor.user_id,kind,id,context.payload.hidden ? 1 : 0,nowIso()]);
  return { entity_kind: kind, entity_id: id, hidden: context.payload.hidden };
};

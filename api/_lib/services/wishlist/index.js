import { appendAudit } from "../audit.js";
import { createTransactionInternal } from "../finance.js";
import { appError, assertVersion, dateValue, nonNegativeInteger, nowIso, positiveInteger, publicRow, sanitizeText, uuid } from "../core.js";

const priorities = new Set(["soon", "planned", "later"]);
const strategies = new Set(["gradual", "available", "combined"]);
const cleanChoice = (input, values, label) => {
  const value = String(input || "");
  if (!values.has(value)) throw appError("WISHLIST_INVALID_CHOICE", `${label} tidak valid.`, 400);
  return value;
};
const optionalDate = (value) => value ? dateValue(value, "Tanggal target") : null;
const productLink = (input) => {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.length > 1200) throw appError("WISHLIST_URL_INVALID", "Link produk terlalu panjang.", 400);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || /[\u0000-\u001f]/.test(raw)) throw new Error("unsafe");
    return url.toString();
  } catch { throw appError("WISHLIST_URL_INVALID", "Gunakan link produk HTTPS yang valid.", 400); }
};
// Keep the original validation order while selecting an edited value only when supplied.
// Centralising this fallback also avoids hiding branching in a large form validator.
const planValue = (payload, current, key, fallback) => payload[key] ?? current?.[key] ?? fallback;
const validateFundingSchedule = (strategy, targetDate, monthlyPlan) => {
  if (strategy === "gradual" && !targetDate && !monthlyPlan) {
    throw appError("WISHLIST_PLAN_REQUIRED", "Isi target tanggal atau dana bulanan agar rencana bertahap terukur.", 400);
  }
  if (strategy === "combined" && !targetDate && !monthlyPlan) {
    throw appError("WISHLIST_PLAN_REQUIRED", "Isi target tanggal atau dana bulanan untuk bagian dana yang belum tersedia.", 400);
  }
};
export const wishlistPlan = (payload, current = null) => {
  const name = sanitizeText(planValue(payload, current, "name"), 120);
  if (!name) throw appError("WISHLIST_NAME_REQUIRED", "Nama barang wajib diisi.", 400);
  const estimated_amount = positiveInteger(planValue(payload, current, "estimated_amount"), "Perkiraan harga");
  const priority = cleanChoice(planValue(payload, current, "priority", "planned"), priorities, "Prioritas");
  const funding_strategy = cleanChoice(planValue(payload, current, "funding_strategy", "gradual"), strategies, "Cara menyiapkan dana");
  const target_date = optionalDate(planValue(payload, current, "target_date"));
  const monthly_plan = nonNegativeInteger(planValue(payload, current, "monthly_plan", 0), "Rencana bulanan");
  const product_url = productLink(planValue(payload, current, "product_url"));
  const note = sanitizeText(planValue(payload, current, "note"), 400);
  validateFundingSchedule(funding_strategy, target_date, monthly_plan);
  return { name, estimated_amount, priority, funding_strategy, target_date, monthly_plan, product_url, note };
};
const canEdit = (row, actor) => row.scope === "personal" ? row.owner_user_id === actor.user_id : row.created_by === actor.user_id || actor.role === "owner";
const readable = (row, actor) => row.scope === "shared" || row.owner_user_id === actor.user_id;
const getItem = async (db, context) => {
  const id = String(context.payload?.wishlist_item_id || "");
  const row = await db.one("SELECT * FROM wishlist_items WHERE wishlist_item_id=?", [id]);
  if (!row || !readable(row, context.actor)) throw appError("WISHLIST_NOT_FOUND", "Keinginan tidak ditemukan.", 404);
  return row;
};
const editable = async (db, context) => {
  const row = await getItem(db, context);
  if (!canEdit(row, context.actor)) throw appError("WISHLIST_FORBIDDEN", "Anda tidak berhak mengubah keinginan ini.", 403);
  assertVersion(row, context.rowVersion ?? context.payload?.row_version);
  return row;
};
const present = (row) => publicRow(row);

export const listWishlist = async (db, context) => {
  const rows = await db.all(`SELECT w.*,t.status AS purchase_transaction_status,CASE WHEN t.status='active' THEN t.amount ELSE w.purchased_amount END AS displayed_purchased_amount FROM wishlist_items w
    LEFT JOIN transactions t ON t.transaction_id=w.purchase_transaction_id
    WHERE w.scope='shared' OR w.owner_user_id=?
    ORDER BY CASE w.status WHEN 'active' THEN 0 WHEN 'purchased' THEN 1 ELSE 2 END,
      CASE w.priority WHEN 'soon' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,w.created_at DESC`, [context.actor.user_id]);
  return { items: rows.map(present) };
};
export const createWishlist = async (db, context) => {
  const payload = context.payload || {};
  const scope = cleanChoice(payload.scope, new Set(["personal", "shared"]), "Pemilik Wishlist");
  const owner_user_id = scope === "personal" ? context.actor.user_id : null;
  const plan = wishlistPlan(payload);
  const timestamp = nowIso();
  const record = { wishlist_item_id: uuid(), scope, owner_user_id, ...plan, status: "active", purchase_transaction_id: null, purchased_amount: 0, row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
  const columns = Object.keys(record);
  await db.execute(`INSERT INTO wishlist_items(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`, Object.values(record));
  await appendAudit(db, context, { entityType: "wishlist_item", entityId: record.wishlist_item_id, next: present(record) });
  return { item: present(record) };
};
export const updateWishlist = async (db, context) => {
  const current = await editable(db, context);
  if (current.status !== "active") throw appError("WISHLIST_READ_ONLY", "Hanya keinginan aktif yang dapat diedit.", 409);
  const plan = wishlistPlan(context.payload || {}, current);
  const next = { ...current, ...plan, row_version: current.row_version + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute(`UPDATE wishlist_items SET name=?,estimated_amount=?,priority=?,funding_strategy=?,target_date=?,monthly_plan=?,product_url=?,note=?,row_version=?,updated_by=?,updated_at=? WHERE wishlist_item_id=? AND row_version=?`,
    [...Object.values(plan), next.row_version, next.updated_by, next.updated_at, current.wishlist_item_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Keinginan sudah berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "wishlist_item", entityId: current.wishlist_item_id, previous: present(current), next: present(next) });
  return { item: present(next) };
};
export const changeWishlistState = async (db, context) => {
  const current = await editable(db, context);
  const nextStatus = cleanChoice(context.payload?.status, new Set(["active", "archived"]), "Status");
  if (current.status === "purchased") throw appError("WISHLIST_PURCHASE_LINKED", "Keinginan sudah dibeli. Koreksi melalui transaksi terkait.", 409);
  if (nextStatus === current.status) return { item: present(current) };
  const next = { ...current, status: nextStatus, row_version: current.row_version + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute("UPDATE wishlist_items SET status=?,row_version=?,updated_by=?,updated_at=? WHERE wishlist_item_id=? AND row_version=?", [next.status, next.row_version, next.updated_by, next.updated_at, current.wishlist_item_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Keinginan sudah berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "wishlist_item", entityId: current.wishlist_item_id, previous: present(current), next: present(next) });
  return { item: present(next) };
};

const assertPaymentAccount = async (db, item, accountId) => {
  const account = await db.one("SELECT account_id,owner_scope,owner_user_id,status FROM accounts WHERE account_id=?", [accountId]);
  if (!account || account.status !== "active" || account.owner_scope !== item.scope ||
    (item.scope === "personal" && account.owner_user_id !== item.owner_user_id)) {
    throw appError("WISHLIST_ACCOUNT_SCOPE_MISMATCH", "Rekening pembayaran harus sesuai pemilik Wishlist dan tetap aktif.", 400);
  }
};
const purchaseText = (payload, field, fallback, limit) => sanitizeText(payload[field] || fallback, limit);
const transactionInputForWishlist = (context, item, accountId, amount) => {
  const payload = context.payload || {};
  return {
    transaction_type: "expense",
    transaction_date: dateValue(payload.transaction_date || context.today, "Tanggal pembayaran"),
    source_account_id: accountId,
    category_id: String(payload.category_id || ""),
    envelope_period_id: String(payload.envelope_period_id || ""),
    budget_id: String(payload.budget_id || ""),
    amount,
    description: purchaseText(payload, "description", `Wishlist: ${item.name}`, 250),
    merchant: purchaseText(payload, "merchant", "", 120),
    payment_method: purchaseText(payload, "payment_method", "", 40),
    overspend_reason: purchaseText(payload, "overspend_reason", "", 180),
    confirm_duplicate: payload.confirm_duplicate === true,
  };
};
export const purchaseWishlist = async (db, context) => {
  const current = await editable(db, context);
  if (current.status !== "active") throw appError("WISHLIST_NOT_ACTIVE", "Hanya keinginan aktif yang dapat dibeli.", 409);
  const accountId = String(context.payload?.source_account_id || "");
  await assertPaymentAccount(db, current, accountId);
  const amount = positiveInteger(context.payload?.amount, "Total pembayaran aktual");
  const transaction = await createTransactionInternal(db, context, transactionInputForWishlist(context, current, accountId, amount));
  const next = { ...current, status: "purchased", purchase_transaction_id: transaction.transaction_id, purchased_amount: amount, row_version: current.row_version + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute("UPDATE wishlist_items SET status='purchased',purchase_transaction_id=?,purchased_amount=?,row_version=?,updated_by=?,updated_at=? WHERE wishlist_item_id=? AND row_version=? AND status='active'", [transaction.transaction_id, amount, next.row_version, next.updated_by, next.updated_at, current.wishlist_item_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Keinginan berubah di perangkat lain. Pembelian tidak diproses.", 409);
  await appendAudit(db, context, { entityType: "wishlist_item", entityId: current.wishlist_item_id, previous: present(current), next: present(next) });
  return { item: present(next), transaction };
};

// A cancelled canonical payment cannot remain a permanently completed wishlist.
// Reopen explicitly after cancellation, preserving financial history in transactions/audit.
export const reopenWishlist = async (db, context) => {
  const current = await editable(db, context);
  if (current.status !== "purchased" || !current.purchase_transaction_id) throw appError("WISHLIST_NOT_PURCHASED", "Tidak ada pembelian yang perlu dibuka kembali.", 409);
  const transaction = await db.one("SELECT status FROM transactions WHERE transaction_id=?", [current.purchase_transaction_id]);
  if (transaction?.status !== "cancelled") throw appError("WISHLIST_PAYMENT_ACTIVE", "Pembayaran masih aktif. Batalkan melalui Transaksi jika memang diperlukan.", 409);
  const next = { ...current, status: "active", purchase_transaction_id: null, purchased_amount: 0, row_version: Number(current.row_version) + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute("UPDATE wishlist_items SET status='active',purchase_transaction_id=NULL,purchased_amount=0,row_version=?,updated_by=?,updated_at=? WHERE wishlist_item_id=? AND row_version=? AND status='purchased'", [next.row_version, next.updated_by, next.updated_at, current.wishlist_item_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Keinginan sudah berubah. Muat ulang.", 409);
  await appendAudit(db, context, { entityType: "wishlist_item", entityId: current.wishlist_item_id, previous: present(current), next: present(next) });
  return { item: present(next) };
};

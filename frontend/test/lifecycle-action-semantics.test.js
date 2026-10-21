import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("arsip portofolio memakai bahasa dan ikon arsip, tanpa menyentuh validasi RDN/posisi/Target", async () => {
  const page = await source("features/investments/InvestmentsPage.jsx");
  assert.match(page, /FiArchive aria-hidden="true" \/> Arsipkan/);
  assert.match(page, /title="Arsipkan portofolio\?"/);
  assert.match(page, /Histori transaksi tidak dihapus/);
  assert.match(page, /archiveInvestmentPortfolio/);
  assert.match(page, /restoreInvestmentPortfolio/);
  assert.doesNotMatch(page, /FiTrash2|window\.confirm/);
});

test("Shopping membedakan hapus barang, sembunyikan pembelian, dan arsip daftar", async () => {
  const page = await source("features/shopping/ShoppingPage.jsx");
  assert.match(page, /<FiTrash2 aria-hidden="true" \/>Hapus/);
  assert.match(page, /onRemove\(item\)/);
  assert.match(page, /setUndoRemove/);
  assert.match(page, /is_hidden \? <FiEye aria-hidden="true" \/> : <FiEyeOff aria-hidden="true" \/>/);
  assert.match(page, /\? "Tampilkan lagi" : "Sembunyikan"/);
  assert.match(page, /setItemVisibility\("shopping_item", item\.shopping_item_id, hidden\)/);
  assert.match(page, /<FiArchive aria-hidden="true" \/> Arsipkan daftar/);
  assert.match(page, /Daftar yang diarsipkan/);
  assert.match(page, /archiveShoppingList/);
  assert.match(page, /restoreShoppingList/);
  assert.doesNotMatch(page, /Hapus daftar dari tampilan|Hapus dari tampilan|window\.confirm/);
});

test("konfirmasi Shopping memakai primitive native, menahan loading dan status hasil tak pasti", async () => {
  const page = await source("features/shopping/ShoppingPage.jsx");
  assert.match(page, /<ConfirmationModal open=\{archiveDialog\}/);
  assert.match(page, /title="Arsipkan daftar belanja\?"/);
  assert.match(page, /confirmLabel="Arsipkan daftar" busy=\{Boolean\(busyId\)\}/);
  assert.match(page, /retryOnly=\{archiveDialog && isShoppingOutcomeUnknownError\(mutationError\)\}/);
  assert.match(page, /if \(!data\?\.list \|\| !online \|\| !canManage \|\| busyId\) return/);
});

test("Wishlist mengganti delete visual menjadi arsip dan visibilitas tanpa mutasi pembelian", async () => {
  const page = await source("features/wishlist/WishlistPage.jsx");
  assert.match(page, /<FiArchive aria-hidden="true" \/> Arsipkan/);
  assert.match(page, /is_hidden \? <FiEye aria-hidden="true" \/> : <FiEyeOff aria-hidden="true" \/>/);
  assert.match(page, /Tampilkan yang disembunyikan/);
  assert.match(page, /setItemVisibility\("wishlist_item", item\.wishlist_item_id, hidden\)/);
  assert.match(page, /changeWishlistState\(\{ wishlist_item_id: item\.wishlist_item_id, row_version: item\.row_version, status \}\)/);
  assert.match(page, /<WishlistArchiveConfirmation target=\{archiveTarget\}/);
  assert.match(page, /<ConfirmationModal open=\{Boolean\(target\)\}/);
  assert.match(page, /const retryOnly = Boolean\(target && attempted && mutation\.outcomeUnknown\);/);
  assert.doesNotMatch(page, /FiTrash2|Hapus dari tampilan|window\.confirm/);
});

test("batalkan transaksi atau pengingat tidak menggunakan ikon delete", async () => {
  const [transactions, reminders] = await Promise.all([
    source("features/transactions/components/TransactionActions.jsx"),
    source("features/reminders/ManualReminderModal.jsx"),
  ]);
  assert.match(transactions, /FiXCircle aria-hidden="true" \/>Batalkan transaksi/);
  assert.match(transactions, /icon=\{FiXCircle\} onClick=\{\(\) => openCancel\(item\)\}>Batalkan transaksi/);
  assert.match(reminders, /variant="secondary" icon=\{FiBellOff\}/);
  assert.match(reminders, /Batalkan pengingat/);
  assert.doesNotMatch(transactions + reminders, /FiTrash2/);
});

test("baris editing langsung mempunyai accessible name yang menjelaskan aksi dan item", async () => {
  const [shopping, budget, allocation] = await Promise.all([
    source("features/shopping/ShoppingPage.jsx"),
    source("features/budgets/BudgetBatchEditor.jsx"),
    source("features/allocations/AllocationDialogLayer.jsx"),
  ]);
  assert.match(shopping, /className=\{styles\.itemBody\}[\s\S]*?aria-label=\{`Edit \$\{item\.name\}`\}/);
  assert.match(budget, /className=\{styles\.compactMain\}[\s\S]*?aria-label=\{`Edit \$\{row\.name/);
  assert.match(allocation, /className=\{needStyles\.compactMain\}[\s\S]*?aria-label=\{`Edit \$\{need\.name/);
});

test("tombol Info tetap mempertahankan pola modal, aria state dan tap target", async () => {
  const [button, css] = await Promise.all([
    source("components/common/PageInfoButton.jsx"),
    readFile(new URL("../src/components/common/PageInfoButton.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(button, /aria-label=\{accessibleLabel\}/);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(button, /aria-expanded=\{open\}/);
  assert.match(button, /<Modal open=\{open\}/);
  assert.match(css, /min-height: var\(--mobile-control-height, 44px\)/);
});

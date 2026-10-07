import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("Tambah anggota tidak diam-diam mengubah anggota aktif existing dan Administrator baru perlu review", () => {
  const source = read("features/settings/MembersSettingsPage.jsx");
  assert.match(source, /matchedMember\?\.status === "active"/);
  assert.match(source, /sudah menjadi anggota aktif/);
  assert.match(source, /memberForm\.role === "owner" && \(!editingMember \|\| editingMember\.role !== "owner"\)/);
  assert.match(source, /requiresRoleReview && !roleAcknowledged/);
});

test("Shopping editor menjaga draft, stale suggestion, retry unknown, dan copy total aktual", () => {
  const source = read("features/shopping/ShoppingItemEditor.jsx");
  assert.match(source, /useUnsavedChangesGuard/);
  assert.match(source, /suggestionRequestRef/);
  assert.match(source, /state\.status === "unknown"/);
  assert.match(source, /Coba lagi data yang sama/);
  assert.match(source, /Total harga aktual/);
});

test("Undo Shopping mengembalikan status exact sebelumnya dan timer berhenti saat restore", () => {
  const source = read("features/shopping/ShoppingPage.jsx");
  assert.match(source, /busyId === undoRemove\.shopping_item_id/);
  assert.match(source, /\["pending", "in_cart"\]\.includes\(item\.status\) \? item\.status : "pending"/);
});

test("Target menolak tanggal masa lalu dan lifecycle memakai unknown-outcome retry", () => {
  const page = read("features/goals/GoalsPage.jsx");
  const dialogs = read("features/goals/components/GoalDialogs.jsx");
  assert.match(page, /target_date < todayInJakarta\(\)/);
  assert.match(page, /isGoalsOutcomeUnknownError/);
  assert.match(dialogs, /min=\{todayInJakarta\(\)\}/);
  assert.match(dialogs, /retryOnly=\{statusState\.status === "unknown"\}/);
  assert.match(dialogs, /retryOnly=\{archiveState\.status === "unknown"\}/);
});

test("Rekonsiliasi dan lifecycle transaksi mengunci retry ketika outcome belum pasti", () => {
  const recon = read("features/reconciliations/ReconciliationsPage.jsx");
  const reconForm = read("features/reconciliations/components/ReconciliationForm.jsx");
  const tx = read("features/transactions/TransactionsPage.jsx");
  const txDialogs = read("features/transactions/components/TransactionLifecycleModals.jsx");
  assert.match(recon, /isReconciliationOutcomeUnknownError/);
  assert.match(reconForm, /submitState\.status === "unknown"/);
  assert.match(tx, /isTransactionsOutcomeUnknownError/);
  assert.match(txDialogs, /retryOnly=\{cancelState\.status === "unknown"\}/);
  assert.match(txDialogs, /retryOnly=\{restoreState\.status === "unknown"\}/);
});


test("Rekening dan kategori tidak membuang intent saat outcome belum pasti", () => {
  const accounts = read("features/accounts/AccountsPage.jsx");
  const accountDialogs = read("features/accounts/components/AccountEditorDialogs.jsx");
  const categories = read("features/categories/CategoriesPage.jsx");
  const categoryDialogs = read("features/categories/CategoryDialogs.jsx");
  assert.match(accounts, /isAccountsOutcomeUnknownError/);
  assert.match(accountDialogs, /dialogState\.status === "unknown"/);
  assert.match(categoryDialogs, /retryOnly/);
  assert.match(categories, /isCategoriesOutcomeUnknownError/);
});


test("Anggota dan Jadwal rutin mempertahankan exact-retry saat hasil mutation tidak pasti", () => {
  const members = read("features/settings/MembersSettingsPage.jsx");
  const recurring = read("features/recurring/useRecurringActions.js");
  const dialogs = read("features/recurring/RecurringDialogs.jsx");
  assert.match(members, /result\?\.status === "unknown"/);
  assert.match(members, /retryOnly=\{actionState\.status === "unknown"\}/);
  assert.match(recurring, /isRecurringOutcomeUnknownError/);
  assert.match(dialogs, /retryOnly=\{p\.editState\.status === "unknown"\}/);
  assert.match(dialogs, /retryOnly=\{p\.reverseState\.status === "unknown"\}/);
});

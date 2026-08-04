import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("kategori memiliki route, API facade, state, icon picker, dan aksi owner yang terpisah dari rekening", async () => {
  const [app, navigation, page, styles, presentation, api, accountPage] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/config/navigation.js"),
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/categories/CategoriesPage.module.css"),
    read("src/features/transactions/transactionPresentation.js"),
    read("src/features/categories/categories.api.js"),
    read("src/features/accounts/AccountsPage.jsx"),
  ]);

  assert.match(app, /path="kategori"/);
  assert.match(navigation, /to: "\/kategori", label: "Kategori"[\s\S]*icon: FiTag/);
  assert.match(page, /title="Kategori transaksi"/);
  assert.match(page, /aria-label="Tambah kategori"/);
  assert.match(page, /useApiResource\("categories\.list"\)/);
  assert.match(page, /create-category-form/);
  assert.match(page, /edit-category-form/);
  assert.match(page, /CategoryIconPicker/);
  assert.match(page, /icon: editCategory\.icon/);
  assert.match(page, /role="radiogroup"/);
  assert.match(page, /role="radio"/);
  assert.match(page, /Cari icon: nikah, rumah, tagihan/);
  assert.match(styles, /\.iconGrid/);
  assert.match(styles, /\.iconOption\.isSelected/);
  assert.match(presentation, /key: "wedding_ring"[\s\S]*label: "Cincin"/);
  assert.match(presentation, /key: "savings"[\s\S]*label: "Tabungan"/);
  assert.match(presentation, /WeddingRingIcon/);
  assert.match(presentation, /SavingsIcon/);
  assert.match(page, /ownerMode && category\.status === "active"/);
  assert.match(page, /Promise\.allSettled\(\[resource\.reload\(\), refreshAll\(\)\]\)/);
  assert.doesNotMatch(page, /categoriesResult\.status === "rejected"/);
  assert.match(api, /categories\.create/);
  assert.match(api, /categories\.update/);
  assert.match(api, /categories\.archive/);
  assert.match(page, /<option value="refund">Pengembalian dana<\/option>/);
  assert.doesNotMatch(page, /accounts\.list|AccountFinancialCard/);
  assert.doesNotMatch(accountPage, /categories\.list|create-category-form|Kategori transaksi/);
});

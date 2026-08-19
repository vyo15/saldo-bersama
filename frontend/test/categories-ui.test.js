import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("kategori memiliki route, API facade, state, icon picker, dan aksi owner yang terpisah dari rekening", async () => {
  const [app, navigation, page, styles, presentation, api, accountPage, categoryPresentation] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/config/navigation.js"),
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/categories/CategoriesPage.module.css"),
    read("src/shared/presentation/transaction.js"),
    read("src/features/categories/categories.api.js"),
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/shared/presentation/category.js"),
  ]);

  assert.match(app, /path="kategori"/);
  assert.match(navigation, /to: "\/kategori", label: "Kategori"[\s\S]*icon: FiTag/);
  assert.match(page, /title="Kategori"/);
  assert.match(page, /aria-label="Tambah kategori"/);
  assert.match(page, /useApiResource\("categories\.list"\)/);
  assert.match(page, /create-category-form/);
  assert.match(page, /edit-category-form/);
  assert.match(page, /CategoryIconPicker/);
  assert.match(page, /icon: editCategory\.icon/);
  assert.match(page, /role="radiogroup"/);
  assert.match(page, /role="radio"/);
  assert.match(page, /Cari ikon: nikah, rumah, tagihan/);
  assert.match(styles, /\.iconGrid/);
  assert.match(styles, /\.iconOption\.isSelected/);
  assert.match(presentation, /key: "wedding_ring"[\s\S]*label: "Cincin"/);
  assert.match(presentation, /key: "savings"[\s\S]*label: "Tabungan"/);
  assert.match(presentation, /WeddingRingIcon/);
  assert.match(presentation, /SavingsIcon/);
  assert.match(page, /ownerMode && active/);
  assert.match(page, /const archiveEnabled = ownerMode && statusFilter !== "active"/);
  assert.match(page, /useApiResource\("archive\.list", \{\}, \{ enabled: archiveEnabled \}\)/);
  assert.match(page, /placeholder="Cari kategori"/);
  assert.match(page, /aria-label="Filter status kategori"/);
  assert.match(page, /<option value="archived">Arsip<\/option>/);
  assert.match(page, /label: "Pengeluaran", icon: FiTrendingDown/);
  assert.match(page, /label: "Pemasukan", icon: FiTrendingUp/);
  assert.match(page, /FiMoreHorizontal/);
  assert.match(page, /createPortal/);
  assert.match(page, /document\.body/);
  assert.match(page, /Kelola data/);
  assert.match(page, /active \? null : <span className=\{styles\.categoryStatus\}/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.key === "ArrowDown"/);
  assert.match(page, /event\.key === "ArrowUp"/);
  assert.match(page, /role="menuitem"/);
  assert.match(styles, /\.categoryList[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.categoryMenu[\s\S]*position: fixed[\s\S]*mobile-navigation-height/);
  assert.doesNotMatch(styles, /\.categoryStatusActive/);
  assert.match(page, /Promise\.allSettled\(\[resource\.reload\(\), refreshAll\(\)\]\)/);
  assert.doesNotMatch(page, /categoriesResult\.status === "rejected"/);
  assert.match(api, /categories\.create/);
  assert.match(api, /categories\.update/);
  assert.match(api, /categories\.archive/);
  assert.match(categoryPresentation, /value: CATEGORY_TYPES\.EXPENSE, label: "Uang keluar"/);
  assert.match(categoryPresentation, /value: CATEGORY_TYPES\.INCOME, label: "Uang masuk"/);
  assert.match(categoryPresentation, /value: CATEGORY_TYPES\.REFUND, label: "Pengembalian dana"/);
  assert.doesNotMatch(page, /Transfer antar rekening tidak memakai kategori/);
  assert.doesNotMatch(page, /gunakan Transfer atau Target/);
  assert.match(styles, /\.iconGroups[\s\S]*flex-wrap: wrap/);
  assert.doesNotMatch(styles, /\.iconGroups[\s\S]{0,180}overflow-x:\s*auto/);
  assert.doesNotMatch(categoryPresentation.match(/EXPENSE_NATURE_OPTIONS[\s\S]*?\]\);/)?.[0] || "", /value: "savings"/);
  assert.match(categoryPresentation, /value: CATEGORY_NATURES\.UNEXPECTED, label: "Tidak terduga"/);
  assert.match(categoryPresentation, /value: CATEGORY_NATURES\.DISCRETIONARY, label: "Gaya hidup"/);
  assert.match(categoryPresentation, /value: CATEGORY_NATURES\.EMERGENCY, label: "Darurat"/);
  assert.doesNotMatch(categoryPresentation, /label: "Kebutuhan tidak terduga"|label: "Keinginan dan gaya hidup"|label: "Kondisi darurat"/);
  assert.match(page, /<option value=\{item\.value\} key=\{item\.value\}>\{item\.label\}<\/option>/);
  assert.doesNotMatch(page, /accounts\.list|AccountFinancialCard/);
  assert.doesNotMatch(accountPage, /categories\.list|create-category-form|Kategori transaksi/);
});

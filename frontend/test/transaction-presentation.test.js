import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("transaksi memakai icon kategori terkontrol dengan fallback jenis transaksi", async () => {
  const [presentation, transactions, dashboard, mobileDashboard, desktopDashboard] = await Promise.all([
    read("src/features/transactions/transactionPresentation.js"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
  ]);

  assert.match(presentation, /CATEGORY_ICON_OPTIONS/);
  assert.match(presentation, /DEFAULT_CATEGORY_ICON_BY_TYPE/);
  assert.match(presentation, /transactionCategoryIcon/);
  assert.match(presentation, /type === "transfer" \|\| type === "adjustment"/);
  assert.doesNotMatch(presentation, /dangerouslySetInnerHTML|eval\(|new Function/);
  assert.match(transactions, /transactionCategoryIcon\(categoryLookup\[item\.category_id\], item\.transaction_type\)/);
  assert.match(transactions, /transaction-table-primary/);
  assert.match(dashboard, /\[item\.category_id, item\]/);
  assert.match(mobileDashboard, /transactionCategoryIcon\(category, item\.transaction_type\)/);
  assert.match(desktopDashboard, /transactionCategoryIcon\(category, item\.transaction_type\)/);
});

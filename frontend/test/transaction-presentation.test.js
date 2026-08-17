import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("transaksi memakai icon kategori terkontrol dengan fallback jenis transaksi", async () => {
  const [presentation, transactions, dashboard, mobileDashboard, desktopDashboard] = await Promise.all([
    read("src/shared/presentation/transaction.js"),
    Promise.all([
      read("src/features/transactions/TransactionsPage.jsx"),
      read("src/features/transactions/components/MobileTransactionHistory.jsx"),
    ]).then((parts) => parts.join("\n")),
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
  assert.match(transactions, /const PAGE_SIZE = 50/);
  assert.match(transactions, /MOBILE_TRANSACTIONS_QUERY = "\(max-width: 820px\)"/);
  assert.match(transactions, /MobileTransactionList/);
  assert.match(transactions, /mobileLayout[\s\S]*MobileTransactionOverview/);
  assert.match(transactions, /transactionCategoryIcon\(categoryLookup\[item\.category_id\], item\.transaction_type\)/);
  assert.match(dashboard, /\[item\.category_id, item\]/);
  assert.match(mobileDashboard, /transactionCategoryIcon\(category, item\.transaction_type\)/);
  assert.match(desktopDashboard, /transactionCategoryIcon\(category, item\.transaction_type\)/);
});

test("presentasi history mobile transaksi tetap lazy agar route utama punya headroom bundle", async () => {
  const page = await read("src/features/transactions/TransactionsPage.jsx");
  assert.match(page, /const MobileTransactionHistory = lazy\(\(\) => import\("\.\/components\/MobileTransactionHistory\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{null\}>[\s\S]*<MobileTransactionHistory/);
  assert.doesNotMatch(page, /import\s*\{[^}]*MobileTransactionOverview[^}]*\}\s*from\s*"\.\/components\/MobileTransactionHistory\.jsx"/s);
});

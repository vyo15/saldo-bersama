import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transactionDisplayTitle, transactionListMetadata } from "../src/shared/presentation/transaction.js";

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
  assert.match(transactions, /styles\.tablePrimary/);
  assert.match(transactions, /const PAGE_SIZE = 50/);
  assert.match(transactions, /useMediaQuery\(APP_MEDIA\.mobile\)/);
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


test("judul dan metadata transaksi memakai fallback informatif tanpa memotong identitas", () => {
  const category = { category_id: "salary", name: "Gajian" };
  const item = { transaction_type: "income", description: "", merchant: "Rejeki Anak Soleh" };
  assert.equal(transactionDisplayTitle(item, category), "Gajian");
  assert.deepEqual(transactionListMetadata({
    item,
    category,
    account: "BCA",
    creator: "Fuji Astuti Dwijayanti",
  }), ["Rejeki Anak Soleh", "BCA", "Fuji Astuti Dwijayanti"]);

  assert.equal(transactionDisplayTitle({ transaction_type: "transfer" }), "Transfer");
  assert.deepEqual(transactionListMetadata({
    item: { transaction_type: "transfer" },
    account: "BCA → Tunai",
    creator: "Fuji Astuti Dwijayanti",
  }), ["BCA → Tunai", "Fuji Astuti Dwijayanti"]);
});

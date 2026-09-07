import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const srcRoot = new URL("../src/", import.meta.url);
const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const portablePath = (value) => String(value || "").replaceAll("\\", "/");

const sourceFiles = async (dirUrl = srcRoot) => {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) return sourceFiles(entryUrl);
    return /\.(?:js|jsx)$/.test(entry.name) ? [entryUrl] : [];
  }));
  return nested.flat();
};


test("path source untuk regression semantic icon stabil lintas Windows dan POSIX", () => {
  assert.equal(portablePath("src\\features\\transactions\\TransactionFields.jsx"), "src/features/transactions/TransactionFields.jsx");
  assert.equal(portablePath("src/features/transactions/TransactionFields.jsx"), "src/features/transactions/TransactionFields.jsx");
});

test("taxonomy ikon finansial memakai registry semantic canonical", async () => {
  const [icons, registry, transaction, categories, navigation] = await Promise.all([
    read("src/components/common/FinanceChoiceIcons.jsx"),
    read("src/components/common/financeChoiceIconRegistry.js"),
    read("src/shared/presentation/transaction.js"),
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/config/navigation.js"),
  ]);

  for (const name of ["AccountIcon", "BalanceIcon", "MoneyInIcon", "MoneyOutIcon", "TransferIcon", "FoodIcon", "TransportIcon"]) {
    assert.match(icons, new RegExp(`export const ${name}`));
  }
  for (const name of ["BankIcon", "CashIcon", "EwalletIcon", "SavingsIcon", "EmergencyFundIcon", "SinkingFundIcon", "InvestmentIcon", "OtherIcon"]) {
    assert.match(registry, new RegExp(name));
  }
  assert.match(registry, /export const accountTypeIcon/);
  assert.match(transaction, /\[TRANSACTION_TYPES\.EXPENSE\]: MoneyOutIcon/);
  assert.match(transaction, /\[TRANSACTION_TYPES\.INCOME\]: MoneyInIcon/);
  assert.match(transaction, /\[TRANSACTION_TYPES\.TRANSFER\]: TransferIcon/);
  assert.match(categories, /expense: \{ label: "Pengeluaran", icon: MoneyOutIcon/);
  assert.match(categories, /income: \{ label: "Pemasukan", icon: MoneyInIcon/);
  assert.match(navigation, /to: "\/rekening"[\s\S]*icon: AccountIcon/);
  assert.match(navigation, /to: "\/investasi"[\s\S]*icon: InvestmentIcon/);
});

test("source UI tidak memakai simbol dolar dan CreditCard dibatasi ke metode pembayaran", async () => {
  const files = await sourceFiles();
  const occurrences = [];
  for (const fileUrl of files) {
    const source = await readFile(fileUrl, "utf8");
    const relative = portablePath(path.relative(new URL("../", import.meta.url).pathname, fileUrl.pathname));
    assert.doesNotMatch(source, /\bFiDollarSign\b/, `${relative} tidak boleh memakai FiDollarSign`);
    if (/\bFiCreditCard\b/.test(source)) occurrences.push({ relative, source });
  }

  assert.deepEqual(occurrences.map((item) => item.relative), ["src/features/transactions/components/TransactionFields.jsx"]);
  assert.match(occurrences[0].source, /Metode pembayaran/);
  assert.match(occurrences[0].source, /FieldControl icon=\{FiCreditCard\}/);
  assert.doesNotMatch(occurrences[0].source, /id="source-account"[\s\S]{0,100}FiCreditCard/);
  assert.doesNotMatch(occurrences[0].source, /id="destination-account"[\s\S]{0,100}FiCreditCard/);
});

test("trend icon hanya mewakili arah data sedangkan aksi dan status memakai semantic action", async () => {
  const [overview, dashboard, holdingDetail, budgetStatus] = await Promise.all([
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
    read("src/features/budgets/components/BudgetStatusPill.jsx"),
  ]);

  assert.match(overview, /if \(amount > 0\) return FiTrendingUp;/);
  assert.match(overview, /if \(amount < 0\) return FiTrendingDown;/);
  assert.match(overview, /return FiMinus;/);
  assert.match(overview, /SheetAction icon=\{FiEdit3\} title="Perbarui nilai"/);
  assert.match(dashboard, /NetCashFlowIcon = netCashFlow > 0 \? FiTrendingUp : netCashFlow < 0 \? FiTrendingDown : FiMinus/);
  assert.doesNotMatch(holdingDetail, /FiTrendingUp|FiTrendingDown|FiDollarSign/);
  assert.match(budgetStatus, /warning: FiAlertTriangle/);
});

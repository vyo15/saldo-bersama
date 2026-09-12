import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("UI canonical memakai model satu pengeluaran keluarga tanpa cost-sharing baru", async () => {
  const [transactionFields, mobileTransactionFields, recurringDialogs, recurringActions, reports] = await Promise.all([
    read("features/transactions/components/TransactionFields.jsx"),
    read("features/transactions/MobileTransactionFields.jsx"),
    read("features/recurring/RecurringDialogs.jsx"),
    read("features/recurring/useRecurringActions.js"),
    read("features/reports/ReportsPage.jsx"),
  ]);
  assert.doesNotMatch(transactionFields, /CostShareField|Pembagian beban biaya/);
  assert.doesNotMatch(mobileTransactionFields, /CostShareField|Pembagian beban biaya/);
  assert.doesNotMatch(recurringDialogs, /CostShareField|Pembagian beban biaya/);
  assert.match(recurringActions, /cost_share_mode:\s*"unspecified"/);
  assert.match(recurringActions, /cost_share_percentages:\s*\[\]/);
  assert.doesNotMatch(reports, /<h[23]>Pembagian beban biaya<\/h[23]>/);
});

test("rekening dan beranda menjelaskan transparansi keluarga serta pencatat", async () => {
  const [accountDialogs, accountCard, dashboard, mobileDashboard, desktopDashboard] = await Promise.all([
    read("features/accounts/components/AccountEditorDialogs.jsx"),
    read("features/accounts/components/AccountFinancialCard.jsx"),
    read("features/dashboard/DashboardPage.jsx"),
    read("features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("features/dashboard/components/DesktopFinanceDashboard.jsx"),
  ]);
  assert.match(accountDialogs, /Pemegang rekening/);
  assert.match(accountDialogs, /seluruh anggota tetap dapat melihatnya/);
  assert.match(accountCard, /Semua rekening transparan untuk keluarga/);
  assert.match(dashboard, /transactionCreatorLabel/);
  assert.match(mobileDashboard, /dicatat \{transactionCreatorLabel\(item\)\}/);
  assert.match(desktopDashboard, /dicatat \{creatorLabel\}/);
  assert.match(desktopDashboard, /transactionCreatorLabel=\{model\.transactionCreatorLabel\}/);
});

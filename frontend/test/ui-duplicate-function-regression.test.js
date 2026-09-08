import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("UI canonical entry points tidak menduplikasi fungsi yang sama", async () => {
  const [
    reconciliation,
    investmentsPage,
    investmentOverview,
    portfolioStyles,
    allocationDetail,
    mobileAccounts,
    accountStyles,
    dashboard,
    settingsNavigation,
    settingsLayout,
  ] = await Promise.all([
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/PortfolioCard.module.css"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/accounts/components/MobileAccountsExperience.jsx"),
    read("src/features/accounts/components/MobileAccountsExperience.module.css"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("src/features/settings/settingsNavigation.js"),
    read("src/features/settings/SettingsLayout.jsx"),
  ]);

  assert.match(reconciliation, /account\.account_type !== "investment"/);

  assert.match(investmentOverview, /aria-label=\{`Kelola investasi \$\{portfolio\.name\}`\}/);
  assert.match(investmentOverview, /title="Kelola investasi"/);
  assert.doesNotMatch(investmentOverview, /desktopMaintenanceAction|>Lainnya<\/span>/);
  assert.match(portfolioStyles, /\.quickActions\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);

  assert.match(investmentsPage, /const canShowInstrumentSetupAction =/);
  assert.match(investmentsPage, /aria-label="Tambah aset">Tambah aset<\/Button>/);

  assert.match(allocationDetail, /onAdjustAllocation\(item, summary\.gap\)/);
  assert.match(allocationDetail, /showStandardAdjustAction\(canAdjustAllocation, item, linkedBudgets\)/);
  assert.match(allocationDetail, /showGlobalExpenseAction\(state\.canRecordExpense, linkedBudgets\)/);

  assert.match(mobileAccounts, /<span>Riwayat<\/span>/);
  assert.match(mobileAccounts, /<MobileAccountTransferAction/);
  assert.doesNotMatch(mobileAccounts, /<span>Kelola<\/span>|<span>Detail<\/span>/);
  assert.doesNotMatch(mobileAccounts, /<span>Tersedia<\/span>/);
  assert.doesNotMatch(mobileAccounts, /<span>Saldo RDN<\/span><\/div>/);
  assert.match(accountStyles, /\.mobileQuickActions\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);

  for (const [path, label] of [
    ["/rekening", "Rekening"],
    ["/target", "Target"],
    ["/kategori", "Kategori"],
    ["/rekonsiliasi", "Cocokkan Saldo"],
  ]) {
    assert.match(dashboard, new RegExp(`to: "${path.replaceAll("/", "\\/")}", label: "${label}"`));
  }
  assert.doesNotMatch(dashboard, /to: "\/perencanaan\/kantong", label: "Alokasi Dana"/);
  assert.doesNotMatch(dashboard, /to: "\/perencanaan\/jadwal", label: "Jadwal Rutin"/);

  assert.match(settingsNavigation, /label: "Notifikasi perangkat"/);
  assert.match(settingsLayout, /title: "Notifikasi perangkat"/);
});

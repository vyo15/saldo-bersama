import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Target funding memakai validasi inline dan tidak melempar expected validation error", async () => {
  const source = await read("src/features/goals/components/GoalFundingModal.jsx");
  assert.doesNotMatch(source, /throw new Error/);
  assert.match(source, /setFieldErrors\(nextErrors\)/);
  assert.match(source, /error=\{fieldErrors\.sourceAccountId \|\| ""\}/);
  assert.match(source, /error=\{fieldErrors\.amount \|\| ""\}/);
  assert.match(source, /Maksimal \$\{formatRupiah\(goal\.remaining_amount \|\| 0\)\}/);
  assert.match(source, /aria-invalid=\{Boolean\(fieldErrors\.quantity\)/);
  assert.match(source, /error=\{fieldErrors\.cashAmount \|\| ""\}/);
});

test("mental model investasi user-facing memakai aset dan sumber investasi, bukan broker/portfolio", async () => {
  const [menu, funding, dialogs, investments] = await Promise.all([
    read("src/components/navigation/QuickRecordMenu.jsx"),
    read("src/features/goals/components/GoalFundingModal.jsx"),
    read("src/features/goals/components/GoalDialogs.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
  ]);
  const userFacing = [menu, funding, dialogs, investments].join("\n");
  assert.match(userFacing, /Sumber investasi/);
  assert.match(funding, /Aset yang sudah dimiliki/);
  assert.doesNotMatch(userFacing, /Pilih portofolio|Pilih portfolio|Portfolio investasi|Broker /);
});

test("privacy nominal memakai satu session contract dan semantic switch", async () => {
  const [provider, appProviders, dashboard, mobileDashboard, desktopSummary, accounts] = await Promise.all([
    read("src/app/PrivacyContext.jsx"),
    read("src/app/AppProviders.jsx"),
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("src/features/dashboard/components/DesktopDashboardSummary.jsx"),
    read("src/features/accounts/components/MobileAccountsExperience.jsx"),
  ]);
  assert.match(provider, /sessionStorage/);
  assert.match(provider, /privacyEnabled/);
  assert.match(appProviders, /PrivacyProvider/);
  assert.match(dashboard, /usePrivacy/);
  assert.match(accounts, /usePrivacy/);
  assert.match(accounts, /Total saldo rekening<\/span><strong><PrivateMoney hidden=\{hidden\} value=\{totalAccountBalance\}/);
  for (const source of [mobileDashboard, desktopSummary, accounts]) {
    assert.match(source, /role="switch"/);
    assert.match(source, /aria-checked/);
  }
});

test("aktivitas dashboard desktop membuka detail transaksi melalui state yang dikonsumsi sekali", async () => {
  const [dashboardRows, transactions] = await Promise.all([
    read("src/features/dashboard/components/DesktopDashboardTransactions.jsx"),
    read("src/features/transactions/TransactionsPage.jsx"),
  ]);
  assert.match(dashboardRows, /to="\/transaksi"/);
  assert.match(dashboardRows, /transactionId: item\.transaction_id/);
  assert.match(transactions, /initialFilters\(location\.state \|\| attention\)/);
  assert.match(transactions, /location\.state\?\.transactionId/);
  assert.match(transactions, /setDetailTransaction\(target\)/);
  assert.match(transactions, /navigate\(location\.pathname, \{ replace: true, state: null \}\)/);
});

test("Notification Center memakai dua intent jelas dan alternatif keyboard untuk swipe", async () => {
  const [page, row] = await Promise.all([
    read("src/features/notifications/NotificationsPage.jsx"),
    read("src/features/notifications/NotificationRow.jsx"),
  ]);
  assert.match(page, /Perlu tindakan/);
  assert.match(page, /Pengingat/);
  assert.doesNotMatch(page, /filter === "all"|splitGroups/);
  assert.match(page, /Semua aman/);
  assert.match(page, /Belum ada pengingat baru/);
  assert.match(row, /aria-keyshortcuts="Delete"/);
  assert.match(row, /Tekan Delete untuk membersihkan/);
});

import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

test("dashboard and ledger share compact transaction presentation without merging mutations", async () => {
  const [shared, dashboard, ledger] = await Promise.all([
    read("components/common/CompactTransactionDetail.jsx"),
    read("features/dashboard/components/MobileTransactionDetail.jsx"),
    read("features/transactions/components/TransactionDetailModal.jsx"),
  ]);
  assert.match(shared, /<StatusBadge status=\{status\}/);
  assert.match(shared, /<details className=\{styles\.more\}>/);
  assert.match(shared, /technical\.map/);
  assert.match(dashboard, /<CompactTransactionDetail/);
  assert.match(ledger, /<CompactTransactionDetail/);
  assert.match(dashboard, /<SensitiveMoney visible=\{balanceVisible\}/);
  assert.match(ledger, /<TransactionActions item=\{target\}/);
  assert.doesNotMatch(dashboard, /status-badge--active|\`ID \$\{transaction\.transaction_id\}\`/);
});

test("compact disclosure preserves technical data without forcing mobile 1-column rows", async () => {
  const [sharedCss, dashboardCss, accountJsx, accountCss] = await Promise.all([
    read("components/common/CompactTransactionDetail.module.css"),
    read("features/dashboard/DashboardPage.module.css"),
    read("features/accounts/components/AccountFinancialCard.jsx"),
    read("features/accounts/components/AccountFinancialCard.module.css"),
  ]);
  assert.match(sharedCss, /grid-template-columns: minmax/);
  assert.match(sharedCss, /min-height: var\(--mobile-control-height/);
  assert.doesNotMatch(dashboardCss, /mobile-dashboard-transaction-detail dl > div/);
  assert.match(accountJsx, /Informasi rekening lainnya/);
  assert.match(accountJsx, /MobileAccountNumber/);
  assert.match(accountJsx, /<AccountBalanceSummary account=\{account\}/);
  assert.match(accountCss, /\.mobileBalanceStats \{[^}]*grid-template-columns: repeat\(2/);
  assert.doesNotMatch(accountCss, /min-height: 4\.35rem/);
});

test("need, audit, and sessions retain secondary facts through accessible native disclosure", async () => {
  const [need, audit, sessions] = await Promise.all([
    read("features/allocations/AllocationNeedRow.jsx"),
    read("features/settings/AuditPage.jsx"),
    read("features/settings/ActiveSessionsPage.jsx"),
  ]);
  assert.match(need, /Informasi kebutuhan lainnya/);
  assert.match(need, /completedAt/);
  assert.match(audit, /<details className=\{styles\.auditTechnicalSection\}>/);
  assert.match(audit, /ID objek/);
  assert.match(sessions, /<details className=\{styles\.sessionMore\}>/);
  assert.match(sessions, /Cabut sesi/);
});


test("chosen HTML layout retains account money hierarchy and need balance lead", async () => {
  const [account, need, needCss] = await Promise.all([
    read("features/accounts/components/AccountFinancialCard.jsx"),
    read("features/allocations/AllocationNeedRow.jsx"),
    read("features/allocations/AllocationDetail.module.css"),
  ]);
  assert.match(account, /mobileBalanceHero/);
  assert.match(account, /investment \? "Saldo RDN" : "Saldo rekening"/);
  assert.match(account, /available_balance \?\? account.balance/);
  assert.match(account, /allocated_remaining/);
  assert.match(account, /mobileCopyNumber/);
  assert.match(need, /allocation-need-detail__hero/);
  assert.match(need, /Sisa kebutuhan/);
  assert.match(needCss, /\.allocation-need-detail__facts[^]*?grid-template-columns: repeat\(2/);
});

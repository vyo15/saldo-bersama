import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildFinancialAlerts, reconciliationAlertStatement } from "../../api/_lib/services/reporting/dashboard/alerts.js";
import { investmentProjectedAverage } from "../../frontend/src/features/investments/investments.model.js";

const source = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("funding-gap alert muncul saat kebutuhan melebihi dana alokasi dan hilang setelah cukup", () => {
  const common = {
    period: "2026-09",
    historical: false,
    accounts: [], recurring: [], goals: [], unallocatedCount: 0, reconciliationRows: [],
    budgets: [{ budget_id: "b1", envelope_rule_id: "rule-1", amount: 1_000_000, status: "active" }],
  };
  const alerts = buildFinancialAlerts({
    ...common,
    envelopes: [{ envelope_period_id: "period-1", envelope_rule_id: "rule-1", name: "Rumah", status: "active", allocated_amount: 250_000, used_amount: 0, reserved_amount: 0 }],
  });
  const funding = alerts.find((item) => item.type === "unallocated_funds");
  assert.ok(funding);
  assert.equal(funding.fundingGap, 750_000);
  assert.equal(funding.envelopePeriodId, "period-1");

  const funded = buildFinancialAlerts({
    ...common,
    envelopes: [{ envelope_period_id: "period-1", envelope_rule_id: "rule-1", name: "Rumah", status: "active", allocated_amount: 1_000_000, used_amount: 0, reserved_amount: 0 }],
  });
  assert.equal(funded.some((item) => item.type === "unallocated_funds"), false);
});

test("rekonsiliasi eksplisit menjadi checkpoint dan rekening investasi tidak ikut reminder saldo umum", () => {
  const statement = reconciliationAlertStatement({ role: "owner", user_id: "owner" });
  assert.match(statement.sql, /account_type<>\s*'investment'/);
  const alerts = buildFinancialAlerts({
    period: "2026-09", historical: false,
    accounts: [{ account_id: "bank-1", name: "Bank", owner_scope: "shared", balance: 1_000_000 }],
    envelopes: [], recurring: [], goals: [], budgets: [], unallocatedCount: 0,
    reconciliationRows: [{ account_id: "bank-1", name: "Bank", reconciled_at: new Date().toISOString().slice(0, 10), difference: 250_000 }],
  });
  assert.equal(alerts.some((item) => item.type === "reconciliation_difference"), false);
});

test("preview pembelian investasi menghitung weighted average otomatis", () => {
  const result = investmentProjectedAverage(
    { instrument_id: "bbca", lots: "10", price_per_share: "1500", fee: "0" },
    [{ instrument_id: "bbca", ticker: "BBCA", asset_type: "stock", lot_size: 100 }],
    { holdings: [{ instrument_id: "bbca", shares: 1000, cost_basis: 1_350_000 }] },
  );
  assert.equal(result.currentAverage, 1350);
  assert.equal(result.nextAverage, 1425);
});

test("regression UI seluruh temuan penting tetap terpasang", () => {
  const recurring = source("frontend/src/features/recurring/RecurringDialogs.jsx");
  const budget = source("frontend/src/features/budgets/BudgetDialogLayer.jsx");
  const reports = source("frontend/src/features/reports/ReportsPage.jsx");
  const shell = source("frontend/src/layouts/AppShell.jsx");
  const notifications = source("frontend/src/shared/workflows/financialNotifications.js");
  const mobileAccounts = [
    source("frontend/src/features/accounts/components/MobileAccountsExperience.jsx"),
    source("frontend/src/features/accounts/components/useMobileAccountStack.js"),
  ].join("\n");
  const allocations = source("api/_lib/services/planning/envelopes.js");
  const attention = source("frontend/src/hooks/useDashboardAttentionState.js");
  const categories = source("frontend/src/features/categories/CategoriesPage.module.css");

  assert.match(recurring, /value=\{form\.due_day \?\? ""\}/);
  assert.match(budget, /value=\{form\.schedule_due_day \?\? ""\}/);
  assert.doesNotMatch(reports, /FinancialAlertList|ReportAlerts|MobileSummaryAlerts/);
  assert.doesNotMatch(shell, /<header className="topbar"/);
  assert.match(notifications, /notification-read-state/);
  assert.match(mobileAccounts, /cancelledForward/);
  assert.match(mobileAccounts, /Math\.abs\(progress\) >= 0\.16/);
  assert.match(allocations, /a\.action='envelopes\.adjustAllocation'/);
  assert.doesNotMatch(attention, /useRef|initialAttentionRef/);
  assert.match(categories, /categoryIconExpense/);
});

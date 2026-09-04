import assert from "node:assert/strict";
import test from "node:test";

import {
  RESET_BUSINESS_TABLES,
  RESET_OPERATIONAL_TABLES,
  mapPreservedCountRows,
  resetSummary,
} from "../api/_lib/services/maintenance/resetModel.js";
import {
  FULL_RESET_DOMAIN_TABLES,
  FULL_RESET_MASTER_TABLES,
  FULL_RESET_OPERATIONAL_TABLES,
  fullResetSummary,
} from "../api/_lib/services/maintenance/fullResetModel.js";

const rowCount = (count) => [{ count }];

const trialSummaryKeys = Object.freeze({
  investment_reconciliations: "investmentReconciliations",
  investment_valuations: "investmentValuations",
  investment_corrections: "investmentCorrections",
  investment_trades: "investmentTrades",
  goal_movements: "goalMovements",
  budgets: "budgets",
  envelope_movements: "allocationMovements",
  transactions: "transactions",
  recurring_occurrences: "recurringOccurrences",
  recurring_rules: "recurringRules",
  envelope_periods: "allocationPeriods",
  envelope_rules: "allocationRules",
  savings_goals: "goals",
  reconciliations: "reconciliations",
  period_closures: "periodClosures",
  transfer_requests: "transferRequests",
  master_data_requests: "masterDataRequests",
  notification_deliveries: "notificationDeliveries",
  manual_reminders: "manualReminders",
  notification_queue: "notificationQueue",
  integration_links: "integrationLinks",
  integration_outbox: "integrationOutbox",
  import_previews: "importPreviews",
});

const fullSummaryKeys = Object.freeze({
  investment_reconciliations: "investmentReconciliations",
  investment_valuations: "investmentValuations",
  investment_corrections: "investmentCorrections",
  investment_trades: "investmentTrades",
  goal_movements: "goalMovements",
  budgets: "budgets",
  envelope_movements: "allocationMovements",
  transactions: "transactions",
  recurring_occurrences: "recurringOccurrences",
  recurring_rules: "recurringRules",
  envelope_periods: "allocationPeriods",
  envelope_rules: "allocationRules",
  savings_goals: "goals",
  reconciliations: "reconciliations",
  period_closures: "periodClosures",
  investment_portfolios: "investmentPortfolios",
  investment_instruments: "investmentInstruments",
  categories: "categories",
  accounts: "accounts",
  transfer_requests: "transferRequests",
  master_data_requests: "masterDataRequests",
  notification_deliveries: "notificationDeliveries",
  manual_reminders: "manualReminders",
  notification_queue: "notificationQueue",
  integration_links: "integrationLinks",
  integration_outbox: "integrationOutbox",
  notification_preferences: "notificationPreferences",
  push_subscriptions: "pushSubscriptions",
  import_previews: "importPreviews",
  restore_previews: "restorePreviews",
});

const tableNames = (descriptors) => descriptors.map(({ table }) => table).sort();

test("setiap tabel destructive canonical memiliki field summary individual", () => {
  assert.deepEqual(
    tableNames([...RESET_BUSINESS_TABLES, ...RESET_OPERATIONAL_TABLES]),
    Object.keys(trialSummaryKeys).sort(),
  );
  assert.deepEqual(
    tableNames([...FULL_RESET_DOMAIN_TABLES, ...FULL_RESET_MASTER_TABLES, ...FULL_RESET_OPERATIONAL_TABLES]),
    Object.keys(fullSummaryKeys).sort(),
  );
});

test("trial reset mengekspos investasi, reminder, dan master investasi yang dipertahankan", () => {
  const summary = resetSummary({
    investment_reconciliations: 1,
    investment_valuations: 2,
    investment_corrections: 3,
    investment_trades: 4,
    transactions: 5,
    manual_reminders: 6,
  });
  assert.equal(summary.investmentReconciliations, 1);
  assert.equal(summary.investmentValuations, 2);
  assert.equal(summary.investmentCorrections, 3);
  assert.equal(summary.investmentTrades, 4);
  assert.equal(summary.manualReminders, 6);
  assert.equal(summary.businessRows, 15);
  assert.equal(summary.operationalRows, 6);
  assert.equal(summary.totalRows, 21);

  const preserved = mapPreservedCountRows([
    rowCount(10),
    rowCount(11),
    rowCount(12),
    rowCount(13),
    rowCount(14),
    rowCount(15),
    rowCount(16),
    rowCount(17),
    rowCount(18),
  ]);
  assert.equal(preserved.accounts, 10);
  assert.equal(preserved.categories, 11);
  assert.equal(preserved.investmentPortfolios, 12);
  assert.equal(preserved.investmentInstruments, 13);
  assert.equal(preserved.users, 14);
});

test("full reset mengekspos aktivitas dan master investasi serta reminder", () => {
  const summary = fullResetSummary({
    investment_reconciliations: 1,
    investment_valuations: 2,
    investment_corrections: 3,
    investment_trades: 4,
    investment_portfolios: 5,
    investment_instruments: 6,
    accounts: 7,
    categories: 8,
    manual_reminders: 9,
  });
  assert.equal(summary.investmentReconciliations, 1);
  assert.equal(summary.investmentValuations, 2);
  assert.equal(summary.investmentCorrections, 3);
  assert.equal(summary.investmentTrades, 4);
  assert.equal(summary.investmentPortfolios, 5);
  assert.equal(summary.investmentInstruments, 6);
  assert.equal(summary.manualReminders, 9);
  assert.equal(summary.domainRows, 10);
  assert.equal(summary.masterRows, 26);
  assert.equal(summary.operationalRows, 9);
  assert.equal(summary.totalRows, 45);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import {
  commitmentPaymentNavigation,
  quickRecordGoalNavigation,
  quickRecordInvestmentNavigation,
  quickRecordNavigation,
  quickRecordTransactionOptions,
} from "../src/shared/workflows/quickRecord.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("launcher Catat mendelegasikan setiap aktivitas ke flow canonical tanpa mutation baru", () => {
  assert.deepEqual(quickRecordTransactionOptions("expense"), { initialType: TRANSACTION_TYPES.EXPENSE, lockType: true, title: "Catat pengeluaran", description: "Catat uang yang baru saja keluar.", submitLabel: "Simpan pengeluaran" });
  assert.deepEqual(quickRecordTransactionOptions("income"), { initialType: TRANSACTION_TYPES.INCOME, lockType: true, title: "Catat pemasukan", description: "Catat uang yang baru saja masuk.", submitLabel: "Simpan pemasukan" });
  assert.deepEqual(quickRecordTransactionOptions("transfer"), { initialType: TRANSACTION_TYPES.TRANSFER, lockType: true, title: "Catat transfer", description: "Pindahkan dana antar rekening.", submitLabel: "Catat transfer" });
  assert.equal(quickRecordTransactionOptions("commitment"), null);

  assert.deepEqual(quickRecordNavigation("goal"), {
    to: "/target",
    state: { workflowSource: "quick-record", workflowAction: "goal-deposit" },
  });
  assert.deepEqual(quickRecordNavigation("investment"), {
    to: "/investasi",
    state: { workflowSource: "quick-record", workflowAction: "record-investment" },
  });
  assert.deepEqual(quickRecordGoalNavigation({ goal_id: "goal-trip" }), {
    to: "/perencanaan/kantong",
    state: { workflowSource: "quick-record", workflowAction: "goal-plan", goalId: "goal-trip", manualAmount: true },
  });
  assert.deepEqual(quickRecordInvestmentNavigation({ portfolio_id: "portfolio-1" }), {
    to: "/investasi",
    state: { workflowSource: "quick-record", workflowAction: "record-investment", portfolioId: "portfolio-1", initialDraft: { lots: "" } },
  });
});

test("pembayaran Kewajiban membawa occurrence dan periode ke Jadwal Rutin", () => {
  assert.deepEqual(commitmentPaymentNavigation({
    next_occurrence_id: "occ-38",
    next_due_date: "2026-10-07",
  }), {
    to: "/perencanaan/jadwal",
    state: {
      workflowSource: "quick-record",
      workflowAction: "pay-recurring",
      occurrenceId: "occ-38",
      period: "2026-10",
    },
  });
  assert.equal(commitmentPaymentNavigation({ next_due_date: "2026-10-07" }), null);
});

test("entry Kewajiban dan Alokasi memakai pay-recurring serta RecurringPage menghormati periode workflow", async () => {
  const [commitments, allocationDetail, recurring, investments, quickRecordContext, dashboard, dashboardSummary] = await Promise.all([
    read("src/features/commitments/CommitmentsPage.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/recurring/RecurringPage.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/app/QuickRecordContext.jsx"),
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/components/DesktopDashboardSummary.jsx"),
  ]);

  assert.match(commitments, /workflowAction: "pay-recurring"/);
  assert.match(commitments, /period: String\(item\.next_due_date\)\.slice\(0, 7\)/);
  assert.match(allocationDetail, /workflowAction: payNow \? "pay-recurring" : "view-recurring"/);
  assert.match(allocationDetail, /period: duePeriod/);
  assert.match(recurring, /workflowPeriodFromState/);
  assert.match(recurring, /setPeriod\(workflowPeriod\)/);
  assert.match(investments, /workflowAction !== "record-investment"/);
  assert.match(investments, /requestedPortfolioId/);
  assert.match(investments, /initialDraft/);
  assert.match(investments, /mode: "buy"/);
  assert.match(quickRecordContext, /openQuickRecord/);
  assert.match(quickRecordContext, /onOpenTransaction=\{openQuickRecordTransaction\}/);
  assert.match(quickRecordContext, /onBack: \(\) =>/);
  assert.match(dashboard, /useQuickRecord/);
  assert.match(dashboard, /onOpenQuickRecord=\{openQuickRecord\}/);
  assert.match(dashboardSummary, /onClick=\{onOpenQuickRecord\}>Catat<\/Button>/);
});


test("Catat cepat context-aware hanya mengotomasi pilihan yang pasti dan tetap memakai picker existing", async () => {
  const [menu, goalModal, workspace, navigation] = await Promise.all([
    read("src/components/navigation/QuickRecordMenu.jsx"),
    read("src/features/allocations/AllocationGoalExecutionModal.jsx"),
    read("src/features/allocations/AllocationsWorkspace.jsx"),
    read("src/features/allocations/allocationWorkflowNavigation.js"),
  ]);

  assert.match(menu, /quickRecordGoalNavigation/);
  assert.match(menu, /resource\.status === "ready" && isEmpty/);
  assert.match(menu, /isEmpty=\{!items\.length\}/);
  assert.match(menu, /isEmpty=\{!portfolios\.length\}/);
  assert.match(menu, /quickRecordInvestmentNavigation/);
  assert.match(menu, /step === "goals"/);
  assert.match(menu, /step === "investments"/);
  assert.match(menu, /Arahkan dana/);
  assert.match(menu, /active\.length === 1/);
  assert.match(menu, /operable\.length === 1/);

  assert.match(goalModal, /<InlineSelectionPicker/);
  assert.match(goalModal, /compatibleAccounts\.length === 1/);
  assert.match(goalModal, /if \(manualAmount\) return ""/);
  assert.match(workspace, /initialSourceAccountId=\{goalActionTarget\.allocation_intent\?\.sourceAccountId/);
  assert.match(workspace, /manualAmount=\{goalActionTarget\.allocation_intent\?\.manualAmount === true\}/);
  assert.match(navigation, /manualAmount: location\.state\.manualAmount === true/);
});

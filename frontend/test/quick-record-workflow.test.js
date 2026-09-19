import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import {
  commitmentPaymentNavigation,
  quickRecordNavigation,
  quickRecordTransactionOptions,
} from "../src/shared/workflows/quickRecord.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("launcher Catat mendelegasikan setiap aktivitas ke flow canonical tanpa mutation baru", () => {
  assert.deepEqual(quickRecordTransactionOptions("expense"), { initialType: TRANSACTION_TYPES.EXPENSE });
  assert.deepEqual(quickRecordTransactionOptions("income"), { initialType: TRANSACTION_TYPES.INCOME });
  assert.deepEqual(quickRecordTransactionOptions("transfer"), { initialType: TRANSACTION_TYPES.TRANSFER });
  assert.equal(quickRecordTransactionOptions("commitment"), null);

  assert.deepEqual(quickRecordNavigation("goal"), {
    to: "/target",
    state: { workflowSource: "quick-record", workflowAction: "goal-deposit" },
  });
  assert.deepEqual(quickRecordNavigation("investment"), {
    to: "/investasi",
    state: { workflowSource: "quick-record", workflowAction: "record-investment" },
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
  assert.match(investments, /mode: "buy"/);
  assert.match(quickRecordContext, /openQuickRecord/);
  assert.match(quickRecordContext, /onOpenTransaction=\{openTransactionComposer\}/);
  assert.match(dashboard, /useQuickRecord/);
  assert.match(dashboard, /onOpenQuickRecord=\{openQuickRecord\}/);
  assert.match(dashboardSummary, /onClick=\{onOpenQuickRecord\}>Catat<\/Button>/);
});

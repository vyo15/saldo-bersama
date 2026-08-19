import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Batas Pengeluaran dikelola dari detail Kantong Dana dengan guard Administrator dan concurrency", async () => {
  const [app, page, api, reports, dashboard, navigation] = await Promise.all([
    read("src/app/App.jsx"),
    Promise.all([read("src/features/allocations/AllocationsPage.jsx"), read("src/features/allocations/AllocationPlanningDetail.jsx"), read("src/features/budgets/useBudgetActions.js"), read("src/features/budgets/BudgetDialogLayer.jsx"), read("src/features/planning/PlanningPage.jsx")]).then((parts) => parts.join("\n")),
    read("src/features/budgets/budgets.api.js"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/config/navigation.js"),
  ]);

  assert.match(app, /path="perencanaan\/kantong"/);
  assert.match(app, /path="anggaran"[\s\S]*LegacyPlanningRedirect/);
  assert.match(page, /useApiResource\("budgets\.list", \{ period \}\)/);
  assert.match(page, /lockedEnvelope=\{item\}/);
  assert.match(page, /Batas Pengeluaran/);
  assert.match(page, /canManage: canManagePlanningItem\(item, user\)/);
  assert.match(page, /canLifecycle: administratorMode/);
  assert.match(page, /sharedOnly: user\?\.role === "member"/);
  assert.match(page, /row_version: existingBudget\?\.row_version/);
  assert.doesNotMatch(page, /createIdempotencyKey|idempotencyKey:/, "Anggaran harus memakai mutation intent canonical dari apiClient, bukan membuat key per klik");
  assert.match(page, /Promise\.allSettled\(\[budgetResource\.reload\(\), resource\.reload\(\), refreshOverview\(\)\]\)/);
  assert.doesNotMatch(page, /Transfer internal tidak dihitung/);
  assert.match(api, /budgets\.upsert/);
  assert.match(api, /budgets\.archive/);
  assert.match(reports, /to="\/perencanaan\/kantong"/);
  assert.doesNotMatch(reports, /upsertBudget|archiveBudget|MoneyInput/);
  assert.match(dashboard, /to="\/perencanaan\/kantong"/);
  assert.match(navigation, /to: "\/perencanaan", label: "Perencanaan"/);
});

test("form Anggaran mempertahankan validasi nominal, kategori aktif, dan ambang batas", async () => {
  const [page, moneyInput] = await Promise.all([
    Promise.all([read("src/features/allocations/AllocationsPage.jsx"), read("src/features/allocations/AllocationPlanningDetail.jsx"), read("src/features/budgets/useBudgetActions.js"), read("src/features/budgets/BudgetDialogLayer.jsx"), read("src/features/planning/PlanningPage.jsx")]).then((parts) => parts.join("\n")),
    read("src/components/common/MoneyInput.jsx"),
  ]);
  assert.match(page, /assertPositiveRupiah\(form\.amount\)/);
  assert.match(page, /item\.status === "active" && item\.transaction_type === "expense"/);
  assert.match(page, /type="number" min="50" max="100"/);
  assert.match(page, /Berlaku untuk/);
  assert.match(page, /budgetOwnershipUpdates/);
  assert.match(page, /\{ \.\.\.nextForm, amount: "", warning_threshold: 80 \}/);
  assert.match(page, /useApiResource\("users\.list"/);
  assert.match(page, /hubungkan batas ke Kantong Dana/);
  assert.match(page, /envelope_rule_id/);
  assert.match(moneyInput, /required=\{required\}/);
  assert.doesNotMatch(page, /<form[^>]+noValidate/);
});


test("detail Kantong menampilkan Batas Pengeluaran dan Jadwal terkait tanpa membuat tab ketiga", async () => {
  const [allocations, detail, planning, styles] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/planning/PlanningPage.jsx"),
    read("src/styles/pages.css"),
  ]);

  assert.match(planning, /Kantong Dana/);
  assert.match(planning, /Jadwal Rutin/);
  assert.doesNotMatch(planning, /value="batas"|Batas Pengeluaran<\/button>/);
  assert.match(allocations, /lazy\(\(\) => import\("\.\/AllocationPlanningDetail\.jsx"\)\)/);
  assert.match(detail, /Batas Pengeluaran/);
  assert.match(detail, /Jadwal Terkait/);
  assert.match(allocations, /linkedBudgetsForEnvelope/);
  assert.match(allocations, /relatedRecurringForEnvelope/);
  assert.match(allocations, /detailRuleId/);
  assert.match(styles, /allocation-detail-grid/);
  assert.match(styles, /allocation-limit-row/);
  assert.match(styles, /allocation-related-row/);
});


test("detail Kantong dan dialog Batas Pengeluaran tetap lazy agar route planning memiliki headroom bundle", async () => {
  const [page, detail] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
  ]);
  assert.match(page, /const AllocationPlanningDetail = lazy\(\(\) => import\("\.\/AllocationPlanningDetail\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{<div className="notice notice--info" role="status">Memuat detail Kantong\.\.\.<\/div>\}>/);
  assert.match(detail, /const BudgetDialogLayer = lazy\(\(\) => import\("\.\.\/budgets\/BudgetDialogLayer\.jsx"\)\)/);
  assert.match(detail, /<Suspense fallback=\{null\}>[\s\S]*<BudgetDialogLayer/);
});

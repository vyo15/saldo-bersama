import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Kebutuhan dikelola dari detail Alokasi Dana dan Anggaran menjadi overview read-only", async () => {
  const [app, allocationPage, budgetOverview, api, reports, dashboard, navigation] = await Promise.all([
    read("src/app/App.jsx"),
    Promise.all([read("src/features/allocations/AllocationsPage.jsx"), read("src/features/allocations/AllocationPlanningDetail.jsx"), read("src/features/budgets/useBudgetActions.js"), read("src/features/budgets/BudgetDialogLayer.jsx"), read("src/features/planning/PlanningPage.jsx")]).then((parts) => parts.join("\n")),
    read("src/features/budgets/BudgetsPage.jsx"),
    read("src/features/budgets/budgets.api.js"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/config/navigation.js"),
  ]);

  assert.match(app, /path="perencanaan\/kantong"/);
  assert.match(app, /path="anggaran" element=\{routeElement\(BudgetsPage\)\}/);
  assert.match(allocationPage, /useApiResource\("budgets\.list", \{ period \}\)/);
  assert.match(allocationPage, /lockedEnvelope=\{item\}/);
  assert.match(allocationPage, /Kebutuhan/);
  assert.match(allocationPage, /canManage: canManagePlanningItem\(item, user\)/);
  assert.match(allocationPage, /canLifecycle: administratorMode/);
  assert.match(allocationPage, /sharedOnly: user\?\.role === "member"/);
  assert.match(allocationPage, /row_version: existingBudget\?\.row_version/);
  assert.doesNotMatch(allocationPage, /createIdempotencyKey|idempotencyKey:/, "Kebutuhan harus memakai mutation intent canonical dari apiClient, bukan membuat key per klik");
  assert.match(allocationPage, /Promise\.allSettled\(\[budgetResource\.reload\(\), resource\.reload\(\), refreshOverview\(\)\]\)/);
  assert.match(api, /budgets\.upsert/);
  assert.match(api, /budgets\.archive/);

  assert.match(budgetOverview, /<h1>Anggaran<\/h1>/);
  assert.match(budgetOverview, /Halaman ini hanya merangkum anggaran/);
  assert.match(budgetOverview, /Kelola Kebutuhan di Alokasi Dana/);
  assert.doesNotMatch(budgetOverview, /upsertBudget|archiveBudget|MoneyInput|BudgetDialogLayer/);
  assert.match(reports, /to="\/anggaran"/);
  assert.doesNotMatch(reports, /upsertBudget|archiveBudget|MoneyInput/);
  assert.match(dashboard, /<h2>Kebutuhan<\/h2>/);
  assert.match(dashboard, /to="\/anggaran"/);
  assert.match(navigation, /to: "\/anggaran", label: "Anggaran"/);
});

test("form Kebutuhan mempertahankan validasi nominal dan kategori aktif tanpa membuat master data baru", async () => {
  const [page, moneyInput] = await Promise.all([
    Promise.all([read("src/features/allocations/AllocationsPage.jsx"), read("src/features/allocations/AllocationPlanningDetail.jsx"), read("src/features/budgets/useBudgetActions.js"), read("src/features/budgets/BudgetDialogLayer.jsx"), read("src/features/planning/PlanningPage.jsx")]).then((parts) => parts.join("\n")),
    read("src/components/common/MoneyInput.jsx"),
  ]);
  assert.match(page, /assertPositiveRupiah\(form\.amount\)/);
  assert.match(page, /item\.status === "active" && item\.transaction_type === "expense"/);
  assert.match(page, /!lockedEnvelope \? <label className="field"><span>Peringatan saat terpakai \(%\)<\/span><input type="number" min="50" max="100"/);
  assert.match(page, /<span>Kategori \*<\/span>/);
  assert.match(page, /label="Anggaran"/);
  assert.match(page, /budgetOwnershipUpdates/);
  assert.match(page, /\{ \.\.\.nextForm, amount: "", warning_threshold: 80 \}/);
  assert.match(page, /useApiResource\("users\.list"/);
  assert.match(page, /kategori yang sudah ada/);
  assert.match(page, /envelope_rule_id/);
  assert.match(moneyInput, /required=\{required\}/);
  assert.doesNotMatch(page, /<form[^>]+noValidate/);
});

test("detail Alokasi Dana menampilkan Kebutuhan dan Jadwal terkait tanpa membuat tab duplikat", async () => {
  const [allocations, detail, planning, styles] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/planning/PlanningPage.jsx"),
    read("src/styles/pages.css"),
  ]);

  assert.match(planning, /Alokasi Dana/);
  assert.match(planning, /Jadwal Rutin/);
  assert.doesNotMatch(planning, /value="kebutuhan"|Kebutuhan<\/button>/);
  assert.match(allocations, /lazy\(\(\) => import\("\.\/AllocationPlanningDetail\.jsx"\)\)/);
  assert.match(detail, /<h3>Kebutuhan<\/h3>/);
  assert.match(detail, /Tambah kebutuhan/);
  assert.match(detail, /Jadwal Terkait/);
  assert.match(allocations, /linkedBudgetsForEnvelope/);
  assert.match(allocations, /relatedRecurringForEnvelope/);
  assert.match(allocations, /detailRuleId/);
  assert.match(styles, /allocation-detail-grid/);
  assert.match(styles, /allocation-limit-row/);
  assert.match(styles, /allocation-related-row/);
});

test("detail Alokasi Dana dan dialog Kebutuhan tetap lazy agar route planning memiliki headroom bundle", async () => {
  const [page, detail] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
  ]);
  assert.match(page, /const AllocationPlanningDetail = lazy\(\(\) => import\("\.\/AllocationPlanningDetail\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{<div className="notice notice--info" role="status">Memuat detail Alokasi Dana\.\.\.<\/div>\}>/);
  assert.match(detail, /const BudgetDialogLayer = lazy\(\(\) => import\("\.\.\/budgets\/BudgetDialogLayer\.jsx"\)\)/);
  assert.match(detail, /<Suspense fallback=\{null\}>[\s\S]*<BudgetDialogLayer/);
});


test("kategori yang sama dapat dipakai pada beberapa Alokasi Dana tanpa menduplikasi master kategori", async () => {
  const [controller, backend] = await Promise.all([
    read("src/features/budgets/useBudgetActions.js"),
    readFile(new URL("../../api/_lib/services/planning/budgets.js", import.meta.url), "utf8"),
  ]);

  assert.match(controller, /String\(item\.envelope_rule_id \|\| ""\) === String\(form\.envelope_rule_id \|\| ""\)/);
  assert.match(controller, /findBudgetForForm/);
  assert.match(controller, /!item\.envelope_rule_id/);
  assert.match(backend, /COALESCE\(envelope_rule_id,'?'?\)\s*=\s*COALESCE\(\?,'?'?\)/);
  assert.match(backend, /envelope_rule_id IS NULL/);
  assert.doesNotMatch(backend, /SELECT \* FROM budgets WHERE period_key=\? AND category_id=\? AND scope=\? AND COALESCE\(owner_user_id,'?'?\)=COALESCE\(\?,'?'?\)"/);
});


test("penutupan Alokasi Dana menjaga continuity periode dan Kebutuhan tetap opt-in", async () => {
  const [page, dialogs, detail] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/AllocationDialogLayer.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
  ]);
  assert.match(page, /reuse_needs: closeReuseNeeds/);
  assert.match(page, /released_amount/);
  assert.match(dialogs, /Periode berikutnya tetap disiapkan agar alokasi tidak terputus/);
  assert.match(dialogs, /Pakai lagi \{p\.closeNeedsCount\} kebutuhan di periode berikutnya/);
  assert.match(dialogs, /Transaksi, saldo, serta dana Alokasi tidak ikut dipindahkan/);
  assert.match(detail, /budgetVisualState\(budget, periodMeta\)/);
  assert.doesNotMatch(detail, /const needStatus/);
});

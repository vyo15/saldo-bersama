import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Kebutuhan dikelola dari detail Alokasi Dana dan route Anggaran hanya compatibility redirect", async () => {
  const [app, allocationPage, api, reports, dashboard, navigation] = await Promise.all([
    read("src/app/App.jsx"),
    Promise.all([read("src/features/allocations/AllocationsWorkspace.jsx"), read("src/features/allocations/AllocationPlanningDetail.jsx"), read("src/features/budgets/useBudgetActions.js"), read("src/features/budgets/BudgetDialogLayer.jsx"), read("src/shared/workflows/planningSchedules.js")]).then((parts) => parts.join("\n")),
    read("src/features/budgets/budgets.api.js"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/config/navigation.js"),
  ]);
  assert.match(app, /path="perencanaan\/kantong"/);
  assert.match(app, /path="anggaran" element=\{<LegacyPlanningRedirect to="\/perencanaan\/kantong" \/>\}/);
  assert.match(app, /path="perencanaan\/kebutuhan" element=\{<LegacyPlanningRedirect to="\/perencanaan\/kantong" \/>\}/);
  assert.doesNotMatch(app, /BudgetsPage/);
  assert.match(allocationPage, /useApiResource\("budgets\.list", \{ period \}\)/);
  assert.match(allocationPage, /lockedEnvelope=\{item\}/);
  assert.match(allocationPage, /Kebutuhan/);
  assert.match(allocationPage, /Saya punya jadwal pembayaran/);
  assert.match(allocationPage, /createPlanningPaymentSchedule/);
  assert.match(allocationPage, /recurring\.createRule/);
  assert.match(api, /budgets\.upsert/);
  assert.match(api, /budgets\.archive/);
  assert.doesNotMatch(reports, /to="\/anggaran"/);
  assert.match(reports, /to="\/perencanaan\/kantong"/);
  assert.doesNotMatch(dashboard, /to="\/anggaran"/);
  assert.match(dashboard, /to="\/perencanaan\/kantong"/);
  assert.doesNotMatch(navigation, /to: "\/anggaran", label: "Anggaran"/);
  const mobileSecondary = navigation.match(/export const MOBILE_SECONDARY_GROUPS = Object\.freeze\(\[([\s\S]*?)\n\]\);/)?.[1] || "";
  assert.doesNotMatch(mobileSecondary, /to: "\/notifikasi"/);
});
test("form Kebutuhan mempertahankan validasi nominal dan kategori aktif tanpa membuat master data baru", async () => {
  const [page, moneyInput] = await Promise.all([
    Promise.all([read("src/features/allocations/AllocationsWorkspace.jsx"), read("src/features/allocations/AllocationPlanningDetail.jsx"), read("src/features/budgets/useBudgetActions.js"), read("src/features/budgets/BudgetDialogLayer.jsx"), read("src/shared/workflows/planningSchedules.js")]).then((parts) => parts.join("\n")),
    read("src/components/common/MoneyInput.jsx"),
  ]);
  assert.match(page, /assertPositiveRupiah\(form\.amount\)/);
  assert.match(page, /item\.status === "active" && item\.transaction_type === "expense"/);
  assert.match(page, /SelectionField label="Kategori" required/);
  assert.match(page, /label="Nominal kebutuhan"/);
  assert.match(page, /Saya punya jadwal pembayaran/);
  assert.match(page, /label="Frekuensi"/);
  assert.match(page, /Tanggal jatuh tempo/);
  assert.match(page, /schedule_start_date/);
  assert.match(page, /createPlanningPaymentSchedule/);
  assert.match(page, /recurring\.createRule/);
  assert.doesNotMatch(page, /<select\b/);
  assert.match(page, /budgetOwnershipUpdates/);
  assert.match(page, /kategori yang sudah ada/);
  assert.match(page, /envelope_rule_id/);
  assert.match(moneyInput, /required=\{required\}/);
});
test("detail Alokasi Dana menampilkan Kebutuhan dan Jadwal terkait tanpa membuat tab duplikat", async () => {
  const [allocations, detail, planning, styles] = await Promise.all([
    read("src/features/allocations/AllocationsWorkspace.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/planning/PlanningPage.jsx"),
    read("src/features/allocations/AllocationDetail.module.css"),
  ]);
  assert.match(planning, /Alokasi Dana/);
  assert.match(planning, /Jadwal Rutin/);
  assert.doesNotMatch(planning, /Halaman Anggaran hanya merangkum/);
  assert.match(allocations, /linkedBudgetsForEnvelope/);
  assert.match(allocations, /relatedRecurringForEnvelope/);
  assert.match(detail, /<h3 id="allocation-needs-title">Kebutuhan<\/h3>/);
  assert.match(detail, /recurringScheduleForBudget/);
  assert.match(detail, /Catat pembayaran|Lihat jadwal/);
  assert.doesNotMatch(detail, /Jadwal Terkait/);
  assert.doesNotMatch(detail, /AllocationScheduleContinuation/);
  assert.match(detail, /Pengaturan alokasi/);
  assert.match(styles, /allocation-detail-shell/);
  assert.match(styles, /allocation-limit-row/);
});
test("Alokasi baru menjadi wadah Rp0 dan Kebutuhan mendanai Alokasi otomatis", async () => {
  const [page, dialogs, detail, batchEditor, presentation, runner, backend] = await Promise.all([
    read("src/features/allocations/AllocationsWorkspace.jsx"),
    read("src/features/allocations/AllocationDialogLayer.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/budgets/BudgetBatchEditor.jsx"),
    read("src/features/allocations/allocationPresentation.js"),
    read("src/features/allocations/allocationActionRunners.js"),
    readFile(new URL("../../api/_lib/services/planning/budgets.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dialogs, /Dana yang disiapkan|AllocationNeedEstimate|Susun kebutuhan/);
  assert.match(dialogs, /Dana mengikuti Kebutuhan/);
  assert.match(runner, /default_amount: 0/);
  assert.match(runner, /allocated_amount: 0/);
  assert.match(page, /setDetailAction\("add-need"\)/);
  assert.match(detail, /Jumlah kebutuhan/);
  assert.match(detail, /Dialokasikan/);
  assert.match(detail, /Dana Alokasi lama belum mengikuti total Kebutuhan/);
  assert.match(detail, /Pulihkan dana/);
  assert.doesNotMatch(detail, /showStandardAdjustAction|>Atur dana</);
  assert.match(batchEditor, /Dana belum mencukupi/);
  assert.match(batchEditor, /Tambah saldo/);
  assert.match(batchEditor, /Setelah dialokasikan/);
  assert.match(presentation, /allocationNeedsFundingSummary/);
  assert.match(backend, /adjustEnvelopeForBudgetDelta/);
  assert.doesNotMatch(detail, /requestAdjustEnvelopeAllocation|adjustEnvelopeAllocation/);
});
test("detail Alokasi Dana dan dialog Kebutuhan tetap lazy agar route planning memiliki headroom bundle", async () => {
  const [page, detail] = await Promise.all([
    read("src/features/allocations/AllocationsWorkspace.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
  ]);
  assert.match(page, /const AllocationPlanningDetail = lazy\(\(\) => import\("\.\/AllocationPlanningDetail\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{<NativePageSkeleton kind="planning" variant="panel" label="Memuat detail Alokasi Dana…" \/>\}>/);
  assert.match(detail, /const BudgetDialogLayer = lazy\(\(\) => import\("\.\.\/budgets\/BudgetDialogLayer\.jsx"\)\)/);
  assert.match(detail, /<Suspense fallback=\{<LazyActionFallback surface="modal" title="Kebutuhan" label="Menyiapkan form Kebutuhan\.\.\." \/>\}>[\s\S]*<BudgetDialogLayer/);
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
  const [page, actions, dialogs, detail] = await Promise.all([
    read("src/features/allocations/AllocationsWorkspace.jsx"),
    read("src/features/allocations/allocationActionRunners.js"),
    read("src/features/allocations/AllocationDialogLayer.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
  ]);
  assert.match(actions, /reuse_needs: closeReuseNeeds/);
  assert.match(actions, /released_amount/);
  assert.match(dialogs, /Periode berikutnya tetap disiapkan agar alokasi tidak terputus/);
  assert.match(dialogs, /Pakai lagi \{p\.closeNeedsCount\} kebutuhan di periode berikutnya/);
  assert.match(dialogs, /dana yang dibutuhkan dipisahkan otomatis dari Dana Tersedia/);
  assert.match(dialogs, /Jika dana belum cukup, penutupan dibatalkan tanpa perubahan sebagian/);
  assert.match(detail, /budgetVisualState\(budget, periodMeta\)/);
  assert.doesNotMatch(detail, /const needStatus/);
});

test("Tambah Kebutuhan pada detail Alokasi memakai batch compact tanpa menggandakan flow edit", async () => {
  const [controller, batchDraft, dialog, batchEditor, batchStyles, model, api, backendRegistry, backendPolicy] = await Promise.all([
    read("src/features/budgets/useBudgetActions.js"),
    read("src/features/budgets/useBudgetBatchDraft.js"),
    read("src/features/budgets/BudgetDialogLayer.jsx"),
    read("src/features/budgets/BudgetBatchEditor.jsx"),
    read("src/features/budgets/BudgetBatchEditor.module.css"),
    read("src/features/budgets/budgetBatchModel.js"),
    read("src/features/budgets/budgets.api.js"),
    readFile(new URL("../../api/_lib/actions/registry.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/actions/policy.js", import.meta.url), "utf8"),
  ]);

  assert.match(controller, /formMode\(initial\.envelope_rule_id \? "create-batch" : "create-single"\)|setFormMode\(initial\.envelope_rule_id \? "create-batch" : "create-single"\)/);
  assert.match(controller, /useBudgetBatchDraft/);
  assert.match(batchDraft, /createBudgetsBatch\(buildBudgetBatchPayload/);
  assert.match(controller, /const editBudget[\s\S]*state\.edit/);
  assert.match(controller, /setFormMode\("edit-single"\)/);
  assert.match(dialog, /BudgetBatchEditor/);
  assert.match(dialog, /formController\.formMode === "create-batch"/);
  assert.match(batchEditor, /Tambah kebutuhan lain/);
  assert.match(batchEditor, /budget-batch-form/);
  assert.match(batchEditor, /Pengaturan/);
  assert.match(batchEditor, /rows: controller\.batchRows\.map\(\(row\) => \(\{/);
  assert.doesNotMatch(batchEditor, /guardValue = \{ context: controller\.form, rows: controller\.batchRows \}/);
  assert.match(batchEditor, /availableCategoryCount/);
  assert.match(batchEditor, /disabled=\{addDisabled\}/);
  assert.match(batchEditor, /Alokasi Dana ·/);
  assert.match(batchStyles, /grid-template-columns: minmax\(0, 1fr\) 2\.75rem/);
  assert.match(batchStyles, /border-bottom: 1px solid var\(--border\)/);
  assert.doesNotMatch(batchStyles, /shadow-floating|shadow-control/);
  assert.match(model, /validateBudgetBatchRows/);
  assert.match(model, /Kategori yang sama tidak dapat ditambahkan dua kali/);
  assert.match(api, /budgets\.batchCreate/);
  assert.match(backendRegistry, /"budgets\.batchCreate": createBudgetsBatch/);
  assert.match(backendPolicy, /"budgets\.batchCreate": write\(\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../src/features/${file}`, import.meta.url), "utf8");

test("Hapus Alokasi di detail langsung membuka preview lifecycle dan confirmation, tanpa modal perantara mati", async () => {
  const [workspace, detail, runners, dialogs, overlay, secondary] = await Promise.all([
    read("allocations/AllocationsWorkspace.jsx"),
    read("allocations/AllocationPlanningDetail.jsx"),
    read("allocations/allocationActionRunners.js"),
    read("allocations/AllocationDialogLayer.jsx"),
    read("allocations/AllocationOverlayLayer.jsx"),
    read("allocations/AllocationSecondaryLayer.jsx"),
  ]);
  assert.match(detail, /run\(onOpenAllocationActions\)/);
  assert.match(workspace, /onOpenAllocationActions: startLifecycle/);
  assert.match(workspace, /startLifecycle = \(item\) =>/);
  assert.match(workspace, /void lifecycle\.openRuleLifecycle\(item\)/);
  assert.match(runners, /previewEnvelopeRuleLifecycle\(\{ envelope_rule_id: item\.envelope_rule_id/);
  assert.match(workspace, /dialogsOpen = hasAllocationOverlay\(\[[^\]]*archiveTarget/);
  assert.match(dialogs, /<ConfirmationModal open=\{Boolean\(p\.archiveTarget\)\}/);
  assert.match(overlay, /<AllocationDialogLayer \{\.\.\.dialogProps\} \/>/);
  assert.doesNotMatch(workspace, /actionTarget|setActionTarget/);
  assert.doesNotMatch(secondary, /AllocationActionModal/);
  assert.match(runners, /onRemoved\?\.\(item\.envelope_rule_id\)/);
  assert.match(workspace, /setDetailRuleId\("", \{ replace: true \}\)/);
});

test("Hapus Kebutuhan tersedia di menu tiga titik dan menggunakan lifecycle backend yang sudah ada", async () => {
  const [detail, row, controller, budgetDialog] = await Promise.all([
    read("allocations/AllocationPlanningDetail.jsx"),
    read("allocations/AllocationNeedRow.jsx"),
    read("budgets/useBudgetActions.js"),
    read("budgets/BudgetDialogLayer.jsx"),
  ]);
  assert.match(detail, /removeBudget: budgetLifecycleController\.openBudgetLifecycle/);
  assert.match(detail, /onRemove=\{removeBudget\}/);
  assert.match(row, /canManage && onRemove \? <Button variant="danger" icon=\{FiTrash2\}/);
  assert.match(row, /run\(\(\) => onRemove\(budget\)\)/);
  assert.match(row, /<Modal open title="Pilihan kebutuhan"/);
  assert.match(detail, /onOpenActions=\{\(\) => setActionsTarget/);
  assert.match(controller, /previewBudgetLifecycle\(\{ budget_id: budget\.budget_id/);
  assert.match(controller, /requestRemoveBudget\(\{ budget_id: budget\.budget_id/);
  assert.match(budgetDialog, /<BudgetLifecycleModal archiveTarget=\{lifecycleController\.archiveTarget\}/);
  assert.match(detail, /canManage=\{canManage && budget\.can_manage !== false\}/);
});

// Preview mutations are asynchronous; an inline progress/error state prevents an apparently inert delete button.
test("Pemeriksaan hapus Alokasi dan Kebutuhan memberi loading, error, dan retry pada detail", async () => {
  const [detail, workspace, allocationRunner, budgetActions, needRow] = await Promise.all([
    read("allocations/AllocationPlanningDetail.jsx"),
    read("allocations/AllocationsWorkspace.jsx"),
    read("allocations/allocationActionRunners.js"),
    read("budgets/useBudgetActions.js"),
    read("allocations/AllocationNeedRow.jsx"),
  ]);
  assert.match(workspace, /status: "checking"/);
  assert.match(detail, /role="status" aria-live="polite">Memeriksa penggunaan/);
  assert.match(detail, /role="alert".*Pemeriksaan Alokasi/);
  assert.match(detail, /onClick=\{\(\) => onRetry\(item\)\}>Coba lagi/);
  assert.match(allocationRunner, /setArchiveState\(\{ status: "error", error \}\)/);
  assert.match(budgetActions, /retryBudgetLifecycle/);
  assert.match(detail, /lifecycleController\.retryBudgetLifecycle\(\)/);
  assert.match(needRow, /disabled=\{lifecycleChecking\}/);
  assert.match(detail, /lifecycleController=\{state\.budgetLifecycleController\}/);
});

test("detail Alokasi memakai satu tombol kembali mobile dan dua surface berjarak dengan radius konsisten", async () => {
  const [page, detail, styles] = await Promise.all([
    read("planning/PlanningPage.jsx"),
    read("allocations/AllocationPlanningDetail.jsx"),
    read("allocations/AllocationDetail.module.css"),
  ]);
  assert.match(page, /allocationListLocation\(location\)/);
  assert.match(page, /params\.delete\("allocation"\)/);
  assert.match(page, /allocationDetailOpen \? "Alokasi Dana" : "Atur Dana"/);
  assert.match(page, /Kembali ke daftar Alokasi Dana/);
  assert.match(detail, /className=\{allocationClass\("allocation-detail-back"\)\}/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.allocation-detail-back \{ display: none; \}/);
  assert.match(styles, /\.allocation-detail-shell \{\s*display: grid;\s*gap: 10px;/);
  assert.match(styles, /\.allocation-detail-section--needs \{\s*border: 0;\s*border-radius: 16px;/);
});

test("aksi overflow memakai action sheet modal native dan tidak menutup konten kebutuhan lain", async () => {
  const [detail, row, styles] = await Promise.all([
    read("allocations/AllocationPlanningDetail.jsx"),
    read("allocations/AllocationNeedRow.jsx"),
    read("allocations/AllocationDetail.module.css"),
  ]);
  assert.match(row, /<button type="button" className=\{allocationClass\("allocation-limit-row__menu-trigger"\)\}/);
  assert.match(row, /<Modal open title="Pilihan kebutuhan"/);
  assert.match(detail, /<Modal open=\{open\} title="Pilihan Alokasi"/);
  assert.match(row, /run\(\(\) => onRemove\(budget\)\)/);
  assert.match(row, /disabled=\{lifecycleChecking\}/);
  assert.match(detail, /canManageNeedActions\(canManage, actionsTarget\)/);
  assert.doesNotMatch(row, /<details className=\{allocationClass\("allocation-limit-row__menu"\)\}/);
  assert.doesNotMatch(styles, /allocation-limit-row__menu-items|allocation-detail-menu__items/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");
const sourceMany = (relatives) => Promise.all(relatives.map(source)).then((parts) => parts.join("\n"));
const goalFeatureSource = () => sourceMany([
  "src/features/goals/GoalsPage.jsx",
  "src/features/goals/components/GoalCards.jsx",
  "src/features/goals/components/GoalDialogs.jsx",
]);

test("halaman transaksi mengekspos filter rekening, kategori, dan pencatat", async () => {
  const page = await source("src/features/transactions/TransactionsPage.jsx");
  for (const field of ["account_id", "category_id", "created_by", "filterOptions.accounts", "filterOptions.categories", "filterOptions.creators"]) {
    assert.match(page, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(page, /Filter lainnya/);
  assert.match(page, /Reset pilihan/);
});

test("laporan dan dashboard menampilkan insight lintas bulan serta peringatan actionable", async () => {
  const [reports, desktop, mobile, notifications, notificationState, app] = await Promise.all([
    source("src/features/reports/ReportsPage.jsx"),
    source("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/notifications/NotificationsPage.jsx"),
    source("src/shared/workflows/financialNotifications.js"),
    source("src/app/App.jsx"),
  ]);
  assert.match(reports, /trend_months/);
  assert.match(reports, /Pengeluaran per rekening/);
  assert.match(reports, /Aktivitas pencatatan/);
  assert.match(reports, /Menunjukkan pencatat, bukan penanggung biaya/);
  assert.match(reports, /to="\/perencanaan\/kantong"/);
  assert.doesNotMatch(reports, /FinancialAlertList|MobileSummaryAlerts|ReportAlerts|overview\?\.alerts/);
  assert.doesNotMatch(reports, /alerts\.slice\(0,\s*8\)/);
  assert.doesNotMatch(reports, /budgets\.upsert|budgets\.archive|Simpan anggaran|Arsipkan anggaran/);
  const budgets = await Promise.all([
    source("src/features/allocations/AllocationsWorkspace.jsx"),
    source("src/features/budgets/useBudgetActions.js"),
    source("src/features/budgets/BudgetDialogLayer.jsx"),
  ]).then((parts) => parts.join("\n"));
  assert.match(budgets, /useApiResource\("budgets\.list"/);
  assert.match(budgets, /upsertBudget/);
  assert.match(budgets, /requestArchiveBudget/);
  assert.match(budgets, /Berlaku untuk/);
  assert.match(budgets, /scope: "personal"/);
  assert.match(budgets, /InlineOwnershipPicker/);
  assert.match(budgets, /userRoleLabel/);
  assert.match(budgets, /envelope_rule_id/);
  assert.match(desktop, /overview\.alerts/);
  assert.doesNotMatch(desktop, /shared-alert-count-button/);
  assert.match(desktop, /Perlu dilakukan/);
  assert.match(desktop, /\{alerts\.length\} tugas/);
  assert.match(desktop, /to="\/notifikasi">Lihat semua perhatian<\/Link>/);
  assert.doesNotMatch(desktop, /FinancialAlertList|title="Perlu perhatian"/);
  assert.match(mobile, /overview\.alerts/);
  assert.match(mobile, /MobileNextAction alerts=\{overview\.alerts\}/);
  assert.match(mobile, /to="\/notifikasi"/);
  assert.match(mobile, /useFinancialNotificationReadState/);
  assert.match(notifications, /Perlu tindakan/);
  assert.match(notifications, /Pengingat/);
  assert.match(notifications, /financialAlertGuidance/);
  assert.match(notifications, /markAllRead/);
  assert.match(notificationState, /READ_TTL_MS/);
  assert.match(notificationState, /financialNotificationTitle/);
  assert.match(app, /path="notifikasi"/);
});

test("laporan mobile memakai hierarchy analitik compact tanpa mengubah kontrak report", async () => {
  const [reports, reportStyles, layout] = await Promise.all([
    source("src/features/reports/ReportsPage.jsx"),
    source("src/features/reports/ReportsPage.module.css"),
    source("src/config/layout.js"),
  ]);
  for (const label of ["Ringkasan", "Per kategori", "Pengeluaran periode ini", "Bandingkan", "Pengeluaran terbesar", "Kebutuhan vs aktual", "Rincian lainnya"]) {
    assert.match(reports, new RegExp(label));
  }
  assert.match(reports, /useMediaQuery\(APP_MEDIA\.mobile\)/);
  assert.match(layout, /mobileMax:\s*820/);
  assert.match(reports, /TREND_OPTIONS = \[1, 3, 6, 12\]/);
  assert.match(reports, /categoryIcon\(category\?\.icon, "expense"\)/);
  assert.doesNotMatch(reports, /FinancialAlertList|MobileSummaryAlerts|ReportAlerts|overview\?\.alerts/);
  assert.match(reports, /to="\/perencanaan\/kantong"/);
  assert.doesNotMatch(reports, /budgets\.upsert|budgets\.archive|transactions\.create/);
  assert.match(reportStyles, /@media \(max-width: 820px\)/);
  assert.match(reportStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(reportStyles, /prefers-reduced-motion: reduce/);
});

test("semua permukaan alert memakai kontrak guidance yang sama dan deep-link dikonsumsi satu kali", async () => {
  const [alertWorkflow, attentionHook, transactions, reconciliation, recurring, recurringActions, goals, budgets, allocations] = await Promise.all([
    source("src/shared/workflows/financialAlerts.js"),
    source("src/hooks/useDashboardAttentionState.js"),
    source("src/features/transactions/TransactionsPage.jsx"),
    source("src/features/reconciliations/ReconciliationsPage.jsx"),
    source("src/features/recurring/RecurringPage.jsx"),
    Promise.all([
      source("src/features/recurring/useRecurringActions.js"),
      source("src/features/recurring/RecurringDialogs.jsx"),
    ]).then((parts) => parts.join("\n")),
    goalFeatureSource(),
    Promise.all([source("src/features/allocations/AllocationsWorkspace.jsx"), source("src/features/allocations/AllocationPlanningDetail.jsx"), source("src/features/budgets/BudgetDialogLayer.jsx")]).then((parts) => parts.join("\n")),
    Promise.all([source("src/features/allocations/AllocationsWorkspace.jsx"), source("src/features/allocations/allocationActionRunners.js"), source("src/features/allocations/AllocationDialogLayer.jsx"), source("src/features/allocations/AllocationNoticesLayer.jsx")]).then((parts) => parts.join("\n")),
  ]);
  for (const type of ["investment_reconciliation_difference", "investment_reconciliation_stale", "reconciliation_difference", "reconciliation_stale", "unallocated_funds", "unallocated_expense", "budget_threshold", "envelope_threshold", "recurring_overdue", "recurring_due", "goal_behind"]) {
    assert.match(alertWorkflow, new RegExp(type));
  }
  for (const label of ["Cocokkan saldo", "Tambahkan dana alokasi", "Pilih Alokasi Dana", "Periksa kebutuhan", "Periksa Alokasi Dana", "Catat pembayaran", "Buka tagihan ini", "Tambah dana target"]) {
    assert.match(alertWorkflow, new RegExp(label));
  }
  assert.match(alertWorkflow, /safeTargetPath/);
  assert.match(alertWorkflow, /value === fallbackPath/);
  assert.match(alertWorkflow, /attentionSource: source/);
  assert.match(attentionHook, /stripDashboardAttentionState/);
  assert.match(attentionHook, /"notification-center"/);
  assert.match(attentionHook, /replace: true/);
  assert.doesNotMatch(attentionHook, /consumedRef|initialAttentionRef|useRef/);
  assert.match(attentionHook, /location\.state/);
  assert.match(attentionHook, /stripFinancialAttentionState/);
  assert.doesNotMatch(attentionHook, /delete next\.accountId|delete next\.period|delete next\.allocation/);
  assert.match(transactions, /allocation: \["allocated", "unallocated"\]\.includes\(state\?\.allocation\)/);
  assert.match(transactions, /attentionEditableTarget/);
  assert.match(transactions, /setEditingTransaction\(attentionEditableTarget\)/);
  assert.match(transactions, /consumeAttention\(\)/);
  assert.match(reconciliation, /accountId/);
  assert.match(reconciliation, /contextLocked/);
  assert.match(reconciliation, /consumeAttention\(\)/);
  assert.match(recurring, /attentionOccurrenceId/);
  assert.match(recurringActions, /openPayment\(item\)/);
  assert.match(recurringActions, /consumeAttention\(\)/);
  assert.match(recurringActions, /const openPayment = useCallback/);
  assert.match(goals, /attentionGoalId/);
  assert.match(goals, /openMovement\(goal, "deposit"\)/);
  assert.match(goals, /const openMovement = useCallback/);
  assert.match(goals, /consumeAttention\(\)/);
  assert.match(budgets, /attentionBudgetId/);
  assert.match(budgets, /attentionBudgetId/);
  assert.match(budgets, /Kebutuhan/);
  assert.match(allocations, /attentionEnvelopeId/);
  assert.match(allocations, /consumeAttention\(\)/);
  assert.match(allocations, /Dana kembali tersedia/);
  assert.match(allocations, /Setor ke Target/);
  assert.match(allocations, /released_amount/);
  assert.match(allocations, /reuse_needs: closeReuseNeeds/);
  assert.match(allocations, /Periode berikutnya tetap disiapkan/);
});

test("target menampilkan sisa, kebutuhan setoran bulanan, status proyeksi, dan blocker movement dari backend", async () => {
  const goals = await goalFeatureSource();
  assert.match(goals, /remaining_amount/);
  assert.match(goals, /required_monthly_amount/);
  assert.match(goals, /pace_status/);
  assert.match(goals, /withdraw_blocked_reason/);
  assert.match(goals, /Penarikan belum tersedia/);
  assert.match(goals, /const canCreate = creationAccounts\.length > 0/);
  assert.match(goals, /transferRoutes: bootstrap\?\.transferRoutes \|\| \[\]/);
});

test("hero visual planning memakai aset existing tanpa mengubah kontrak bisnis", async () => {
  const [goals, allocations, recurring, members, dashboard, transactions, reports] = await Promise.all([
    goalFeatureSource(),
    Promise.all([source("src/features/allocations/AllocationsWorkspace.jsx"), source("src/features/allocations/AllocationOverviewLayer.jsx")]).then((parts) => parts.join("\n")),
    source("src/features/recurring/RecurringSchedule.jsx"),
    source("src/features/settings/MembersSettingsPage.jsx"),
    source("src/features/dashboard/DashboardPage.jsx"),
    source("src/features/transactions/TransactionsPage.jsx"),
    source("src/features/reports/ReportsPage.jsx"),
  ]);
  assert.match(goals, /piggy-bank\.webp/);
  assert.match(goals, /const items = useMemo\(\(\) => resource\.data\?\.items \|\| \[\], \[resource\.data\?\.items\]\);/);
  assert.match(goals, /<GoalSummary items=\{items\}/);
  assert.match(allocations, /wallet\.webp/);
  assert.match(allocations, /<AllocationSummary items=\{activeItems\}/);
  assert.match(recurring, /finance-checklist\.webp/);
  assert.match(recurring, /aria-label="Ringkasan jadwal rutin periode ini"/);
  assert.match(members, /house\.webp/);
  assert.match(members, /<MembersSummaryHero members=\{members\}/);
  for (const page of [dashboard, transactions, reports]) {
    assert.doesNotMatch(page, /piggy-bank\.webp|finance-checklist\.webp|\/house\.webp|\/wallet\.webp/);
  }
  const assetNames = ["piggy-bank.webp", "wallet.webp", "finance-checklist.webp", "house.webp"];
  for (const name of assetNames) {
    const buffer = await readFile(path.join(root, "public", "login", "assets", "mobile", name));
    assert.ok(buffer.length > 10_000, `${name} harus tetap tersedia sebagai aset visual existing`);
  }
});

test("alur planning membedakan alokasi aktif, histori, dan pembayaran rutin yang memakai Alokasi Dana", async () => {
  const [allocations, recurring, navigation] = await Promise.all([
    Promise.all([source("src/features/allocations/AllocationsWorkspace.jsx"), source("src/features/allocations/AllocationOverviewLayer.jsx"), source("src/features/allocations/allocationPresentation.js"), source("src/features/allocations/AllocationDialogLayer.jsx"), source("src/features/allocations/AllocationPlanningDetail.jsx"), source("src/features/allocations/AllocationSecondaryLayer.jsx")]).then((parts) => parts.join("\n")),
    Promise.all([
      source("src/features/recurring/RecurringPage.jsx"),
      source("src/features/recurring/RecurringDialogs.jsx"),
    ]).then((parts) => parts.join("\n")),
    source("src/config/navigation.js"),
  ]);

  assert.match(allocations, /activeItems = useMemo/);
  assert.match(allocations, /historicalItems = useMemo/);
  assert.match(allocations, /Riwayat periode/);
  assert.match(allocations, /Digunakan oleh/);
  assert.match(allocations, /assignee_user_id/);
  assert.match(allocations, /useApiResource\("users\.list"/);
  assert.doesNotMatch(allocations, /filterByAssigneeAccess/);
  assert.match(allocations, /Boolean\(item\?\.can_adjust\)/);
  assert.match(allocations, /bootstrap\?\.user \|\| user/);
  assert.match(allocations, /hasSameAssignee/);
  assert.match(allocations, /label="Ambil dana dari"/);
  assert.match(allocations, /<InlineOwnershipPicker[\s\S]{0,220}legend="Digunakan oleh"/);
  assert.match(allocations, /description: "Digunakan oleh semua anggota"/);
  assert.match(allocations, /Dana mengikuti Kebutuhan/);
  assert.match(allocations, /filteredActiveItems = useMemo/);
  assert.match(allocations, /allocationFilter === "shared"/);
  assert.match(allocations, /allocationFilter === "mine"/);
  assert.match(allocations, /allocationFilter === "unused"/);
  assert.match(allocations, /Dana terlampaui/);
  assert.match(allocations, /Kebutuhan/);
  assert.match(allocations, /recurringScheduleForBudget/);
  assert.doesNotMatch(allocations, /Jadwal Terkait/);
  assert.match(allocations, /<AllocationSummary items=\{activeItems\}/);
  assert.match(allocations, /items=\{filteredActiveItems\}/);
  assert.match(recurring, /envelope_period_id/);
  assert.match(recurring, /Alokasi Dana/);
  assert.match(recurring, /paymentEnvelopes\.map/);
  assert.doesNotMatch(recurring, /sekaligus mengurangi sisa alokasi/);
  assert.match(recurring, /"envelopes\.list"/);
  assert.doesNotMatch(recurring, /filterByAssigneeAccess|canUseAssignedItem/);
  assert.match(recurring, /item\.can_record_expense === true/);
  assert.match(navigation, /Kelola Alokasi Dana, kebutuhan, dan Jadwal Rutin/);
  assert.match(navigation, /Kumpulkan dana ke rekening tujuan/);
});

test("dashboard desktop dan mobile berbagi view model, sementara filter lengkap tetap canonical di desktop/transaksi", async () => {
  const [page, desktop, mobile, detail, setupChecklist] = await Promise.all([
    source("src/features/dashboard/DashboardPage.jsx"),
    source("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/dashboard/components/MobileTransactionDetail.jsx"),
    source("src/features/dashboard/FinancialSetupChecklist.jsx"),
  ]);

  assert.match(page, /dashboardViewModel/);
  assert.match(page, /accountDisplayLabel/);
  assert.match(page, /accountBalances = \(overview\.accountBalances \|\| \[\]\)\.map/);
  assert.match(page, /displayOverview = \{ \.\.\.overview, accountBalances: dashboardViewModel\.accountBalances \}/);
  assert.match(page, /viewModel=\{dashboardViewModel\}/);
  assert.doesNotMatch(page, /MobileDashboardFilters|mobileFiltersOpen/);
  assert.match(page, /selectedTransaction = filteredTransactions\.find/);
  assert.match(page, /mobileSelectedTransaction = recentTransactions\.find/);
  assert.match(page, /transaction=\{dashboardViewModel\.mobileSelectedTransaction\}/);
  assert.match(page, /MobileTransactionDetail/);
  assert.match(page, /FinancialSetupChecklist/);
  for (const label of ["Rekening", "Kategori"]) assert.match(setupChecklist, new RegExp(label));
  assert.match(setupChecklist, /owner \? "Tambahkan rekening yang akan dipakai" : "Ajukan rekening untuk dipakai setelah disetujui"/);
  assert.match(setupChecklist, /owner \? "Siapkan kategori pemasukan dan pengeluaran" : "Ajukan kategori yang masih dibutuhkan"/);
  assert.match(setupChecklist, /Rekening dan kategori cukup untuk mulai mencatat/);
  assert.match(setupChecklist, /Alokasi Dana, Jadwal Rutin, dan Target dapat ditambahkan kapan saja/);
  assert.match(setupChecklist, /defaultOpen=\{completed === 0\}/);
  assert.match(setupChecklist, /Siapkan dasar pencatatan/);
  assert.match(mobile, /<MobileNextAction alerts=\{overview\.alerts\} \/>/);
  assert.match(mobile, /\{setupContent\}/);
  assert.match(mobile, /<MobileQuickActions \/>/);
  assert.doesNotMatch(setupChecklist, /usableEnvelopes|sharedAccounts|planningStep/);
  assert.doesNotMatch(setupChecklist, /localStorage|sessionStorage/);
  assert.match(mobile, /Rencana Keuangan/);
  assert.doesNotMatch(mobile, /Rencana Bersama/);
  assert.match(mobile, /\{ to: "\/target", label: "Target"/);
  assert.match(mobile, /\{ to: "\/rekening", label: "Rekening"/);
  assert.match(mobile, /Jadwal Terdekat/);
  assert.match(mobile, /Aktivitas Terbaru/);
  assert.match(mobile, /Total investasi tercatat/);
  assert.match(desktop, /SensitiveMoney/);
  assert.match(desktop, /Transaksi terbaru/);
  assert.match(desktop, /data-dashboard-account/);
  assert.match(desktop, /<h2 id="dashboard-statistics-title">Pengeluaran<\/h2>/);
  assert.match(desktop, /Kebutuhan/);
  assert.match(desktop, /Jadwal rutin/);
  assert.doesNotMatch(desktop, /Tagihan terdekat/);
  assert.match(desktop, /dashboardNeedEmptyAction\(overview\)/);
  assert.match(desktop, /Target tabungan/);
  assert.match(desktop, /Perlu dilakukan/);
  assert.match(desktop, /to="\/notifikasi">Lihat semua perhatian/);
  assert.doesNotMatch(desktop, /<FinancialAlertList|title="Perlu perhatian"/);
  assert.doesNotMatch(desktop, /Aksi cepat/);
  assert.doesNotMatch(desktop, /shared-quick-actions/);
  assert.match(desktop, /Arus kas bersih/);
  assert.equal((desktop.match(/>Tambah transaksi<\/Button>/g) || []).length, 1);
  assert.match(mobile, /Aman digunakan/);
  assert.match(desktop, /Sembunyikan seluruh nominal/);
  assert.doesNotMatch(desktop, /overview\.alerts\.slice/);
  assert.match(mobile, /Batas aman per hari/);
  assert.match(mobile, /overview\.nonInvestmentBalance \?\? overview\.totalBalance/);
  assert.match(mobile, /dashboardInsightState/);
  assert.doesNotMatch(mobile, /mobile-accounts-title|MobileAccounts|AccountVisual/);
  assert.doesNotMatch(mobile, /onOpenFilters|mobile-dashboard-filter-button|FiSliders/);
  assert.match(mobile, /recentTransactions\.slice\(0, 3\)/);
  assert.match(mobile, /Sisa <SensitiveMoney/);
  assert.doesNotMatch(mobile, /sudah dialokasikan/, "Hero harus fokus pada Saldo rekening; status alokasi tetap berada di bagian perencanaan.");
  assert.doesNotMatch(mobile, /allocationSummary/, "Beranda mobile tidak perlu menghitung ulang ringkasan alokasi untuk hero.");
  assert.match(mobile, /onOpenTransactionDetail/);
  assert.match(detail, /Detail transaksi/);
  assert.match(detail, /lastSyncedAt/);
});

test("continuity flow memakai prefill dan action existing tanpa mutation finansial otomatis", async () => {
  const [allocations, overlay, funding, notices, goals, recurring, reconciliation, periods, setup] = await Promise.all([
    source("src/features/allocations/AllocationsWorkspace.jsx"),
    source("src/features/allocations/AllocationOverlayLayer.jsx"),
    source("src/features/allocations/AllocationFundingFlow.jsx"),
    source("src/features/allocations/AllocationNoticesLayer.jsx"),
    goalFeatureSource(),
    source("src/features/recurring/RecurringPage.jsx"),
    source("src/features/reconciliations/ReconciliationsPage.jsx"),
    source("src/features/settings/PeriodControlPage.jsx"),
    source("src/features/dashboard/FinancialSetupChecklist.jsx"),
  ]);

  assert.match(allocations, /lazy\(\(\) => import\("\.\/AllocationOverlayLayer\.jsx"\)\)/);
  assert.match(overlay, /lazy\(\(\) => import\("\.\/AllocationFundingFlow\.jsx"\)\)/);
  assert.match(allocations, /workflowAction !== "fund"/);
  assert.match(funding, /Bagi dana tersedia/);
  assert.match(funding, /available_balance/);
  assert.match(funding, /onSubmit/);
  assert.doesNotMatch(funding, /apiClient|createTransaction|transactions\.create/);

  assert.match(notices, /workflowAction: "goal-deposit"/);
  assert.match(notices, /sourceAccountId/);
  assert.match(goals, /workflowAction !== "goal-deposit"/);
  assert.match(goals, /suggestedAmount/);

  assert.match(recurring, /workflowSource: "recurring-income"/);
  assert.match(recurring, />Bagi ke Alokasi Dana<\/Button>/);
  assert.match(reconciliation, /reviewReconciliationTransactions/);
  assert.match(reconciliation, /accountId: submission\.resultOverlay\.accountId/);
  assert.doesNotMatch(reconciliation, /adjustment.*difference|difference.*adjustment/i);

  assert.match(periods, /UNALLOCATED_EXPENSE/);
  assert.match(periods, /Perbaiki transaksi/);
  assert.match(periods, /Periksa integritas/);
  assert.match(setup, /setupFlow: true/);
  assert.match(setup, /const hasIncome = categories\.some/);
  assert.match(setup, /const hasExpense = categories\.some/);
  assert.match(setup, /Rekening dan kategori cukup untuk mulai mencatat/);
  assert.doesNotMatch(setup, /label: "Alokasi Dana"/);
  assert.doesNotMatch(setup, /label: "Target"/);
});

test("dashboard empty state tampil sebagai aksi tambah dan membuka workflow canonical", async () => {
  const [mobile, desktop, page, allocations, recurring, goals, css] = await Promise.all([
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    source("src/features/dashboard/DashboardPage.jsx"),
    Promise.all([source("src/features/allocations/AllocationsWorkspace.jsx"), source("src/features/allocations/allocationDashboardWorkflow.js")]).then((parts) => parts.join("\n")),
    source("src/features/recurring/RecurringPage.jsx"),
    source("src/features/goals/GoalsPage.jsx"),
    source("src/features/dashboard/DashboardPage.module.css"),
  ]);
  const presentation = await import("../src/features/dashboard/dashboardPresentation.js");

  assert.deepEqual(presentation.dashboardNeedEmptyAction({
    accountBalances: [{ account_id: "acc-1", can_transact: true }],
    envelopes: [{ envelope_rule_id: "env-1", can_manage_needs: true }],
  }), {
    label: "Tambah kebutuhan",
    description: "Atur rencana bulan ini",
    to: "/perencanaan/kantong",
    state: { workflowSource: "dashboard-empty-action", workflowAction: "add-need", envelopeRuleId: "env-1" },
  });
  assert.equal(presentation.dashboardNeedEmptyAction({
    accountBalances: [{ account_id: "acc-1", can_transact: true }],
    envelopes: [
      { envelope_rule_id: "env-1", can_manage_needs: true },
      { envelope_rule_id: "env-2", can_manage_needs: true },
    ],
  }).state.workflowAction, "choose-need-allocation");
  assert.equal(presentation.dashboardNeedEmptyAction({ accountBalances: [{ account_id: "acc-1", can_transact: true }], envelopes: [] }).state.workflowAction, "create-allocation");
  assert.equal(presentation.dashboardNeedEmptyAction({ accountBalances: [], envelopes: [] }).to, "/rekening");
  assert.equal(presentation.dashboardRecurringEmptyAction({ accountBalances: [{ account_id: "acc-1", can_transact: true }] }).state.workflowAction, "create-recurring");
  assert.equal(presentation.dashboardGoalEmptyAction({ accountBalances: [{ account_id: "acc-1", owner_scope: "shared", can_transact: true }] }).state.workflowAction, "create-goal");

  assert.match(mobile, /const MobileEmptyAction/);
  assert.match(mobile, /dashboardNeedEmptyAction\(overview\)/);
  assert.match(mobile, /dashboardRecurringEmptyAction\(overview\)/);
  assert.match(mobile, /Catat transaksi/);
  assert.doesNotMatch(mobile, /mobile-compact-empty|Belum ada kebutuhan aktif|Belum ada jadwal mendatang|Belum ada aktivitas bulan ini/);
  assert.match(page, /onOpenTransaction=\{openTransactionComposer\}/);
  assert.match(desktop, /shared-widget-empty-action/);
  assert.match(desktop, /dashboardGoalEmptyAction\(overview\)/);
  assert.match(allocations, /"create-allocation", "add-need", "choose-need-allocation"/);
  assert.match(allocations, /setDetailAction\("add-need"\)/);
  assert.match(recurring, /workflowAction === "create-recurring"/);
  assert.match(goals, /workflowAction !== "create-goal"/);
  assert.match(css, /\.mobile-empty-action \{[^}]*border:\s*1px dashed var\(--border-strong\)/s);
  assert.match(css, /\.shared-widget-empty-action \{[^}]*border:\s*1px dashed var\(--border-strong\)/s);
});

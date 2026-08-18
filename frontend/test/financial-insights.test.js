import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");

test("halaman transaksi mengekspos filter rekening, kategori, dan pencatat", async () => {
  const page = await source("src/features/transactions/TransactionsPage.jsx");
  for (const field of ["account_id", "category_id", "created_by", "filterOptions.accounts", "filterOptions.categories", "filterOptions.creators"]) {
    assert.match(page, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(page, /Filter lainnya/);
  assert.match(page, /Reset pilihan/);
});

test("laporan dan dashboard menampilkan insight lintas bulan serta peringatan actionable", async () => {
  const [reports, desktop, mobile, alertList] = await Promise.all([
    source("src/features/reports/ReportsPage.jsx"),
    source("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/dashboard/components/FinancialAlertList.jsx"),
  ]);
  assert.match(reports, /trend_months/);
  assert.match(reports, /Pengeluaran per rekening/);
  assert.match(reports, /Aktivitas pencatatan/);
  assert.match(reports, /Menunjukkan pencatat, bukan penanggung biaya/);
  assert.match(reports, /to="\/anggaran"/);
  assert.match(reports, /FinancialAlertList alerts=\{alerts\} variant="report"/);
  assert.doesNotMatch(reports, /alerts\.slice\(0,\s*8\)/);
  assert.doesNotMatch(reports, /budgets\.upsert|budgets\.archive|Simpan anggaran|Arsipkan anggaran/);
  const budgets = await Promise.all([source("src/features/budgets/BudgetsPage.jsx"), source("src/features/budgets/BudgetDialogLayer.jsx")]).then((parts) => parts.join("\n"));
  assert.match(budgets, /useApiResource\("budgets\.list"/);
  assert.match(budgets, /upsertBudget/);
  assert.match(budgets, /requestArchiveBudget/);
  assert.match(budgets, /Berlaku untuk/);
  assert.match(budgets, /scope: "personal"/);
  assert.match(budgets, /userOptionLabel/);
  assert.match(desktop, /overview\.alerts/);
  assert.doesNotMatch(desktop, /shared-alert-count-button/);
  assert.match(desktop, /Peringatan aktif<\/dt><dd>\{model\.alerts\.length\}<\/dd>/);
  assert.match(desktop, /FinancialAlertList alerts=\{model\.alerts\} variant="dashboard"/);
  assert.match(mobile, /overview\.alerts/);
  assert.match(mobile, /FinancialAlertList alerts=\{alerts\} variant="mobile"/);
  assert.match(alertList, /Yang perlu dilakukan/);
  assert.match(alertList, /dashboardAlertGuidance/);
  assert.match(alertList, /state=\{guidance\.state\}/);
});

test("laporan mobile memakai hierarchy analitik compact tanpa mengubah kontrak report", async () => {
  const [reports, reportStyles] = await Promise.all([
    source("src/features/reports/ReportsPage.jsx"),
    source("src/features/reports/ReportsPage.module.css"),
  ]);
  for (const label of ["Ringkasan", "Per kategori", "Pengeluaran periode ini", "Bandingkan", "Pengeluaran terbesar", "Anggaran vs aktual", "Rincian lainnya"]) {
    assert.match(reports, new RegExp(label));
  }
  assert.match(reports, /MOBILE_REPORT_QUERY = "\(max-width: 820px\)"/);
  assert.match(reports, /TREND_OPTIONS = \[3, 6, 12\]/);
  assert.match(reports, /categoryIcon\(category\?\.icon, "expense"\)/);
  assert.match(reports, /<MobileSummaryAlerts alerts=\{overview\?\.alerts\} \/>/);
  assert.match(reports, /FinancialAlertList alerts=\{alerts\} variant="report"/);
  assert.match(reports, /to="\/anggaran"/);
  assert.doesNotMatch(reports, /budgets\.upsert|budgets\.archive|transactions\.create/);
  assert.match(reportStyles, /@media \(max-width: 820px\)/);
  assert.match(reportStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(reportStyles, /prefers-reduced-motion: reduce/);
});

test("semua permukaan alert memakai kontrak guidance yang sama dan deep-link dikonsumsi satu kali", async () => {
  const [presentation, attentionHook, transactions, reconciliation, recurring, recurringActions, goals, budgets, allocations] = await Promise.all([
    source("src/features/dashboard/dashboardPresentation.js"),
    source("src/hooks/useDashboardAttentionState.js"),
    source("src/features/transactions/TransactionsPage.jsx"),
    source("src/features/reconciliations/ReconciliationsPage.jsx"),
    source("src/features/recurring/RecurringPage.jsx"),
    Promise.all([
      source("src/features/recurring/useRecurringActions.js"),
      source("src/features/recurring/RecurringDialogs.jsx"),
    ]).then((parts) => parts.join("\n")),
    source("src/features/goals/GoalsPage.jsx"),
    Promise.all([source("src/features/budgets/BudgetsPage.jsx"), source("src/features/budgets/BudgetDialogLayer.jsx")]).then((parts) => parts.join("\n")),
    Promise.all([source("src/features/allocations/AllocationsPage.jsx"), source("src/features/allocations/AllocationDialogLayer.jsx")]).then((parts) => parts.join("\n")),
  ]);
  for (const type of ["reconciliation_difference", "reconciliation_stale", "unallocated_expense", "budget_threshold", "envelope_threshold", "recurring_overdue", "recurring_due", "goal_behind"]) {
    assert.match(presentation, new RegExp(type));
  }
  for (const label of ["Cocokkan saldo", "Pilih alokasi", "Periksa anggaran", "Periksa alokasi", "Catat pembayaran", "Buka tagihan ini", "Tambah dana target"]) {
    assert.match(presentation, new RegExp(label));
  }
  assert.match(presentation, /safeTargetPath/);
  assert.match(presentation, /value === fallbackPath/);
  assert.match(presentation, /attentionSource: "dashboard"/);
  assert.match(attentionHook, /stripDashboardAttentionState/);
  assert.match(attentionHook, /replace: true/);
  assert.match(attentionHook, /consumedRef\.current/);
  assert.doesNotMatch(attentionHook, /delete next\.accountId|delete next\.period|delete next\.allocation/);
  assert.match(transactions, /allocation: \["allocated", "unallocated"\]\.includes\(state\?\.allocation\)/);
  assert.match(transactions, /attentionEditableTarget/);
  assert.match(transactions, /setEditingTransaction\(attentionEditableTarget\)/);
  assert.match(transactions, /consumeAttention\(\)/);
  assert.match(reconciliation, /accountId/);
  assert.match(reconciliation, /sudah dipilih otomatis/);
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
  assert.match(budgets, /consumeAttention\(\)/);
  assert.match(allocations, /attentionEnvelopeId/);
  assert.match(allocations, /consumeAttention\(\)/);
});

test("target menampilkan sisa, kebutuhan setoran bulanan, dan status proyeksi", async () => {
  const goals = await source("src/features/goals/GoalsPage.jsx");
  assert.match(goals, /remaining_amount/);
  assert.match(goals, /required_monthly_amount/);
  assert.match(goals, /pace_status/);
});

test("hero visual planning memakai aset existing tanpa mengubah kontrak bisnis", async () => {
  const [goals, allocations, recurring, members, dashboard, transactions, reports] = await Promise.all([
    source("src/features/goals/GoalsPage.jsx"),
    source("src/features/allocations/AllocationsPage.jsx"),
    source("src/features/recurring/RecurringSchedule.jsx"),
    source("src/features/settings/MembersSettingsPage.jsx"),
    source("src/features/dashboard/DashboardPage.jsx"),
    source("src/features/transactions/TransactionsPage.jsx"),
    source("src/features/reports/ReportsPage.jsx"),
  ]);
  assert.match(goals, /piggy-bank\.webp/);
  assert.match(goals, /const items = resource\.data\?\.items \|\| \[\];/);
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

test("alur planning membedakan alokasi aktif, histori, dan pembayaran rutin yang memakai kantong", async () => {
  const [allocations, recurring, navigation] = await Promise.all([
    Promise.all([source("src/features/allocations/AllocationsPage.jsx"), source("src/features/allocations/AllocationDialogLayer.jsx")]).then((parts) => parts.join("\n")),
    Promise.all([
      source("src/features/recurring/RecurringPage.jsx"),
      source("src/features/recurring/RecurringDialogs.jsx"),
    ]).then((parts) => parts.join("\n")),
    source("src/config/navigation.js"),
  ]);

  assert.match(allocations, /activeItems = useMemo/);
  assert.match(allocations, /historicalItems = useMemo/);
  assert.match(allocations, /Riwayat periode/);
  assert.match(allocations, /Jatah untuk/);
  assert.match(allocations, /assignee_user_id/);
  assert.match(allocations, /useApiResource\("users\.list"/);
  assert.match(allocations, /filterByAssigneeAccess/);
  assert.match(allocations, /bootstrap\?\.user \|\| user/);
  assert.match(allocations, /hasSameAssignee/);
  assert.match(allocations, /Administrator, atau Member/);
  assert.match(allocations, /filteredActiveItems = useMemo/);
  assert.match(allocations, /allocationFilter === "shared"/);
  assert.match(allocations, /allocationFilter === "mine"/);
  assert.match(allocations, /allocationFilter === "unused"/);
  assert.match(allocations, /Melebihi alokasi/);
  assert.match(allocations, /aria-hidden=\{!expanded\}/);
  assert.match(allocations, /<AllocationSummary items=\{activeItems\}/);
  assert.match(allocations, /items=\{filteredActiveItems\}/);
  assert.match(recurring, /envelope_period_id/);
  assert.match(recurring, /Kantong dana/);
  assert.match(recurring, /paymentEnvelopes\.map/);
  assert.doesNotMatch(recurring, /sekaligus mengurangi sisa alokasi/);
  assert.match(recurring, /"envelopes\.list"/);
  assert.match(recurring, /bootstrap\?\.user \|\| user/);
  assert.match(navigation, /Bagi dana yang sudah tersedia ke kantong kebutuhan tanpa memindahkan saldo/);
  assert.match(navigation, /catat aktualnya ke ledger/);
  assert.match(navigation, /Kumpulkan dana ke rekening tujuan/);
});

test("dashboard desktop dan mobile memakai view model, filter, detail, alert, dan privacy yang sama", async () => {
  const [page, desktop, mobile, filters, detail] = await Promise.all([
    source("src/features/dashboard/DashboardPage.jsx"),
    source("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/dashboard/components/MobileDashboardFilters.jsx"),
    source("src/features/dashboard/components/MobileTransactionDetail.jsx"),
  ]);

  assert.match(page, /dashboardViewModel/);
  assert.match(page, /accountDisplayLabel/);
  assert.match(page, /accountBalances = \(overview\.accountBalances \|\| \[\]\)\.map/);
  assert.match(page, /displayOverview = \{ \.\.\.overview, accountBalances: dashboardViewModel\.accountBalances \}/);
  assert.match(page, /viewModel=\{dashboardViewModel\}/);
  assert.match(page, /MobileDashboardFilters/);
  assert.match(page, /MobileTransactionDetail/);
  assert.match(desktop, /SensitiveMoney/);
  assert.match(desktop, /Transaksi rekening/);
  assert.match(desktop, /data-dashboard-account/);
  assert.match(desktop, /<h2 id="dashboard-statistics-title">Pengeluaran<\/h2>/);
  assert.match(desktop, /Anggaran bulan ini/);
  assert.match(desktop, /Tagihan terdekat/);
  assert.match(desktop, /Target tabungan/);
  assert.doesNotMatch(desktop, /Aksi cepat/);
  assert.doesNotMatch(desktop, /shared-quick-actions/);
  assert.match(desktop, /Arus kas bersih/);
  assert.equal((desktop.match(/>Tambah transaksi<\/span>/g) || []).length, 1);
  assert.match(mobile, /Aman digunakan/);
  assert.match(desktop, /Sembunyikan seluruh nominal/);
  assert.doesNotMatch(desktop, /overview\.alerts\.slice/);
  assert.match(mobile, /Batas aman per hari/);
  assert.match(mobile, /Belum dialokasikan/);
  assert.match(mobile, /Rincian rekening dan kategori/);
  assert.match(mobile, /onOpenFilters/);
  assert.match(mobile, /onOpenTransactionDetail/);
  assert.match(filters, /TRANSACTION_LABELS/);
  assert.match(filters, /Semua rekening/);
  assert.match(filters, /Semua kategori/);
  assert.match(filters, /categories\.map\(\(item\) => <option[^>]+>\{item\.name\}<\/option>\)/);
  assert.match(detail, /Detail transaksi/);
  assert.match(detail, /lastSyncedAt/);
});

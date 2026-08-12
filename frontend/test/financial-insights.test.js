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
  const reports = await source("src/features/reports/ReportsPage.jsx");
  const desktop = await source("src/features/dashboard/components/DesktopFinanceDashboard.jsx");
  const mobile = await source("src/features/dashboard/components/MobileFinanceDashboard.jsx");
  assert.match(reports, /trend_months/);
  assert.match(reports, /Pengeluaran per rekening/);
  assert.match(reports, /Aktivitas pencatatan/);
  assert.match(reports, /Menunjukkan pencatat, bukan penanggung biaya/);
  assert.match(reports, /to="\/anggaran"/);
  assert.doesNotMatch(reports, /budgets\.upsert|budgets\.archive|Simpan anggaran|Arsipkan anggaran/);
  const budgets = await source("src/features/budgets/BudgetsPage.jsx");
  assert.match(budgets, /useApiResource\("budgets\.list"/);
  assert.match(budgets, /upsertBudget/);
  assert.match(budgets, /requestArchiveBudget/);
  assert.match(budgets, /Berlaku untuk/);
  assert.match(budgets, /scope: "personal"/);
  assert.match(budgets, /userOptionLabel/);
  assert.match(desktop, /overview\.alerts/);
  assert.match(mobile, /overview\.alerts/);
});

test("dashboard mobile mengubah peringatan menjadi instruksi dan tindakan kontekstual", async () => {
  const [mobile, transactions, reconciliation, recurring, goals, budgets, allocations] = await Promise.all([
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/transactions/TransactionsPage.jsx"),
    source("src/features/reconciliations/ReconciliationsPage.jsx"),
    source("src/features/recurring/RecurringPage.jsx"),
    source("src/features/goals/GoalsPage.jsx"),
    source("src/features/budgets/BudgetsPage.jsx"),
    source("src/features/allocations/AllocationsPage.jsx"),
  ]);
  assert.match(mobile, /Yang perlu dilakukan/);
  assert.match(mobile, /Cocokkan saldo/);
  assert.match(mobile, /Pilih alokasi/);
  assert.match(mobile, /Tambah dana target/);
  assert.match(mobile, /attentionOccurrenceId/);
  assert.doesNotMatch(mobile, />Tinjau</);
  assert.match(transactions, /allocation: \["allocated", "unallocated"\]\.includes\(state\?\.allocation\)/);
  assert.match(transactions, /attentionEditableTarget/);
  assert.match(transactions, /setEditingTransaction\(attentionEditableTarget\)/);
  assert.match(transactions, /Daftar sudah difilter ke pengeluaran yang belum dialokasikan/);
  assert.match(reconciliation, /accountId/);
  assert.match(reconciliation, /sudah dipilih otomatis/);
  assert.match(recurring, /attentionOccurrenceId/);
  assert.match(recurring, /payments\.openPayment\(item\)/);
  assert.match(goals, /attentionGoalId/);
  assert.match(goals, /movement\.openMovement\(goal, "deposit"\)/);
  assert.match(budgets, /attentionBudgetId/);
  assert.match(allocations, /attentionEnvelopeId/);
});

test("target menampilkan sisa, kebutuhan setoran bulanan, dan status proyeksi", async () => {
  const goals = await source("src/features/goals/GoalsPage.jsx");
  assert.match(goals, /remaining_amount/);
  assert.match(goals, /required_monthly_amount/);
  assert.match(goals, /pace_status/);
});

test("alur planning membedakan alokasi aktif, histori, dan pembayaran rutin yang memakai kantong", async () => {
  const [allocations, recurring, navigation] = await Promise.all([
    source("src/features/allocations/AllocationsPage.jsx"),
    source("src/features/recurring/RecurringPage.jsx"),
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
  assert.match(desktop, /<strong>Transaksi<\/strong>/);
  assert.match(desktop, /<strong>Anggaran<\/strong>/);
  assert.match(desktop, /<strong>Jadwal rutin<\/strong>/);
  assert.match(desktop, /to="\/rekonsiliasi"/);
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

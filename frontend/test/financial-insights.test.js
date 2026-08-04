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
  assert.match(page, /Reset filter/);
});

test("laporan dan dashboard menampilkan insight lintas bulan serta peringatan actionable", async () => {
  const reports = await source("src/features/reports/ReportsPage.jsx");
  const desktop = await source("src/features/dashboard/components/DesktopFinanceDashboard.jsx");
  const mobile = await source("src/features/dashboard/components/MobileFinanceDashboard.jsx");
  assert.match(reports, /trend_months/);
  assert.match(reports, /Pengeluaran per rekening/);
  assert.match(reports, /Aktivitas pencatatan/);
  assert.match(reports, /bukan ukuran kontribusi/);
  assert.match(desktop, /overview\.alerts/);
  assert.match(mobile, /overview\.alerts/);
});

test("target menampilkan sisa, kebutuhan setoran bulanan, dan status proyeksi", async () => {
  const goals = await source("src/features/goals/GoalsPage.jsx");
  assert.match(goals, /remaining_amount/);
  assert.match(goals, /required_monthly_amount/);
  assert.match(goals, /pace_status/);
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
  assert.match(page, /ownershipLabel/);
  assert.match(page, /accountBalances = \(overview\.accountBalances \|\| \[\]\)\.map/);
  assert.match(page, /displayOverview = \{ \.\.\.overview, accountBalances: dashboardViewModel\.accountBalances \}/);
  assert.match(page, /viewModel=\{dashboardViewModel\}/);
  assert.match(page, /MobileDashboardFilters/);
  assert.match(page, /MobileTransactionDetail/);
  assert.match(desktop, /SensitiveMoney/);
  assert.match(desktop, /Transaksi rekening terpilih/);
  assert.match(desktop, /data-dashboard-account/);
  assert.match(desktop, /Statistik pengeluaran/);
  assert.match(desktop, /Anggaran bulan ini/);
  assert.match(desktop, /Tagihan terdekat/);
  assert.match(desktop, /Target tabungan/);
  assert.match(mobile, /Aman digunakan akun ini/);
  assert.match(desktop, /Sembunyikan seluruh nominal/);
  assert.doesNotMatch(desktop, /overview\.alerts\.slice/);
  assert.match(mobile, /Batas aman per hari/);
  assert.match(mobile, /Dana belum dialokasikan/);
  assert.match(mobile, /Rincian rekening dan kategori/);
  assert.match(mobile, /onOpenFilters/);
  assert.match(mobile, /onOpenTransactionDetail/);
  assert.match(filters, /TRANSACTION_LABELS/);
  assert.match(filters, /Semua rekening/);
  assert.match(filters, /Semua kategori/);
  assert.match(detail, /Detail transaksi/);
  assert.match(detail, /lastSyncedAt/);
});

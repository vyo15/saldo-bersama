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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Atur dana memakai konteks multi rekening tanpa membuat pool virtual baru", async () => {
  const [planning, overview] = await Promise.all([
    read("src/features/planning/PlanningPage.jsx"),
    read("src/features/allocations/AllocationOverviewLayer.jsx"),
  ]);
  assert.match(planning, /title="Atur Dana"/);
  assert.match(planning, /satu daftar Aktif/);
  assert.match(planning, /Pemasukan yang sudah tercatat otomatis menambah dana rekening/);
  assert.doesNotMatch(planning, /role="tablist"|planning-tab-/);
  assert.match(planning, /<RecurringPage embedded expenseOnly \/>/);
  assert.match(overview, /Dana yang bisa dialokasikan/);
  assert.match(overview, /Total dana bebas lintas rekening/);
  assert.match(overview, /Setiap Alokasi tetap terikat ke satu rekening sumber/);
  assert.match(overview, /Lihat \{sources\.length\} rekening sumber/);
  assert.doesNotMatch(overview, /wallet\.webp/);
});

test("aksi funding generik memilih rekening dulu dan contextual tetap mengunci source plus target", async () => {
  const [workspace, attention, funding] = await Promise.all([
    read("src/features/allocations/AllocationsWorkspace.jsx"),
    read("src/features/allocations/allocationAttentionNavigation.js"),
    read("src/features/allocations/AllocationFundingFlow.jsx"),
  ]);
  assert.doesNotMatch(workspace, /onFundAllocation:|lockSelection:\s*true/);
  assert.match(attention, /sourceAccountId:\s*targetEnvelope\?\.source_account_id/);
  assert.match(attention, /envelopePeriodId:\s*targetEnvelope\?\.envelope_period_id/);
  assert.match(attention, /lockSelection:\s*Boolean\(targetEnvelope\)/);
  assert.match(funding, /label="Dari rekening mana\?"/);
  assert.match(funding, /allocationTargetsForAccount\(items, form\.sourceAccountId\)/);
  assert.match(funding, /FundingLockedContext/);
  assert.match(funding, /Sumber rekening mengikuti Alokasi ini dan tidak dapat diganti/);
  assert.match(funding, /Saldo rekening<\/span><strong>tidak berubah/);
  assert.match(funding, /if \(!impact\.valid\) return null/);
  assert.match(funding, /Belum ada Alokasi yang memakai rekening ini/);
});

test("create Alokasi mengikuti ownership rekening dan menyimpan opsi lanjutan secara progresif", async () => {
  const dialog = await read("src/features/allocations/AllocationDialogLayer.jsx");
  assert.match(dialog, /title="Alokasi baru"/);
  assert.match(dialog, /Langkah 1 dari 2/);
  assert.match(dialog, /Langkah 2 dari 2/);
  assert.match(dialog, /create-envelope-basics-form/);
  assert.match(dialog, /headerBackAction=/);
  assert.match(dialog, /Mengikuti pemilik rekening sumber pribadi/);
  assert.match(dialog, /Rekening Bersama dapat dialokasikan untuk Bersama atau anggota tertentu/);
  assert.match(dialog, /<details className=\{allocationClass\("allocation-create-options form-grid__full"\)\}>/);
  assert.match(dialog, /Tampilan & periode/);
  assert.match(dialog, /Pemanis kartu dan aturan sisa/);
  assert.match(dialog, /Perlu disiapkan/);
  assert.match(dialog, /Pilih rekening sumber untuk melihat dana yang dapat dialokasikan/);
  assert.match(dialog, /Buat & alokasikan/);
  assert.match(dialog, /Buat dengan \$\{formatRupiah\(fundedNow\)\}/);
});

test("overview menyatukan objek aktif dan hanya menampilkan filter ownership ketika dataset membutuhkannya", async () => {
  const overview = await read("src/features/allocations/AllocationOverviewLayer.jsx");
  assert.match(overview, /buildPlanningActiveItems/);
  assert.match(overview, /planningActiveOwnership/);
  assert.match(overview, /filterPlanningActiveItems/);
  assert.match(overview, /ownership\.showFilter \? <div className=\{allocationClass\("allocation-filters"\)\}/);
  assert.match(overview, />Aktif<\/h2>/);
  assert.match(overview, /Alokasikan dana/);
  assert.match(overview, /Alokasi baru/);
});

test("attention kekurangan dana mengunci Alokasi yang sudah diketahui", async () => {
  const attention = await read("src/features/allocations/allocationAttentionNavigation.js");
  assert.match(attention, /sourceAccountId:\s*targetEnvelope\?\.source_account_id/);
  assert.match(attention, /envelopePeriodId:\s*targetEnvelope\?\.envelope_period_id/);
  assert.match(attention, /lockSelection:\s*Boolean\(targetEnvelope\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { planningFundingAccounts } from "../src/features/allocations/allocationFundingModel.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Atur dana memakai konteks multi rekening tanpa membuat pool virtual baru", async () => {
  const [planning, planningStyles, overview, overviewStyles] = await Promise.all([
    read("src/features/planning/PlanningPage.jsx"),
    read("src/features/planning/PlanningPage.module.css"),
    read("src/features/allocations/AllocationOverviewLayer.jsx"),
    read("src/features/allocations/AllocationOverview.module.css"),
  ]);
  assert.match(planning, /title="Atur Dana"/);
  assert.match(planning, /satu daftar Aktif/);
  assert.match(planning, /Pemasukan yang sudah tercatat otomatis menambah dana rekening/);
  assert.doesNotMatch(planning, /role="tablist"|planning-tab-/);
  assert.match(planning, /<RecurringPage embedded expenseOnly \/>/);
  assert.match(overview, /Dana yang bisa dialokasikan/);
  assert.match(overview, /Dana siap dialokasikan/);
  assert.match(overview, /Dana tersedia untuk direncanakan/);
  assert.match(overview, /allocationSourceAccounts\(accounts\)/);
  assert.match(overview, /planningFundingAccounts\(accounts, items\)/);
  assert.match(overview, /Dana bebas dari rekening operasional dapat diarahkan ke Alokasi yang sudah ada atau Alokasi baru/);
  assert.match(overview, /Lihat \{sources\.length\} rekening sumber/);
  assert.match(overview, /icon=\{AllocationEmptyArt\}/);
  assert.doesNotMatch(overview, /<div className=\{allocationClass\("allocation-empty-state"\)\}>/);
  assert.match(overviewStyles, /\.allocation-empty-state > img \{/);
  assert.doesNotMatch(overviewStyles, /@media \(max-width: 820px\) \{[\s\S]*?\.allocation-empty-state \{[\s\S]*?border:\s*0;/);
  assert.match(planningStyles, /\.page > \.mobileHeader \{[\s\S]*?width:\s*calc\(100% \+ \(var\(--mobile-page-gutter\) \* 2\)\);[\s\S]*?max-width:\s*none;/);
  assert.doesNotMatch(overview, /wallet\.webp/);
});

test("aksi funding generik memilih tujuan lalu rekening, sementara contextual tetap mengunci source plus target", async () => {
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
  assert.match(funding, /Dana mau diarahkan ke mana\?/);
  assert.match(funding, /Alokasi yang sudah ada/);
  assert.match(funding, /Buat Alokasi baru/);
  assert.match(funding, /Buat Alokasi dari rekening ini/);
  assert.match(funding, /Kembali ke pilihan tujuan/);
  assert.match(workspace, /chooseDestination:\s*fundingIntent\?\.chooseDestination === true/);
  assert.match(workspace, /onCreateNew:\s*createFromFunding/);
  assert.match(workspace, /openCreate\(\{ sourceAccountId \}\)/);
  assert.match(workspace, /setCreateForm\(defaultCreateForm\(sourceAccount\)\)/);
  assert.match(workspace, /setCreateNeeds\(defaultCreateNeeds\(\)\)/);
});

test("create Alokasi mengikuti ownership rekening dan menyimpan opsi lanjutan secara progresif", async () => {
  const dialog = await read("src/features/allocations/AllocationDialogLayer.jsx");
  assert.match(dialog, /title="Alokasi baru"/);
  assert.match(dialog, /Isi nama dan pilih rekening sumber\./);
  assert.match(dialog, /Susun kebutuhan awal agar dana siap dipakai\./);
  assert.doesNotMatch(dialog, /Langkah 1 dari 2|Langkah 2 dari 2|Pilih kategori alokasi/);
  assert.match(dialog, /create-envelope-basics-form/);
  assert.match(dialog, /allocation-create-steps/);
  assert.match(dialog, /headerBackAction=/);
  assert.match(dialog, /Mengikuti pemilik rekening sumber pribadi/);
  assert.match(dialog, /Rekening Bersama dapat dialokasikan untuk Bersama atau anggota tertentu/);
  assert.doesNotMatch(dialog, /allocation-create-options|Tampilan & periode|Pemanis kartu/);
  assert.match(dialog, /Sisa saat periode berakhir/);
  assert.match(dialog, /Perlu disiapkan/);
  assert.match(dialog, /Pilih rekening sumber untuk melihat dana yang dapat dialokasikan/);
  assert.match(dialog, /Buat & alokasikan/);
  assert.match(dialog, /Buat dengan \$\{formatRupiah\(fundedNow\)\}/);
});

test("overview menyatukan objek aktif dan hanya menampilkan filter ownership ketika dataset membutuhkannya", async () => {
  const [overview, launcher, workspace] = await Promise.all([
    read("src/features/allocations/AllocationOverviewLayer.jsx"),
    read("src/features/allocations/PlanningCreateLauncher.jsx"),
    read("src/features/allocations/AllocationsWorkspace.jsx"),
  ]);
  assert.match(overview, /buildPlanningActiveItems/);
  assert.match(overview, /planningActiveOwnership/);
  assert.match(overview, /filterPlanningActiveItems/);
  assert.match(overview, /ownership\.showFilter \? <div className=\{allocationClass\("allocation-filters"\)\}/);
  assert.match(overview, />Aktif<\/h2>/);
  assert.match(overview, /Alokasikan dana/);
  assert.match(overview, /onOpenFunding\?\.\(\{ chooseDestination: true \}\)/);
  assert.match(overview, />Tambah lainnya<\/Button>/);
  assert.match(overview, /onClick=\{onCreateAllocation\}>Buat Alokasi<\/Button>/);
  assert.equal((overview.match(/>Buat Alokasi<\/Button>/g) || []).length, 1);
  assert.doesNotMatch(overview, /Tambah rencana/);
  assert.match(overview, /rows\.length \? <PlanningToolbar/);
  assert.match(overview, /PlanningCreateLauncher/);
  assert.match(launcher, /Tambah di Atur Dana/);
  assert.match(launcher, /title="Buat Alokasi"/);
  assert.match(launcher, /title="Kewajiban"/);
  assert.match(launcher, /title="Jadwal rutin"/);
  assert.match(launcher, /value: "mortgage", label: "KPR"/);
  assert.match(workspace, /workflowAction: "create-commitment"/);
  assert.match(workspace, /workflowAction: "create-recurring"/);
});

test("attention kekurangan dana mengunci Alokasi yang sudah diketahui", async () => {
  const attention = await read("src/features/allocations/allocationAttentionNavigation.js");
  assert.match(attention, /sourceAccountId:\s*targetEnvelope\?\.source_account_id/);
  assert.match(attention, /envelopePeriodId:\s*targetEnvelope\?\.envelope_period_id/);
  assert.match(attention, /lockSelection:\s*Boolean\(targetEnvelope\)/);
});


test("true-empty planning menghitung dana rekening aktif sebelum Alokasi pertama dibuat", () => {
  const accounts = [
    { account_id: "bca", available_balance: 7_000_000 },
    { account_id: "mandiri", available_balance: 3_000_000 },
    { account_id: "empty", available_balance: 0 },
  ];
  assert.deepEqual(planningFundingAccounts(accounts, []).map((item) => item.account_id), ["bca", "mandiri"]);
  assert.deepEqual(planningFundingAccounts(accounts, [{ source_account_id: "bca", can_adjust: true }]).map((item) => item.account_id), ["bca"]);
});

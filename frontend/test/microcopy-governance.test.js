import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("microcopy edukatif tetap satu-sumber setelah picker Investasi bermigrasi ke asset canonical", async () => {
  const [setup, picker, dialog, accounts, members, memberActivity, dataStorage, settingsLayout, approvals] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentAssetPicker.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/accounts/components/MobileAccountsExperience.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/components/MemberActivityPanel.jsx"),
    read("src/features/settings/DataStoragePage.jsx"),
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/approvals/ApprovalCenterPage.jsx"),
  ]);

  assert.match(setup, /Pilih saham atau reksa dana, lalu catat posisi yang Anda miliki saat ini\./);
  assert.match(setup, /Tidak ada saldo rekening yang dipindahkan dan tidak ada order yang dikirim ke broker/);
  assert.match(picker, /saham LQ45 tersedia di katalog/);
  assert.match(picker, /reksa dana tersedia di katalog/);
  assert.doesNotMatch(picker, /Daftar dibatasi pada saham LQ45 yang disediakan prototype/);
  assert.doesNotMatch(picker, /Bursa dan ukuran lot sudah ditetapkan otomatis/);

  assert.equal((dialog.match(/tidak mengirim order ke broker/gi) || []).length, 1, "guard broker cukup satu kali pada review");
  assert.doesNotMatch(dialog, /Saldo Bersama hanya mencatat transaksi yang sudah dilakukan di aplikasi investasi/);
  assert.doesNotMatch(dialog, /Posisi awal mencatat kondisi yang sudah ada saat Anda mulai memakai Saldo Bersama/);

  assert.equal((accounts.match(/<PageInfoButton/g) || []).length, 1, "mobile Rekening cukup memiliki satu Info canonical");
  assert.doesNotMatch(members, /Hak akses tetap diverifikasi backend/);
  assert.doesNotMatch(members, /Role disimpan di Saldo Bersama dan diverifikasi backend/);
  assert.match(memberActivity, /Transaksi yang dicatat oleh anggota ini/);
  assert.doesNotMatch(dataStorage, /validasi, mutation, atau proteksi backend/);
  assert.doesNotMatch(settingsLayout, /route, validasi, dan proteksi backend masing-masing/);
  assert.doesNotMatch(approvals, /idempotency|versi record|Backend tetap memvalidasi/);
});

test("design system dan QA mempertahankan aturan anti-duplikasi microcopy", async () => {
  const [designSystem, qa, testPlan] = await Promise.all([
    read("../docs/UI_DESIGN_SYSTEM.md"),
    read("../docs/QA_CHECKLIST.md"),
    read("../docs/TEST_PLAN.md"),
  ]);

  assert.match(designSystem, /satu fakta edukatif → satu tempat utama pada satu surface/i);
  assert.match(designSystem, /Description modal dijaga singkat/);
  assert.match(designSystem, /Helper di bawah field hanya boleh menjelaskan field tersebut/);
  assert.match(designSystem, /Warning finansial, destructive impact, recovery, error, conflict/);
  assert.match(qa, /satu fakta edukatif tidak diulang/i);
  assert.match(testPlan, /Copy tersebut tidak boleh diduplikasi lagi pada helper field\/list/);
});

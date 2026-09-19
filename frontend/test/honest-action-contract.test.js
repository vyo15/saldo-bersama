import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const readMany = (paths) => Promise.all(paths.map(read)).then((parts) => parts.join("\n"));

test("lifecycle action membedakan hard-delete, archive, dan penghentian Kewajiban secara jujur", async () => {
  const [accounts, categories, allocations, budgets, recurring, goals, commitments, commitmentApi] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    readMany(["src/features/categories/CategoriesPage.jsx", "src/features/categories/CategoryDialogs.jsx"]),
    readMany(["src/features/allocations/AllocationDialogLayer.jsx", "src/features/allocations/AllocationSecondaryLayer.jsx", "src/features/allocations/AllocationPlanningDetail.jsx"]),
    read("src/features/budgets/BudgetDialogLayer.jsx"),
    readMany(["src/features/recurring/RecurringSchedule.jsx", "src/features/recurring/RecurringDialogs.jsx"]),
    readMany(["src/features/goals/components/GoalCards.jsx", "src/features/goals/components/GoalDialogs.jsx"]),
    read("src/features/commitments/CommitmentsPage.jsx"),
    read("src/features/commitments/commitments.api.js"),
  ]);

  for (const source of [accounts, categories, allocations, budgets, recurring, goals]) {
    assert.match(source, /preview\.canDeleteUnused/);
    assert.match(source, /Hapus permanen/);
    assert.match(source, /Arsipkan/);
  }
  for (const source of [categories, allocations, budgets, recurring, goals]) {
    assert.match(source, /Hapus dari daftar/);

    assert.doesNotMatch(source, />\s*Kelola data\s*</);
  }
  assert.match(allocations, /Hapus dari daftar/);
  assert.doesNotMatch(allocations, />\s*Kelola data\s*</);
  assert.match(budgets, /Hapus dari daftar/);
  assert.doesNotMatch(budgets, />\s*Kelola status\s*</);

  assert.match(commitments, /Hentikan kewajiban\?/);
  assert.match(commitments, /confirmLabel="Hentikan kewajiban"/);
  assert.match(commitments, /Terhubung ke Kebutuhan/);
  assert.match(commitments, /Pembayaran ke bank atau penyedia tetap dilakukan di luar aplikasi/);
  assert.doesNotMatch(commitments, /Hapus kewajiban|>\s*Hapus\s*</);
  assert.match(commitmentApi, /archiveCommitment[\s\S]*commitments\.archive/);
  assert.doesNotMatch(commitmentApi, /deleteCommitment/);
});

test("Target mengarahkan eksekusi dana melalui Alokasi tanpa CTA mutasi langsung yang duplikatif", async () => {
  const source = await readMany([
    "src/features/goals/GoalsPage.jsx",
    "src/features/goals/components/GoalCards.jsx",
    "src/features/goals/components/GoalDialogs.jsx",
  ]);

  assert.match(source, /Atur dana/);
  assert.match(source, /Target hanya memantau rencana dan progres/);
  assert.doesNotMatch(source, /Setor dana|Tarik dana|Tambah dana target|Simpan transfer/);
});

test("side effect dan model akses dijelaskan sebelum user mengambil tindakan", async () => {
  const [notifications, login] = await Promise.all([
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/features/auth/components/LoginDesktopLayout.jsx"),
  ]);

  assert.match(notifications, /Saat diaktifkan, satu notifikasi uji akan dikirim otomatis/);
  assert.match(login, /Belum memiliki akses\?/);
  assert.match(login, /Hubungi Administrator/);
  assert.doesNotMatch(login, /Belum punya akun\?|Hubungi kami/);
});

test("surface normal menjaga vocabulary Kebutuhan dan Investasi asset-centric", async () => {
  const [loginPresentation, navigation, investments, alerts, budgetPresentation, feedback, resetLabels, fullReset] = await Promise.all([
    read("src/features/auth/loginPresentation.js"),
    read("src/config/navigation.js"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/shared/workflows/financialAlerts.js"),
    read("src/shared/presentation/budget.js"),
    read("src/components/feedback/FeedbackProvider.jsx"),
    read("src/features/settings/resetSummaryLabels.js"),
    read("src/features/settings/components/FullResetPanels.jsx"),
  ]);

  assert.match(loginPresentation, /Atur kebutuhan/);
  assert.doesNotMatch(loginPresentation, /Atur anggaran/);
  assert.match(navigation, /Pantau saham, reksa dana, nilai aset, dan aktivitas investasi/);
  assert.doesNotMatch(navigation, /Kelola Saldo RDN/);
  assert.match(investments, /Catat aset langsung tanpa setup tambahan/);
  assert.doesNotMatch(investments, /Tidak perlu membuat broker, portfolio, atau RDN/);
  assert.doesNotMatch(alerts, /anggaran terlampaui|sisa anggaran|Portfolio akan dipilih otomatis/i);
  assert.doesNotMatch(budgetPresentation, /Melebihi anggaran|Anggaran habis/);
  assert.doesNotMatch(feedback, /catatan portfolio investasi|Mencocokkan portfolio|Pencocokan portfolio/i);
  assert.doesNotMatch(resetLabels, /Pencocokan portfolio|Portfolio investasi/);
  assert.doesNotMatch(fullReset, /portfolio investasi|kategori, portfolio/i);
});

test("governance mengunci Honest Action Contract dan tidak mengandalkan copy UI yang menyesatkan", async () => {
  const [designSystem, deletionPolicy, authorization, qa, testPlan] = await Promise.all([
    read("../docs/UI_DESIGN_SYSTEM.md"),
    read("../docs/DATA_DELETION_AND_RECOVERY_POLICY.md"),
    read("../docs/AUTHORIZATION_MATRIX.md"),
    read("../docs/QA_CHECKLIST.md"),
    read("../docs/TEST_PLAN.md"),
  ]);

  assert.match(designSystem, /## Honest Action Contract/);
  assert.match(designSystem, /Hapus permanen/);
  assert.match(designSystem, /Hentikan kewajiban/);
  assert.match(deletionPolicy, /Honest lifecycle contract/);
  assert.match(authorization, /dipresentasikan sebagai \*\*Hentikan kewajiban\*\*/);
  assert.doesNotMatch(authorization, /dipresentasikan sebagai \*\*Hapus\*\* di UI/);
  assert.match(qa, /Honest Action Contract/);
  assert.match(testPlan, /Honest Action Contract diuji/);
});

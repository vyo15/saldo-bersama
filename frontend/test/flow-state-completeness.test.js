import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { commitmentCollectionState } from "../src/features/commitments/commitmentModel.js";
import { summarizeGoals } from "../src/features/goals/goalPresentation.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Kewajiban membedakan kosong, selesai, aktif, dan histori dihentikan", () => {
  assert.equal(commitmentCollectionState([]), "empty");
  assert.equal(commitmentCollectionState([{ status: "completed" }, { status: "completed" }]), "completed");
  assert.equal(commitmentCollectionState([{ status: "archived" }]), "inactive");
  assert.equal(commitmentCollectionState([{ status: "completed" }, { status: "archived" }]), "inactive");
  assert.equal(commitmentCollectionState([{ status: "archived" }, { status: "active" }]), "active");
});

test("ringkasan Target hanya menghitung target aktif sehingga completed-only tidak membuat ringkasan nol", () => {
  const completedOnly = summarizeGoals([
    { status: "completed", current_amount: 1_000_000, target_amount: 1_000_000, remaining_amount: 0, required_monthly_amount: 0 },
  ]);
  assert.equal(completedOnly.activeCount, 0);
  assert.equal(completedOnly.current, 0);
  assert.equal(completedOnly.target, 0);

  const mixed = summarizeGoals([
    { status: "active", current_amount: 250_000, target_amount: 1_000_000, remaining_amount: 750_000, required_monthly_amount: 125_000, pace_status: "behind" },
    { status: "completed", current_amount: 2_000_000, target_amount: 2_000_000, remaining_amount: 0, required_monthly_amount: 0 },
  ]);
  assert.deepEqual(mixed, { current: 250_000, target: 1_000_000, remaining: 750_000, monthly: 125_000, attention: 1, activeCount: 1 });
});

test("Atur Dana menunggu seluruh read model pembentuk daftar Aktif sebelum menampilkan hasil", async () => {
  const source = await read("src/features/allocations/AllocationsWorkspace.jsx");
  assert.match(source, /resources=\{\[resource, budgetResource, recurringResource, commitmentResource\]\}/);
  assert.match(source, /resources\.some\(\(resource\) => resource\.status === "loading"\)/);
  assert.match(source, /resources\.find\(\(resource\) => resource\.status === "error"\)/);
  assert.match(source, /Promise\.allSettled\(resources\.map\(\(resource\) => resource\.reload\(\)\)\)/);
});

test("resource pendukung tidak berubah menjadi false-empty saat initial load gagal", async () => {
  const [accounts, commitments, goals, investments, recurring, notifications, transactions, settings] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/commitments/CommitmentsPage.jsx"),
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/recurring/RecurringPage.jsx"),
    read("src/features/notifications/NotificationsPage.jsx"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/settings/SettingsPage.jsx"),
  ]);

  assert.match(accounts, /reconciliationsResource\.refreshError \|\| reconciliationsResource\.status === "error"/);
  assert.match(commitments, /budgetResource\.error \|\| budgetResource\.refreshError/);
  assert.match(goals, /investmentResource\.error \|\| investmentResource\.refreshError/);
  assert.match(goals, /investmentResource\.status === "loading"/);
  assert.match(goals, /sourceLoadFailed=\{sourceLoadFailed\}/);
  assert.match(goals, /if \(!canCreate && sourceStatus !== "ready"\) return;/);
  assert.match(goals, /sourceStatus: investmentResource\.status/);
  assert.match(investments, /goalResource\.error \|\| goalResource\.refreshError/);
  assert.match(recurring, /budgetResource\.error \|\| budgetResource\.refreshError \|\| envelopeResource\.error \|\| envelopeResource\.refreshError/);
  assert.match(notifications, /refreshError \|\| eventFeed\.error \|\| eventFeed\.refreshError/);
  assert.match(notifications, /eventFeed\.status === "loading" && !overview\?\.alerts\?\.length/);
  assert.match(transactions, /if \(resource\.status === "loading"\) return <NativePageSkeleton[^;]+;/);
  assert.match(transactions, /if \(resource\.status === "error"\) return <RefreshWarning error=\{resource\.error\} onRetry=\{resource\.reload\} \/>/);
  assert.match(transactions, /<RefreshWarning error=\{resource\.refreshError\} onRetry=\{resource\.reload\} \/>/);
  assert.match(settings, /healthResource\.error \|\| healthResource\.refreshError/);
});

test("state complete tidak disamakan dengan arsip dan ringkasan Target tidak tampil tanpa target aktif", async () => {
  const [commitments, goals] = await Promise.all([
    read("src/features/commitments/CommitmentsPage.jsx"),
    read("src/features/goals/GoalsPage.jsx"),
  ]);
  assert.match(commitments, /collectionState === "completed"/);
  assert.match(commitments, /title="Tidak ada kewajiban aktif"/);
  assert.match(goals, /summary\.activeCount \? <GoalSummary items=\{items\} \/> : null/);
});


test("halaman Pengaturan yang bergantung read model membedakan loading, error, dan empty secara jujur", async () => {
  const [google, periods, audit, recovery] = await Promise.all([
    read("src/features/settings/GoogleIntegrationsPage.jsx"),
    read("src/features/settings/PeriodControlPage.jsx"),
    read("src/features/settings/AuditPage.jsx"),
    read("src/features/settings/RecoveryPage.jsx"),
  ]);
  assert.match(google, /resource\.status === "loading"/);
  assert.match(google, /resource\.status === "error"/);
  assert.match(google, /<ErrorState error=\{resource\.error\} onRetry=\{resource\.reload\} \/>/);
  assert.match(periods, /resource\.status === "loading" \? <p[^>]+>Memuat riwayat periode/);
  assert.match(periods, /resource\.status === "error" \? <div[^>]+>.*Riwayat periode belum dapat dimuat/s);
  assert.match(periods, /resource\.status === "ready" && !\(resource\.data\?\.items \|\| \[\]\)\.length/);
  assert.match(audit, /healthResource\.error \|\| healthResource\.refreshError/);
  assert.match(recovery, /healthResource\.error \|\| healthResource\.refreshError/);
});

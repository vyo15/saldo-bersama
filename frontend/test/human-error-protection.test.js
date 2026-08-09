import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("confirmation modal mendukung alasan, exact phrase, acknowledgement, countdown, dan guard Enter", async () => {
  const modal = await read("src/components/common/ConfirmationModal.jsx");
  assert.match(modal, /expectedConfirmation/);
  assert.match(modal, /acknowledgementLabel/);
  assert.match(modal, /countdownSeconds/);
  assert.match(modal, /mustProvideReason/);
  assert.match(modal, /confirmation === expectedConfirmation/);
  assert.match(modal, /blockAccidentalEnter/);
  assert.match(modal, /event\.preventDefault\(\)/);
  assert.match(modal, /onConfirm\(normalized, \{ confirmation, acknowledged \}\)/);
});

test("rekening memakai preview server dan hanya menghapus permanen rekening belum dipakai", async () => {
  const [page, api] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/accounts.api.js"),
  ]);
  assert.match(api, /accounts\.previewLifecycle/);
  assert.match(api, /accounts\.deleteUnused/);
  assert.match(api, /accounts\.restore/);
  assert.match(page, /previewAccountLifecycle/);
  assert.match(page, /preview\.canDeleteUnused/);
  assert.match(page, /deleteUnusedAccount/);
  assert.match(page, /expectedConfirmation=\{archiveTarget\?\.preview\.canDeleteUnused/);
  assert.match(page, /acknowledgementLabel=/);
  assert.match(page, /countdownSeconds=\{archiveTarget\?\.preview\.canDeleteUnused \? 5 : 0\}/);
  assert.match(page, /Jejak audit tetap disimpan/);
  assert.match(page, /archiveAccount\(\{ account_id: account\.account_id, row_version: account\.row_version, reason \}/);
  assert.match(page, /reasonLabel=\{archiveTarget\?\.preview\.canDeleteUnused \? "Alasan penghapusan" : "Alasan pengarsipan"\}/);
  assert.match(page, /await reloadAccounts\(\)/);
});

test("kategori membedakan delete-unused dari archive, sedangkan transaksi tetap memakai cancel/restore", async () => {
  const [categories, categoryApi, transactions, transactionApi] = await Promise.all([
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/categories/categories.api.js"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/transactions.api.js"),
  ]);
  assert.match(categoryApi, /categories\.previewArchive/);
  assert.match(categoryApi, /categories\.deleteUnused/);
  assert.match(categoryApi, /categories\.restore/);
  assert.match(categories, /previewCategoryArchive/);
  assert.match(categories, /preview\.canDeleteUnused/);
  assert.match(categories, /dependencies\.transactions/);
  assert.match(categories, /dependencies\.recurring/);
  assert.match(categories, /dependencies\.budgets/);
  assert.match(categories, /aria-label=\{`Hapus atau arsipkan kategori \$\{category\.name\}`\}/);
  assert.match(categories, /reasonLabel=\{archiveTarget\?\.preview\.canDeleteUnused \? "Alasan penghapusan" : "Alasan pengarsipan"\}/);
  assert.match(categories, /"archive\.list"/);
  assert.match(transactionApi, /transactions\.restore/);
  assert.doesNotMatch(transactionApi, /transactions\.delete/);
  assert.match(transactions, /restoreTransaction/);
  assert.match(transactions, />\s*Pulihkan\s*<\/Button>/);
  assert.match(transactions, /reasonLabel="Alasan pemulihan"/);
  assert.match(transactions, /can_restore/);
});

test("planning master memakai server lifecycle preview sebelum hard-delete unused", async () => {
  const [allocations, allocationsApi, recurring, recurringApi, goals, goalsApi, budgets, budgetsApi] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/allocations.api.js"),
    read("src/features/recurring/RecurringPage.jsx"),
    read("src/features/recurring/recurring.api.js"),
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/goals/goals.api.js"),
    read("src/features/budgets/BudgetsPage.jsx"),
    read("src/features/budgets/budgets.api.js"),
  ]);
  for (const [page, api, previewAction, deleteAction] of [
    [allocations, allocationsApi, "envelopes.previewRuleLifecycle", "envelopes.deleteUnusedRule"],
    [recurring, recurringApi, "recurring.previewRuleLifecycle", "recurring.deleteUnusedRule"],
    [goals, goalsApi, "goals.previewLifecycle", "goals.deleteUnused"],
    [budgets, budgetsApi, "budgets.previewLifecycle", "budgets.deleteUnused"],
  ]) {
    assert.match(api, new RegExp(previewAction.replace(".", "\\.")));
    assert.match(api, new RegExp(deleteAction.replace(".", "\\.")));
    assert.match(page, /preview\.canDeleteUnused/);
    assert.match(page, /Hapus permanen/);
  }
  assert.match(allocations, /acknowledgementLabel=\{(?:p\.)?archiveTarget\?\.preview\.canDeleteUnused/);
  assert.match(recurring, /acknowledgementLabel=\{(?:p\.)?archiveRuleTarget\?\.preview\.canDeleteUnused/);
  assert.match(goals, /last_movement_row_version/);
  assert.match(goals, /rowVersion: reverseTarget\.last_movement_row_version/);
  assert.doesNotMatch([allocationsApi, recurringApi, goalsApi, budgetsApi].join("\n"), /transactions\.delete|goal_movements\.delete|envelope_movements\.delete/);
});

test("pengaturan memisahkan tindakan berisiko, reaktivasi, dan preview periode per route", async () => {
  const [layout, notifications, members, recovery, period, audit, api] = await Promise.all([
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/RecoveryPage.jsx"),
    read("src/features/settings/PeriodControlPage.jsx"),
    read("src/features/settings/AuditPage.jsx"),
    read("src/features/settings/settings.api.js"),
  ]);
  assert.match(layout, /\/pengaturan\/notifikasi/);
  assert.match(layout, /\/pengaturan\/anggota/);
  assert.match(layout, /\/pengaturan\/pemulihan/);
  assert.match(layout, /\/pengaturan\/periode/);
  assert.match(layout, /\/pengaturan\/audit/);
  assert.match(layout, /ownerOnly/);
  assert.match(notifications, /Setiap pengguna mendaftarkan perangkatnya sendiri/);
  assert.doesNotMatch(notifications, /Uji notifikasi/);
  assert.match(members, /Tambah anggota/);
  assert.match(members, /<Modal[\s\S]*title=\{editingMember \? "Ubah akses anggota" : "Tambah anggota"\}/);
  assert.match(members, /Lihat aktivitas transaksi/);
  assert.doesNotMatch(members, /Tambah atau ubah akses/);
  assert.match(members, /users\.upsert/);
  assert.match(members, /reactivateUser/);
  assert.match(recovery, /useApiResource\("archive\.list"/);
  assert.match(recovery, /Purge umum tetap dinonaktifkan/);
  assert.match(recovery, /restore\.preview/);
  assert.match(recovery, /restore\.apply/);
  for (const action of ["envelopes.restoreRule", "goals.restore", "recurring.restoreRule", "budgets.restore"]) {
    assert.match(recovery, new RegExp(action.replace(".", "\\.")), `${action} harus tersedia dari pemulihan item owner`);
  }
  assert.match(period, /runSettingsAction\("periods\.previewClose"/);
  assert.match(period, /expectedConfirmation=\{closePreview\?\.confirmation/);
  assert.match(audit, /audit-mobile-list|mobile-data-list/);
  assert.match(audit, /Audit tidak dapat diedit atau dihapus/);
  assert.match(api, /users\.reactivate/);
  assert.doesNotMatch([layout, notifications, members, recovery, period, audit].join("\n"), /data\.purge|transactions\.delete|accounts\.delete(?!Unused)/);
});

test("mutation guard canonical mengunci reentrancy, mempertahankan intent retry, dan membatasi key manual ke form transaksi", async () => {
  const [client, hook, modal, goals, recurring, allocations, transactionForm, notifications] = await Promise.all([
    read("src/services/api/client.js"),
    read("src/hooks/useGuardedMutation.js"),
    read("src/components/common/ConfirmationModal.jsx"),
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/recurring/RecurringPage.jsx"),
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/transactions/TransactionForm.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
  ]);
  assert.match(client, /memoryMutationIntents/);
  assert.match(client, /readPersistedIntent/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|MUTATION_INTENT_STORAGE_PREFIX/, "mutation intent tidak boleh persisten di browser storage; state finansial/cache tetap private-memory");
  assert.match(client, /if \(isOutcomeUnknownError\(error\)\) persistIntent/);
  assert.match(client, /const existingFlight = inFlightMutations\.get\(fingerprint\)/);
  assert.match(hook, /if \(inFlightRef\.current && promiseRef\.current\) return promiseRef\.current/);
  assert.match(modal, /submitLockRef\.current/);
  assert.match(modal, /submitLockRef\.current\) return/);
  assert.match(transactionForm, /Promise\.allSettled\(\[refreshOverview\(\), Promise\.resolve\(\)\.then/, "refresh gagal setelah transaksi tersimpan tidak boleh dilaporkan sebagai save gagal");
  assert.match(notifications, /useGuardedMutation/, "aksi subscription/push browser wajib punya synchronous reentrancy guard");
  for (const [name, source] of [["goals", goals], ["recurring", recurring], ["allocations", allocations]]) {
    assert.match(source, /useGuardedMutation/, `${name} wajib memakai mutation guard canonical`);
    assert.match(source, /loading=\{[^}]*Mutation\.busy\}/, `${name} wajib memberi feedback busy pada mutation utama`);
  }

  const { readdir } = await import("node:fs/promises");
  const root = new URL("../src/", import.meta.url);
  const files = [];
  const walk = async (url) => {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      if (entry.isDirectory()) await walk(child);
      else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(child);
    }
  };
  await walk(root);
  const manualKeyUsers = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/createIdempotencyKey\s*\(/.test(source) && !file.pathname.endsWith("/domain/security.js")) manualKeyUsers.push(file.pathname);
  }
  assert.equal(manualKeyUsers.length, 1, `hanya TransactionForm boleh mengelola key intent lokal: ${manualKeyUsers.join(", ")}`);
  assert.match(manualKeyUsers[0], /TransactionForm\.jsx$/);
});

test("recurring skip/restore dan feedback global memakai guard canonical tanpa hard rollback", async () => {
  const [recurring, recurringApi, feedback, feedbackContext, providers, notifications] = await Promise.all([
    read("src/features/recurring/RecurringPage.jsx"),
    read("src/features/recurring/recurring.api.js"),
    read("src/components/feedback/FeedbackProvider.jsx"),
    read("src/components/feedback/feedbackContext.js"),
    read("src/app/AppProviders.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
  ]);
  assert.match(recurringApi, /recurring\.cancelOccurrence/);
  assert.match(recurringApi, /recurring\.restoreOccurrence/);
  assert.match(recurring, /Lewati periode/);
  assert.match(recurring, /Pulihkan periode/);
  assert.match(recurring, /Ledger dan saldo tidak berubah/);
  assert.match(recurring, /useGuardedMutation/);
  assert.match(feedback, /aria-live="polite"/);
  assert.match(feedback, /dedupeKey/);
  assert.match(feedbackContext, /useFeedback/);
  assert.doesNotMatch(feedback, /undo|rollback|deleteTransaction|DELETE FROM/i);
  assert.match(providers, /FeedbackProvider/);
  assert.match(notifications, /role="switch"/);
  assert.match(notifications, /berlaku untuk akun ini di semua perangkat/i);
  assert.match(notifications, /antrean yang sudah diproses/i);
});

test("feedback transient konsisten tanpa mengganti notice persisten untuk operasi kritis", async () => {
  const transientPages = await Promise.all([
    "src/features/goals/GoalsPage.jsx",
    "src/features/budgets/BudgetsPage.jsx",
    "src/features/categories/CategoriesPage.jsx",
    "src/features/accounts/AccountsPage.jsx",
    "src/features/settings/ExportDataPage.jsx",
  ].map(read));
  for (const source of transientPages) {
    assert.match(source, /useFeedback/);
    assert.match(source, /notify\(\{[\s\S]*tone:\s*"success"/);
  }

  const persistentPages = await Promise.all([
    "src/features/settings/BackupPage.jsx",
    "src/features/settings/RecoveryPage.jsx",
    "src/features/settings/PeriodControlPage.jsx",
    "src/features/settings/GoogleIntegrationsPage.jsx",
    "src/features/settings/ImportTransactionsPage.jsx",
    "src/features/settings/MembersSettingsPage.jsx",
  ].map(read));
  for (const source of persistentPages) {
    assert.match(source, /SettingsNotice/, "workflow kritis/status wajib tetap mempunyai notice persisten");
  }

  const feedback = await read("src/components/feedback/FeedbackProvider.jsx");
  assert.doesNotMatch(feedback, /undo|rollback|hardDelete|DELETE FROM/i, "feedback global tidak boleh menjadi generic rollback finansial");
});

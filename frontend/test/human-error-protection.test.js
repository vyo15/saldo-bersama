import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("confirmation modal mendukung alasan, exact phrase, acknowledgement, countdown, dan guard Enter", async () => {
  const modal = await read("src/components/common/ConfirmationModal.jsx");
  assert.match(modal, /expectedConfirmation/);
  assert.match(modal, /acknowledgementLabel/);
  assert.match(modal, /acknowledgementItems/);
  assert.match(modal, /useMemo/);
  assert.match(modal, /acknowledgedItems\.every\(Boolean\)/);
  assert.match(modal, /confirmation-checklist/);
  assert.match(modal, /countdownSeconds/);
  assert.match(modal, /mustProvideReason/);
  assert.match(modal, /confirmation === expectedConfirmation/);
  assert.match(modal, /blockAccidentalEnter/);
  assert.match(modal, /event\.preventDefault\(\)/);
  assert.match(modal, /onConfirm\(normalized, \{ confirmation, acknowledged: acknowledgementReady \}\)/);
  assert.doesNotMatch(modal, /const\s+setters\s*=\s*\{/, "setter state tidak boleh dibungkus object transient yang memicu reset ulang setiap render");
  assert.doesNotMatch(modal, /\[[^\]]*\bsetters\b[^\]]*\]/, "effect reset tidak boleh bergantung pada object setter transient");
  assert.match(modal, /useCountdownReset\(\{[\s\S]*setReason,[\s\S]*setConfirmation,[\s\S]*setAcknowledged,[\s\S]*setRemainingSeconds,[\s\S]*setValidationError,[\s\S]*submitLockRef/);
  assert.match(modal, /confirmationRequirementHint/);
  assert.match(modal, /Selesaikan frasa konfirmasi untuk mengaktifkan tombol/);
  assert.match(modal, /Selesaikan verifikasi pemahaman untuk mengaktifkan tombol/);
});

test("rekening memakai preview server dan hanya menghapus permanen rekening belum dipakai", async () => {
  const [page, api] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/accounts.api.js"),
  ]);
  assert.match(api, /accounts\.previewLifecycle/);
  assert.match(api, /accounts\.deleteUnused/);
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
    Promise.all([read("src/features/recurring/RecurringPage.jsx"), read("src/features/recurring/useRecurringActions.js")]).then((parts) => parts.join("\n")),
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
  assert.match(goals, /const GoalCreateModal/);
  assert.match(goals, /id="goal-create-form"/);
  assert.match(recurring, /const CreateRuleModal/);
  assert.match(recurring, /id="create-recurring-form"/);
  assert.match(allocations, /const CreateEnvelopeModal/);
  assert.match(allocations, /const MoveEnvelopeModal/);
  assert.match(budgets, /const BudgetModal/);
  assert.doesNotMatch(recurring, /const CreateRulePanel/);
  assert.doesNotMatch(allocations, /const CreateEnvelopePanel|const MoveEnvelopePanel/);
  assert.doesNotMatch(budgets, /const BudgetForm/);
  assert.match(allocationsApi, /envelopes\.reverseMovement/);
  assert.doesNotMatch(allocations, /Pulihkan aturan kantong|restoreTarget|restoreState|restoreRule|archivedRules/);
  assert.doesNotMatch(allocationsApi, /envelopes\.restoreRule/);
  assert.doesNotMatch([allocationsApi, recurringApi, goalsApi, budgetsApi].join("\n"), /transactions\.delete|goal_movements\.delete|envelope_movements\.delete/);
});

test("pengaturan memisahkan tindakan berisiko, reaktivasi, dan preview periode per route", async () => {
  const [layout, notifications, members, recovery, period, audit, reset, integrations, confirmationModal, feedbackCss, api, accountsApi, categoriesApi, allocationsApi, goalsApi, recurringApi] = await Promise.all([
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/RecoveryPage.jsx"),
    read("src/features/settings/PeriodControlPage.jsx"),
    read("src/features/settings/AuditPage.jsx"),
    read("src/features/settings/ResetDataPage.jsx"),
    read("src/features/settings/GoogleIntegrationsPage.jsx"),
    read("src/components/common/ConfirmationModal.jsx"),
    read("src/components/feedback/FeedbackProvider.module.css"),
    read("src/features/settings/settings.api.js"),
    read("src/features/accounts/accounts.api.js"),
    read("src/features/categories/categories.api.js"),
    read("src/features/allocations/allocations.api.js"),
    read("src/features/goals/goals.api.js"),
    read("src/features/recurring/recurring.api.js"),
  ]);
  assert.match(layout, /\/pengaturan\/notifikasi/);
  assert.match(layout, /\/pengaturan\/anggota/);
  assert.match(layout, /\/pengaturan\/pemulihan/);
  assert.match(layout, /\/pengaturan\/periode/);
  assert.match(layout, /\/pengaturan\/audit/);
  assert.match(layout, /\/pengaturan\/reset-data/);
  assert.match(layout, /Bersihkan data testing/);
  assert.match(layout, /ownerOnly/);
  assert.match(reset, /<OwnerSettingsGuard>/);
  assert.match(reset, /runSettingsAction\("reset\.preview"/);
  assert.match(reset, /runSettingsAction\("reset\.apply"/);
  assert.match(reset, /useApiResource\("reset\.status"/);
  assert.match(reset, /clearMaintenance: true/);
  assert.match(reset, /idempotencyKey/);
  assert.match(reset, /newIntent: true/);
  assert.match(reset, /canStartNewIntent/);
  assert.match(reset, /resetStatusVerified/);
  assert.match(reset, /RESET_PREVIEW_CHANGED/);
  assert.match(reset, /recovery_required/);
  assert.match(reset, /expectedConfirmation=\{preview\?\.confirmationPhrase/);
  assert.match(reset, /countdownSeconds=\{8\}/);
  assert.match(reset, /safety backup/i);
  assert.match(reset, /acknowledgementItems=\{RESET_ACKNOWLEDGEMENTS\}/);
  assert.match(integrations, /Google Drive/);
  assert.match(integrations, /FiHardDrive/);
  assert.match(confirmationModal, /confirmation-checklist/);
  assert.match(feedbackCss, /z-index: calc\(var\(--layer-modal\) - 1\)/, "Feedback global tidak boleh menutupi dialog destructive.");
  assert.match(notifications, /Nonaktifkan perangkat ini/);
  assert.doesNotMatch(notifications, /Uji notifikasi/);
  assert.match(members, /Tambah pengguna/);
  assert.match(members, /<Modal[\s\S]*title=\{editingMember \? "Ubah akses pengguna" : "Tambah pengguna"\}/);
  assert.match(members, /Lihat aktivitas transaksi/);
  assert.doesNotMatch(members, /Tambah atau ubah akses/);
  assert.match(members, /users\.upsert/);
  assert.match(members, /reactivateUser/);
  assert.match(recovery, /useApiResource\("archive\.list"/);
  assert.match(recovery, /Item diarsipkan/);
  assert.match(recovery, /restore\.preview/);
  assert.match(recovery, /restore\.apply/);
  for (const action of ["accounts.restore", "categories.restore", "envelopes.restoreRule", "goals.restore", "recurring.restoreRule", "budgets.restore"]) {
    assert.match(recovery, new RegExp(action.replace(".", "\\.")), `${action} harus tersedia dari pemulihan item owner`);
  }
  assert.doesNotMatch(
    [accountsApi, categoriesApi, allocationsApi, goalsApi, recurringApi].join("\n"),
    /accounts\.restore|categories\.restore|envelopes\.restoreRule|goals\.restore|recurring\.restoreRule/,
    "Restore master arsip harus memiliki satu entry point UI melalui Pengaturan > Pemulihan data.",
  );
  assert.match(period, /runSettingsAction\("periods\.previewClose"/);
  assert.match(period, /expectedConfirmation=\{closePreview\?\.confirmation/);
  assert.match(audit, /audit-mobile-list|mobile-data-list/);
  assert.match(audit, /Audit aktivitas/);
  assert.match(api, /users\.reactivate/);
  assert.doesNotMatch([layout, notifications, members, recovery, period, audit, reset].join("\n"), /data\.purge|transactions\.delete|accounts\.delete(?!Unused)/);
});

test("mutation guard canonical mengunci reentrancy, mempertahankan intent retry, dan membatasi key manual ke form transaksi", async () => {
  const [client, hook, modal, goals, recurring, allocations, transactionForm, notifications] = await Promise.all([
    read("src/services/api/client.js"),
    read("src/hooks/useGuardedMutation.js"),
    read("src/components/common/ConfirmationModal.jsx"),
    read("src/features/goals/GoalsPage.jsx"),
    Promise.all([read("src/features/recurring/RecurringPage.jsx"), read("src/features/recurring/useRecurringActions.js")]).then((parts) => parts.join("\n")),
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
    Promise.all([read("src/features/recurring/RecurringPage.jsx"), read("src/features/recurring/useRecurringActions.js")]).then((parts) => parts.join("\n")),
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

  assert.match(recurring, /Kelola jadwal/);
  assert.match(recurring, /ScheduleSummary/);
  assert.match(recurring, /ScheduleFilters/);
  assert.match(recurring, /ScheduleKindTabs/);
  assert.match(recurring, /SchedulePeriodSection/);
  assert.match(recurring, /aria-label="Jenis jadwal rutin"/);
  assert.match(recurring, /setKind\(item\.kind === "income"/);
  assert.doesNotMatch(recurring, /const SchedulePanel/);
  assert.match(recurring, /Edit jadwal/);
  assert.match(recurring, /Arsipkan \/ hapus/);
  assert.match(recurring, /id: "attention"/);
  assert.match(recurring, /Perlu perhatian/);
  assert.match(recurring, /Lihat tindakan/);
  assert.match(recurring, /Lengkapi aktual/);
  assert.match(recurring, /Periksa auto-debit/);
  assert.match(recurring, /ScheduleAttention/);
  assert.match(feedback, /aria-live="polite"/);
  assert.match(feedback, /dedupeKey/);
  assert.match(feedback, /GlobalProcessIndicator/);
  assert.match(feedback, /subscribeToMutationActivity/);
  assert.match(feedback, /ACTION_MODULES/);
  assert.match(feedback, /transactions\.create/);
  assert.match(feedback, /Menyimpan transaksi/);
  assert.match(feedback, /Server sudah mengonfirmasi perubahan/);
  assert.match(feedback, /Jangan kirim ulang sebelum status diperiksa agar tidak terjadi duplikasi/);
  assert.match(feedback, /"reset\.apply": "Jangan kirim ulang\. Buka Bersihkan data testing lalu gunakan Periksa status operasi/);
  assert.match(feedback, /\["success", "info", "warning", "danger"\]/, "feedback error wajib mempertahankan tone danger");
  assert.match(feedbackContext, /useFeedback/);
  assert.doesNotMatch(feedback, /undo|rollback|deleteTransaction|DELETE FROM/i);
  assert.match(providers, /FeedbackProvider/);
  assert.match(notifications, /role="switch"/);
  assert.match(notifications, /updateNotificationPreference/);
  assert.match(notifications, /activeDeviceCount/);
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


test("editor jadwal rutin memakai master rule, bukan snapshot occurrence, dan menandai input wajib", async () => {
  const [page, backend] = await Promise.all([
    Promise.all([read("src/features/recurring/RecurringPage.jsx"), read("src/features/recurring/useRecurringActions.js")]).then((parts) => parts.join("\n")),
    readFile(new URL("../../api/_lib/services/planning/recurring.js", import.meta.url), "utf8"),
  ]);
  assert.match(backend, /r\.expected_amount AS rule_expected_amount/);
  assert.match(backend, /r\.due_day AS rule_due_day/);
  assert.match(page, /expected_amount: String\(item\.rule_expected_amount \|\| ""\)/);
  assert.match(page, /due_day: Number\(item\.rule_due_day \|\| 1\)/);
  assert.doesNotMatch(page, /due_day: Number\(String\(item\.due_date/);
  assert.match(page, /label="Nominal perkiraan"[\s\S]*required/);
  assert.match(page, /<span>Kategori \*<\/span>/);
  assert.match(page, /<span>\{label\} \*<\/span>/);
  assert.match(page, /Tanggal jatuh tempo\/masuk \*/);
  assert.match(page, /Tanggal mulai \*/);
});

test("aksi lifecycle rekening memakai label jujur sebelum server menentukan hapus atau arsip", async () => {
  const [desktop, card] = await Promise.all([
    read("src/features/accounts/components/DesktopAccountsWorkspace.jsx"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
  ]);
  assert.match(desktop, />Hapus \/ Arsipkan<\/Button>/);
  assert.equal((card.match(/Hapus \/ Arsipkan/g) || []).length, 2);
  assert.doesNotMatch(`${desktop}\n${card}`, />Arsipkan<\/(?:Button|button)>/);
});

test("inisialisasi Google Login dapat dibatalkan saat layout atau effect berubah", async () => {
  const [page, google] = await Promise.all([
    read("src/features/auth/LoginPage.jsx"),
    read("src/services/auth/googleFirebaseAuth.js"),
  ]);
  assert.match(page, /const controller = new AbortController\(\)/);
  assert.match(page, /signal: controller\.signal/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /error\?\.name !== "AbortError"/);
  assert.match(google, /waitForGoogleIdentity\(8000, signal\)/);
  assert.match(google, /signal\?\.aborted/);
  assert.match(google, /removeEventListener\("abort", onAbort\)/);
});


test("mutation ledger terkelola menginvalidasi rekening dan turunan laporan yang ikut berubah", async () => {
  const [goals, recurring] = await Promise.all([
    read("src/features/goals/GoalsPage.jsx"),
    Promise.all([read("src/features/recurring/RecurringPage.jsx"), read("src/features/recurring/useRecurringActions.js")]).then((parts) => parts.join("\n")),
  ]);
  assert.match(goals, /goalLedgerRefreshKeys = Object\.freeze\(\["goals\.list", "transactions\.list", "accounts\.list", "reports\.monthly", "app\.initialState"\]\)/);
  assert.match(goals, /invalidate\(goalLedgerRefreshKeys\)/);
  assert.match(goals, /refresh\(goalLedgerRefreshKeys\)/);
  assert.match(recurring, /recurringLedgerRefreshKeys = Object\.freeze\(\["recurring\.list", "transactions\.list", "accounts\.list", "envelopes\.list", "budgets\.list", "reports\.monthly", "app\.initialState"\]\)/);
  assert.equal((recurring.match(/keys: recurringLedgerRefreshKeys/g) || []).length, 2, "bayar dan reverse pembayaran rutin harus menyegarkan semua read model ledger terkait");
});


test("import dan restore teknis menginvalidasi cache finansial sebelum refresh bootstrap", async () => {
  const [importPage, recoveryPage] = await Promise.all([
    read("src/features/settings/ImportTransactionsPage.jsx"),
    read("src/features/settings/RecoveryPage.jsx"),
  ]);
  assert.match(importPage, /IMPORT_REFRESH_KEYS[\s\S]*"transactions\.list"[\s\S]*"accounts\.list"[\s\S]*"envelopes\.list"[\s\S]*"budgets\.list"[\s\S]*"reports\.monthly"/);
  assert.match(importPage, /invalidate\(IMPORT_REFRESH_KEYS\);[\s\S]*refreshAll\(\)/);
  assert.match(recoveryPage, /RESTORE_REFRESH_KEYS[\s\S]*"bootstrap\.get"[\s\S]*"transactions\.list"[\s\S]*"reconciliations\.list"[\s\S]*"users\.list"[\s\S]*"archive\.list"/);
  assert.match(recoveryPage, /invalidate\(RESTORE_REFRESH_KEYS\);[\s\S]*refreshAll\(\)/);
});

test("import transaksi memblokir partial apply dan restore memakai konfirmasi destructive lengkap", async () => {
  const [importPage, recoveryPage, maintenancePanel, integrations] = await Promise.all([
    read("src/features/settings/ImportTransactionsPage.jsx"),
    read("src/features/settings/RecoveryPage.jsx"),
    read("src/features/settings/MaintenanceRecoveryPanel.jsx"),
    read("src/features/settings/GoogleIntegrationsPage.jsx"),
  ]);

  assert.match(importPage, /preview\?\.acceptable/);
  assert.match(importPage, /if \(!preview\?\.acceptable\) return/);
  assert.match(importPage, /Tidak ada partial import/);
  assert.match(importPage, /Dampak kumulatif import/);
  assert.match(importPage, /Total refund/);
  assert.match(importPage, /Penyesuaian saldo/);
  assert.match(importPage, /fileInputRef\.current\.value = ""/);

  assert.match(recoveryPage, /expectedConfirmation="RESTORE SALDO BERSAMA"/);
  assert.match(recoveryPage, /acknowledgementItems=\{RESTORE_ACKNOWLEDGEMENTS\}/);
  assert.match(recoveryPage, /countdownSeconds=\{10\}/);
  assert.match(recoveryPage, /requireReason/);
  assert.match(recoveryPage, /RestorePreviewSummary/);
  assert.match(recoveryPage, /preview\.fileName/);
  assert.match(recoveryPage, /preview\.createdAt/);
  assert.match(recoveryPage, /preview\.schemaVersion/);
  assert.match(recoveryPage, /clearMaintenance: true/);
  assert.match(recoveryPage, /healthResource\.status === "ready"/);
  assert.match(recoveryPage, /!healthReady \|\| maintenanceMode/);
  assert.match(recoveryPage, /<MaintenanceRecoveryPanel/);
  assert.match(maintenancePanel, /Periksa integritas & pulihkan/);

  assert.match(integrations, /driveBackupActivity/);
  assert.match(integrations, /integrations\.driveBackup/);
  assert.match(integrations, /Safety backup untuk reset, restore, import, dan recovery/);
});

test("FinanceContext memakai epoch per resource agar refresh overview dan bootstrap tidak saling membatalkan", async () => {
  const [finance, epoch] = await Promise.all([
    read("src/app/FinanceContext.jsx"),
    read("src/app/financeRequestEpoch.js"),
  ]);
  assert.match(finance, /beginFinanceRequest\(controls\.requestEpoch\.current, \["bootstrap", "overview"\]\)/);
  assert.match(finance, /beginFinanceRequest\(controls\.requestEpoch\.current, \["overview"\]\)/);
  assert.match(finance, /beginFinanceRequest\(controls\.requestEpoch\.current, \["bootstrap"\]\)/);
  assert.doesNotMatch(finance, /requestSequence/);
  assert.match(epoch, /session/);
  assert.match(epoch, /requestOwnsFinanceResource/);
  assert.match(epoch, /invalidateFinanceSession/);
});

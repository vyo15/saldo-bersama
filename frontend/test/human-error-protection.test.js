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
  assert.match(page, /await reloadAccounts\(\)/);
});

test("kategori dan transaksi menampilkan preview atau pemulihan berlabel", async () => {
  const [categories, categoryApi, transactions, transactionApi] = await Promise.all([
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/categories/categories.api.js"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/transactions.api.js"),
  ]);
  assert.match(categoryApi, /categories\.previewArchive/);
  assert.match(categoryApi, /categories\.restore/);
  assert.match(categories, /previewCategoryArchive/);
  assert.match(categories, /dependencies\.active_transactions/);
  assert.match(categories, /aria-label=\{`Arsipkan kategori \$\{category\.name\}`\}/);
  assert.match(categories, /"archive\.list"/);
  assert.match(transactionApi, /transactions\.restore/);
  assert.match(transactions, /restoreTransaction/);
  assert.match(transactions, />\s*Pulihkan\s*<\/Button>/);
  assert.match(transactions, /reasonLabel="Alasan pemulihan"/);
  assert.match(transactions, /can_restore/);
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
  assert.match(period, /runSettingsAction\("periods\.previewClose"/);
  assert.match(period, /expectedConfirmation=\{closePreview\?\.confirmation/);
  assert.match(audit, /audit-mobile-list|mobile-data-list/);
  assert.match(audit, /Audit tidak dapat diedit atau dihapus/);
  assert.match(api, /users\.reactivate/);
  assert.doesNotMatch([layout, notifications, members, recovery, period, audit].join("\n"), /data\.purge|transactions\.delete|accounts\.delete(?!Unused)/);
});

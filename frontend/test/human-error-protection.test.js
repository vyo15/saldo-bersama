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

test("pengaturan menyediakan arsip per item, reaktivasi eksplisit, dan preview tutup periode", async () => {
  const [settings, api] = await Promise.all([
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/settings.api.js"),
  ]);
  assert.match(settings, /useApiResource\("archive\.list"/);
  assert.match(settings, /Proteksi human error/);
  assert.match(settings, /Akses dan anggota/);
  assert.match(settings, /Data dan portabilitas/);
  assert.match(settings, /Backup dan pemulihan/);
  assert.match(settings, /Kontrol periode/);
  assert.match(settings, /Audit dan keamanan/);
  const notificationSection = settings.indexOf('aria-labelledby="device-notification-title"');
  const ownerGate = settings.indexOf("{ownerMode ? (");
  assert.ok(notificationSection >= 0 && notificationSection < ownerGate, "Notifikasi perangkat harus dapat dikelola owner maupun member.");
  assert.match(settings, /Purge umum/);
  assert.match(settings, /Dinonaktifkan pada aplikasi harian/);
  assert.match(settings, /runSettingsAction\("periods\.previewClose"/);
  assert.match(settings, /expectedConfirmation=\{periodClosePreview\?\.confirmation/);
  assert.match(settings, /usersResource\.reload\(\), archiveResource\.reload\(\), auditResource\.reload\(\)/);
  assert.match(api, /users\.reactivate/);
  assert.doesNotMatch(settings, /data\.purge|transactions\.delete|accounts\.delete(?!Unused)/);
});

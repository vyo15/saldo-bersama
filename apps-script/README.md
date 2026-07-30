# Google Apps Script API

Folder ini adalah backend canonical untuk Google Sheets, Calendar, notification worker, audit, backup, import/restore, migration, dan integrity check.

## File wajib

Salin seluruh file berikut ke satu project Apps Script yang terikat pada spreadsheet:

- `Code.gs`
- `DataStore.gs`
- `FinanceService.gs`
- `MasterDataService.gs`
- `Migration.gs`
- `NotificationWorker.gs`
- `PlanningService.gs`
- `RecoveryService.gs`
- `ReportsAndIntegrations.gs`
- `Router.gs`
- `Schema.gs`
- `Security.gs`
- `appsscript.json`

Jangan menyalin `README.md` ke editor.

## Spreadsheet baru

1. Isi Script Property `INTERNAL_SHARED_SECRET` dengan nilai yang sama persis seperti Vercel, minimal 32 karakter.
2. Jalankan `setupSaldoBersama()` dari editor.
3. Pastikan eksekusi selesai, `SETUP_STATUS=ready`, `SETUP_VERIFIED_AT` terisi, schema version `2`, dan 21 sheet canonical tersedia.
4. `SPREADSHEET_ID` disimpan otomatis. Jangan mengisinya manual.
5. Sheet bawaan `Sheet1` hanya dihapus otomatis bila benar-benar kosong dan schema sudah lolos validasi.
6. Login owner pertama melalui aplikasi untuk menjalankan `system.initialize` dan membuat row owner pertama di `Users`.

## Spreadsheet schema version 1

Jangan menjalankan `setupSaldoBersama()` di atas schema v1.

1. Pastikan akun editor adalah owner aktif pada sheet `Users`.
2. Jalankan `previewSchemaMigrationV2()`.
3. Hentikan bila preview menunjukkan `ambiguous > 0`; perbaiki referensi rekening/envelope/owner secara terkontrol sebelum melanjutkan.
4. Isi Script Property sementara `MIGRATION_CONFIRMATION=MIGRATE_V2`.
5. Jalankan `runSchemaMigrationV2()`; property konfirmasi langsung dihapus sebelum apply.
6. Migration membuat dan memverifikasi safety backup, mengaktifkan maintenance, menambah ownership pada recurring/budget/goal, memvalidasi schema dan integrity, lalu membuka maintenance.
7. Bila apply gagal, rollback ke safety backup diverifikasi. Bila rollback gagal, aplikasi tetap terkunci dengan `RECOVERY_REQUIRED`.

## Script Properties

- `SPREADSHEET_ID` — otomatis setelah setup.
- `INTERNAL_SHARED_SECRET` — wajib, sama dengan Vercel.
- `SETUP_STATUS`, `SETUP_DETAILS`, `SETUP_VERIFIED_AT` — otomatis.
- `MIGRATION_*` — otomatis; `MIGRATION_CONFIRMATION` hanya sementara saat migration.
- `CALENDAR_ID` — opsional sampai Calendar aktif.
- `BACKUP_FOLDER_ID` — direkomendasikan untuk backup/migration.
- `PUSH_ENDPOINT_URL` — opsional sampai Web Push aktif.

## Web App

Deploy sebagai Web App:

- Execute as: **Me / user deploying**.
- Who has access: **Anyone**.

Simpan URL yang berakhir `/exec` sebagai `APPS_SCRIPT_WEB_APP_URL`. Endpoint publik tetap dilindungi HMAC, timestamp, nonce, actor/role server-side, action allowlist, dan replay guard.

## Guard utama

- Schema/header/version validation dan fail-closed.
- Ownership `shared`/`personal` pada semua read/write terkait.
- LockService, idempotency, `row_version`, audit append-only.
- Integer rupiah, tanggal nyata, referential integrity, formula neutralization.
- Soft delete dan period closure.
- Request-scoped read cache dengan invalidation setelah write.
- Safety backup, checksum, maintenance, rollback, dan recovery manual.

Jangan mengubah schema, secret, deploy identity, atau spreadsheet binding tanpa approval, backup, migration, rollback plan, dan test DEV.

# Google Apps Script API

Folder ini adalah backend Google Apps Script untuk Google Sheets, Google Calendar, trigger terjadwal, audit, backup, import, restore, dan integrity check.

Deploy Web App dengan:

- Execute as: **Me / user deploying**.
- Who has access: **Anyone**.

Endpoint tetap dilindungi karena seluruh request aplikasi wajib membawa HMAC, timestamp, nonce, actor terverifikasi, action allowlist, dan role yang konsisten. URL Web App bukan secret.

## Setup

1. Buat spreadsheet DEV dan PROD terpisah.
2. Buka **Extensions → Apps Script** dari spreadsheet.
3. Salin seluruh file `.gs` dan `appsscript.json`.
4. Jalankan `setupSaldoBersama()` satu kali sebagai owner.
5. Isi Script Properties:
   - `SPREADSHEET_ID` — otomatis setelah setup;
   - `INTERNAL_SHARED_SECRET` — sama dengan Vercel, minimal 32 karakter;
   - `CALENDAR_ID` — ID kalender bersama;
   - `PUSH_ENDPOINT_URL` — endpoint production `/api/push`, opsional;
   - `BACKUP_FOLDER_ID` — folder Drive khusus backup, opsional.
6. Jalankan `setupScheduledTriggers()` untuk membuat trigger notifikasi harian dan backup harian.
7. Deploy Web App dan isi URL pada `APPS_SCRIPT_WEB_APP_URL` di Vercel.
8. Login owner dan jalankan health/integrity check dari aplikasi.

## Bootstrap pengguna

Action `system.initialize` hanya boleh dijalankan oleh role owner dari allowlist Vercel. Saat database baru, owner pertama dibuat pada sheet `Users`. Pengguna berikutnya dikelola melalui action owner:

- `users.list`;
- `users.upsert`;
- `users.deactivate`.

Email dan role pada sheet `Users` harus sama dengan `ALLOWED_USERS_JSON`. Ketidaksesuaian menghasilkan `ROLE_MISMATCH`.

## Guard utama

- HMAC SHA-256, timestamp, nonce, dan role server-side.
- Schema/header validation dan read-only failure untuk schema rusak.
- LockService pada write kritis.
- Idempotency dan optimistic concurrency `row_version`.
- Integer rupiah, tanggal kalender nyata, referential integrity, dan formula neutralization.
- Soft delete transaksi dan audit append-only.
- Periode tertutup, ownership transaksi, duplicate detection, serta overspend reason.
- Backup Drive sebelum import/restore dan operasi berisiko.
- Restore/import rollback bila integrity check gagal.

Jangan mengubah nama sheet/kolom tanpa approval, migration, backup, dan rollback plan.

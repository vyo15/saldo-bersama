# Google Apps Script API

Folder ini adalah backend Google Apps Script untuk Google Sheets, Google Calendar, trigger terjadwal, audit, backup, import, restore, dan integrity check.

Deploy Web App dengan:

- Execute as: **Me / user deploying**.
- Who has access: **Anyone**.

Endpoint tetap dilindungi karena seluruh request aplikasi wajib membawa HMAC, timestamp, nonce, actor terverifikasi, action allowlist, dan role yang konsisten. URL Web App bukan secret.

## Setup

1. Buat spreadsheet DEV dan PROD terpisah.
2. Buka **Extensions → Apps Script** dari spreadsheet.
3. Jalankan `node scripts/check-apps-script-syntax.mjs` pada source lokal. Gate wajib lulus untuk boot urutan alfabet dan terbalik.
4. Salin seluruh file `.gs` dan `appsscript.json`, simpan, lalu refresh editor. Pastikan dropdown menampilkan `setupSaldoBersama`; jika project gagal boot, jangan deploy.
5. Isi Script Property `INTERNAL_SHARED_SECRET` lebih dahulu dengan nilai yang sama persis seperti Vercel.
6. Jalankan `setupSaldoBersama()` sebagai owner. Setup memakai lock, menolak spreadsheet yang tidak cocok, dan baru dinyatakan berhasil setelah schema tervalidasi.
7. Pastikan Script Properties menunjukkan `SETUP_STATUS=ready` dan `SETUP_VERIFIED_AT`, lalu verifikasi seluruh 21 sheet canonical.
8. Script Properties yang digunakan:
   - `SPREADSHEET_ID` — otomatis setelah setup;
   - `INTERNAL_SHARED_SECRET` — sama dengan Vercel, minimal 32 karakter;
   - `SETUP_STATUS`, `SETUP_DETAILS`, `SETUP_VERIFIED_AT` — dikelola otomatis oleh setup;
   - `CALENDAR_ID` — ID kalender bersama;
   - `PUSH_ENDPOINT_URL` — endpoint production `/api/push`, opsional;
   - `BACKUP_FOLDER_ID` — folder Drive khusus backup, opsional.
9. Jalankan `setupScheduledTriggers()` untuk membuat trigger notifikasi harian dan backup harian setelah integrasi DEV lulus.
10. Deploy Web App dan isi URL pada `APPS_SCRIPT_WEB_APP_URL` di Vercel.
11. Login owner dan jalankan health/integrity check dari aplikasi.

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

## Recovery dan compensation

- Restore/import bersifat fail-closed dan memakai safety backup terverifikasi.
- Preview restore terikat pada checksum isi dan email owner aktif di backup.
- Ketika schema aktif rusak, restore API tidak bergantung pada sheet `Idempotency`; idempotency recovery disimpan sementara pada Script Properties.
- Pembayaran recurring, mutasi target, dan pemindahan envelope memakai compensation. Jika compensation gagal, aplikasi masuk `recovery_required`.
- Koreksi transaksi recurring/goal dilakukan melalui `recurring.reversePayment` atau `goals.reverseMovement`, bukan edit/cancel ledger umum.
- Prosedur manual tersedia di `docs/RECOVERY_RUNBOOK.md`.

Rate limit Apps Script Cache dan Vercel memory bersifat best-effort. LockService dan idempotency tetap menjadi guard integritas utama.

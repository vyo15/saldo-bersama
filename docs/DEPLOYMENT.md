# Deployment dan aktivasi production

## Resource terpisah

Gunakan Firebase, spreadsheet, Apps Script deployment, Calendar, folder backup, dan env terpisah antara DEV dan PROD.

## Runtime production

- Atur Vercel **Node.js Version** ke `24.x`.
- GitHub Actions juga memakai Node 24 dan `npm ci`.
- Jangan deploy dengan Node 20/22 lama karena baseline React Router v8 memerlukan Node 22.22 atau lebih baru dan project mengunci Node 24 LTS.

## Gate source

```bash
npm ci
npm run check
npm run zip
```

Hanya push source yang lulus gate. GitHub harus private. Jangan mengunggah ZIP manual yang berisi `.env`, `.git`, `node_modules`, atau `dist`.

## Firebase/OAuth

- Google provider aktif.
- Domain production ada pada Firebase Authorized domains.
- Origin production exact ada pada OAuth Authorized JavaScript origins.
- `VITE_GOOGLE_CLIENT_ID`, `VITE_FIREBASE_API_KEY`, dan `FIREBASE_WEB_API_KEY` benar.
- OAuth client secret tidak digunakan frontend.

## Apps Script PROD

### Spreadsheet baru

- Salin seluruh source Apps Script terbaru.
- Set `INTERNAL_SHARED_SECRET`.
- Jalankan `setupSaldoBersama()`.
- Verifikasi `SETUP_STATUS=ready`, schema v2, dan 21 sheet.

### Spreadsheet v1

- Buat backup manual tambahan.
- Jalankan preview migration.
- Pastikan `ambiguous=0`.
- Set `MIGRATION_CONFIRMATION=MIGRATE_V2`.
- Jalankan `runSchemaMigrationV2()`.
- Verifikasi `MIGRATION_STATUS=ready`, schema v2, integrity bersih, dan safety backup tercatat sebagai `pre-migration`.

Deploy Web App sebagai pemilik dengan access **Anyone**. Gunakan URL `/exec`, bukan `/dev` atau URL editor.

## Environment Vercel

Wajib production:

```text
VITE_APP_NAME
VITE_GOOGLE_CLIENT_ID
VITE_FIREBASE_API_KEY
FIREBASE_WEB_API_KEY
ALLOWED_USERS_JSON
ALLOWED_ORIGINS
SESSION_SECRET
INTERNAL_SHARED_SECRET
APPS_SCRIPT_WEB_APP_URL
```

Opsional Web Push:

```text
VITE_VAPID_PUBLIC_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

Aturan:

- `ALLOWED_ORIGINS` berisi origin exact tanpa wildcard/slash akhir.
- `SESSION_SECRET` berbeda dari `INTERNAL_SHARED_SECRET`.
- `INTERNAL_SHARED_SECRET` sama persis dengan Script Property.
- Secret yang pernah muncul di chat/ZIP/log harus dirotasi sebelum data nyata.
- Setelah env berubah, redeploy production.

## Aktivasi owner/member

1. Login owner pertama.
2. Pastikan session berhasil dan `system.initialize` hanya sekali.
3. Verifikasi row owner aktif di `Users`.
4. Tambahkan/sinkronkan member dengan role yang sama di Vercel dan Apps Script.
5. Uji akun di luar allowlist harus ditolak.

## Gate fungsi

- `/api/health` connector `ok`.
- Owner dan member mempunyai permission berbeda.
- Member tidak melihat personal user lain.
- Transfer lintas ownership ditolak.
- Income/expense/transfer/edit/cancel/reconciliation lulus.
- Double submit tidak menggandakan transaksi.
- Dashboard/report hanya memakai data visible dan kategori sebulan penuh.
- Calendar hanya menyinkronkan item shared.
- Backup verified dan integrity check lulus.
- Restore drill serta migration drill dilakukan di DEV.

## Calendar, Push, dan trigger

Calendar bersama tidak boleh memuat nominal, saldo, rekening, atau data personal. Push tidak boleh memuat rincian finansial sensitif. `setupScheduledTriggers()` baru dijalankan setelah integrasi diuji.

## Timeout dan recovery

Gateway timeout dapat berarti hasil commit belum diketahui. Retry write harus memakai idempotency key yang sama. Jangan membuka maintenance atau mengedit sheet manual ketika recovery/migration gagal. Ikuti `docs/RECOVERY_RUNBOOK.md`.

## Verifikasi deployment dan log

Setelah setiap perubahan environment variable atau source:

1. Redeploy production.
2. Buka `/api/health` dan catat `build.commitSha`, `build.deploymentId`, serta status connector.
3. Pastikan commit SHA sesuai source yang baru dipush.
4. Uji login dan bootstrap; simpan `requestId` bila gagal.
5. Cari request ID yang sama di Vercel Logs dan Apps Script Executions.

Jangan menyimpulkan environment sudah aktif hanya karena variable terlihat di Settings; deployment lama tidak otomatis memakai nilai baru.

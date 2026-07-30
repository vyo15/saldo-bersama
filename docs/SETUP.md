# Setup Saldo Bersama

Gunakan resource DEV dan PROD terpisah. Jangan menjalankan migration, import, restore, atau purge pertama kali pada data production.

## 1. Instalasi lokal

Prasyarat: Node.js 24 LTS dan npm 10 atau lebih baru. React Router v8 bersifat ESM-only dan source menggunakan package canonical `react-router`, bukan `react-router-dom`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` menjalankan frontend dan handler `api/` dalam satu proses di `http://localhost:5173`. Gunakan hostname `localhost`.

Isi root `.env.local`:

```env
VITE_APP_NAME=Saldo Bersama
VITE_GOOGLE_CLIENT_ID=
VITE_FIREBASE_API_KEY=
VITE_VAPID_PUBLIC_KEY=

FIREBASE_WEB_API_KEY=
ALLOWED_USERS_JSON=[{"email":"owner@gmail.com","role":"owner"},{"email":"pasangan@gmail.com","role":"member"}]
ALLOWED_ORIGINS=http://localhost:5173
SESSION_SECRET=
INTERNAL_SHARED_SECRET=
APPS_SCRIPT_WEB_APP_URL=
```

- `VITE_FIREBASE_API_KEY` dan `FIREBASE_WEB_API_KEY` memakai Firebase Web API key yang sama.
- `SESSION_SECRET` dan `INTERNAL_SHARED_SECRET` wajib berbeda dan minimal 32 karakter.
- Jangan memasukkan client secret OAuth atau service-account JSON.
- `.env.local` tidak boleh di-commit atau dikirim dalam ZIP.

Tes API sebelum login:

```bash
curl -i http://localhost:5173/api/session
```

Hasil normal sebelum login adalah `401 UNAUTHENTICATED`.

## 2. Firebase dan Google OAuth

1. Aktifkan Firebase Authentication → Google.
2. Buat/gunakan OAuth Web Client yang terkait project Firebase.
3. Tambahkan origin exact:
   - `http://localhost:5173`
   - domain production, misalnya `https://saldo-bersama.vercel.app`
4. Tambahkan hostname production ke Firebase Authorized domains.
5. Isi `VITE_GOOGLE_CLIENT_ID`, `VITE_FIREBASE_API_KEY`, dan `FIREBASE_WEB_API_KEY`.
6. Isi allowlist owner/member server-side pada `ALLOWED_USERS_JSON`.

## 3. Spreadsheet baru dan Apps Script

1. Buat spreadsheet kosong DEV.
2. Buka **Extensions → Apps Script**.
3. Salin 12 file `.gs` dari `apps-script/`, termasuk `Migration.gs`, serta `appsscript.json`.
4. Pastikan source lokal lulus:

```bash
node scripts/check-apps-script-syntax.mjs
```

5. Isi Script Property `INTERNAL_SHARED_SECRET` dengan nilai persis sama seperti `.env.local`/Vercel.
6. Jalankan `setupSaldoBersama()`.
7. Pastikan:
   - log eksekusi selesai;
   - `SETUP_STATUS=ready`;
   - `SETUP_VERIFIED_AT` terisi;
   - `SPREADSHEET_ID` terisi otomatis;
   - schema version `2`;
   - 21 sheet canonical tersedia.
8. Jangan membuat sheet/header atau mengisi `SPREADSHEET_ID` manual.

## 4. Spreadsheet existing schema version 1

Jangan menjalankan `setupSaldoBersama()` pada schema v1.

1. Tempel seluruh source Apps Script terbaru.
2. Pastikan editor Google yang menjalankan fungsi adalah owner aktif pada sheet `Users`.
3. Jalankan `previewSchemaMigrationV2()`.
4. Pastikan semua nilai `ambiguous` adalah `0`.
5. Buat/cek `BACKUP_FOLDER_ID` bila ingin safety backup masuk folder khusus.
6. Tambahkan Script Property sementara:

```text
MIGRATION_CONFIRMATION = MIGRATE_V2
```

7. Jalankan `runSchemaMigrationV2()`.
8. Property konfirmasi akan dihapus sebelum apply.
9. Pastikan `MIGRATION_STATUS=ready`, schema version `2`, maintenance `false`, dan integrity check bersih.
10. Bila status `rolled_back` atau `recovery_required`, jangan melanjutkan transaksi; ikuti `docs/RECOVERY_RUNBOOK.md`.

Migration berhenti sebelum backup bila ownership legacy ambigu. Jangan memaksa nilai tersebut menjadi shared; perbaiki referensi data secara terkontrol dahulu.

## 5. Deploy Apps Script Web App

1. Deploy → New deployment → Web App.
2. Execute as: **Me**.
3. Access: **Anyone**.
4. Salin URL yang berakhir `/exec`.
5. Isi `APPS_SCRIPT_WEB_APP_URL` pada `.env.local` dan Vercel.
6. Restart `npm run dev` setelah env berubah.
7. Buka `/api/health`; connector harus `ok`.

## 6. Bootstrap owner

Pada database baru, login dengan email owner yang ada pada `ALLOWED_USERS_JSON`. Frontend memanggil `system.initialize`. Apps Script memverifikasi signed role owner sebelum schema/user write, memperoleh LockService, dan hanya membuat owner pertama sekali.

Email dan role pada `Users` harus konsisten dengan allowlist Vercel. Mismatch ditolak.

## 7. Integrasi opsional

Script Properties tambahan:

- `CALENDAR_ID` — kalender bersama; hanya item shared disinkronkan.
- `BACKUP_FOLDER_ID` — folder backup/migration.
- `PUSH_ENDPOINT_URL` — URL production `/api/push`.

Environment Web Push:

- `VITE_VAPID_PUBLIC_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Jalankan `setupScheduledTriggers()` hanya setelah Calendar, backup, dan push lolos test DEV.

## 8. Quality gate

```bash
npm run check
npm run zip
```

Jangan gunakan data nyata sebelum login owner/member, personal isolation, transaksi, conflict/idempotency, backup, restore drill, migration drill bila relevan, dan integrity check lulus pada DEV.

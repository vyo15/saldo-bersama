# Setup Development dan Production

Gunakan environment terpisah untuk development dan production. Jangan menguji import, restore, migration, atau purge pada spreadsheet production.

## 1. Instalasi lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.example` hanya template nama variable dan tidak berisi secret nyata. File `.env`, `.env.local`, serta nilai secret tidak boleh di-commit atau dikirim melalui chat. Gunakan satu file root `.env.local`; file `frontend/.env.local` tidak digunakan.

`npm run dev` menjalankan Vite dan handler Node canonical pada folder `api/` dalam satu proses di `http://localhost:5173`. Development tidak menjalankan Vercel CLI dan tidak memakai rewrite atau Content Security Policy production, sehingga route HMR Vite dan React Refresh tidak terblokir. Endpoint `/api/session`, `/api/gateway`, `/api/health`, dan `/api/push` tetap memakai source handler yang sama dengan deployment Vercel. Selalu buka `http://localhost:5173`, bukan `127.0.0.1:5173`, agar OAuth origin dan cookie konsisten.

Demo lokal dapat diaktifkan dengan `VITE_DEMO_MODE=true`. Pastikan nilainya `false` pada Preview dan Production.

## 2. Firebase Authentication

1. Aktifkan provider Google pada Firebase Authentication.
2. Buat OAuth Web Client ID untuk aplikasi web.
3. Tambahkan origin berikut pada konfigurasi OAuth/Firebase:
   - `http://localhost:5173`
   - domain Preview yang benar-benar dipakai untuk pengujian;
   - domain Production Vercel.
4. Isi:
   - `VITE_GOOGLE_CLIENT_ID`;
   - `VITE_FIREBASE_API_KEY`;
   - `FIREBASE_WEB_API_KEY`.

Frontend menukar Google credential menjadi Firebase ID token melalui Firebase Auth REST. Vercel memverifikasi ID token, memeriksa email terverifikasi serta allowlist, lalu membuat cookie `HttpOnly`, `Secure` pada non-development, dan `SameSite=Strict`. Refresh token Firebase tidak disimpan di browser.

## 3. Allowlist dan master pengguna

`ALLOWED_USERS_JSON` adalah guard pertama di Vercel. Sheet `Users` adalah guard kedua di Apps Script. Email dan role wajib konsisten pada keduanya.

Contoh:

```json
[
  {"email":"owner@gmail.com","role":"owner"},
  {"email":"pasangan@gmail.com","role":"member"}
]
```

Urutan aman menambah pasangan:

1. Tambahkan email dan role ke `ALLOWED_USERS_JSON` pada Vercel.
2. Login sebagai owner.
3. Buka **Pengaturan → Anggota**.
4. Tambahkan pengguna dengan email dan role yang sama.
5. Minta pasangan login.

Jangan menurunkan atau menonaktifkan owner terakhir. Role hanya boleh persis `owner` atau `member`. Email invalid, role invalid, dan email duplikat dengan role berbeda membuat konfigurasi ditolak; tidak ada fallback diam-diam ke `member`. Role yang berbeda antara Vercel dan Sheets akan menghasilkan `ROLE_MISMATCH` dan akses ditolak.

## 4. Google Sheets dan Apps Script

1. Buat spreadsheet DEV dan PROD terpisah.
2. Buka **Extensions → Apps Script** dari spreadsheet yang benar.
3. Buat/salin file berikut dengan nama yang sama:

```text
Code.gs
DataStore.gs
FinanceService.gs
MasterDataService.gs
NotificationWorker.gs
PlanningService.gs
RecoveryService.gs
ReportsAndIntegrations.gs
Router.gs
Schema.gs
Security.gs
appsscript.json
```

4. Sebelum menyalin ke editor, jalankan `node scripts/check-apps-script-syntax.mjs`. Gate ini memeriksa syntax dan memastikan seluruh project dapat boot dalam urutan file alfabet maupun terbalik.
5. Aktifkan tampilan manifest dari **Project Settings**, lalu ganti isi `appsscript.json` dengan file canonical source.
6. Simpan seluruh file dan refresh editor. Dropdown fungsi wajib menampilkan `setupSaldoBersama`. Jika hanya `doGet`/`doPost` yang terlihat atau muncul error saat project dimuat, berhenti dan jangan deploy.
7. Isi Script Property `INTERNAL_SHARED_SECRET` dengan nilai yang sama persis seperti Vercel. Jangan memasukkan `SESSION_SECRET` ke Apps Script.
8. Jalankan `setupSaldoBersama()` dari editor Apps Script. Fungsi memakai `LockService`, menolak project yang sudah terikat ke spreadsheet lain, otomatis menyimpan `SPREADSHEET_ID`, membuat 21 sheet, header, config, proteksi dasar, lalu memvalidasi hasilnya.
9. Setelah eksekusi selesai, pastikan Script Properties berisi `SETUP_STATUS=ready` dan `SETUP_VERIFIED_AT`, lalu refresh spreadsheet dan verifikasi 21 sheet canonical. Jika `SETUP_STATUS=failed`, jangan deploy dan jangan membuat/mengubah header manual; periksa `SETUP_DETAILS` serta log eksekusi.
10. Isi property opsional setelah resource-nya siap:
   - `CALENDAR_ID` — ID kalender bersama;
   - `PUSH_ENDPOINT_URL` — URL production `/api/push`;
   - `BACKUP_FOLDER_ID` — folder Drive khusus backup, opsional tetapi direkomendasikan.
11. Deploy sebagai Web App: execute as pemilik, access **Anyone**, lalu simpan URL `/exec` pada `APPS_SCRIPT_WEB_APP_URL` di Vercel.
12. Jalankan `setupScheduledTriggers()` hanya setelah Calendar, backup, dan notifikasi telah diuji di DEV.

Jangan membuat sheet/header manual dan jangan mengisi `SPREADSHEET_ID` manual sebelum setup.

Trigger yang dibuat:

- pemeriksaan/notifikasi harian sekitar pukul 08.00 zona `Asia/Jakarta`;
- backup harian sekitar pukul 02.00 zona `Asia/Jakarta`.

Waktu Apps Script dapat bergeser. Google Calendar tetap dipakai untuk pengingat tanggal penting.

## 5. Vercel

Isi seluruh Environment Variables sesuai `.env.example`. Secret dapat dibuat dengan:

```bash
openssl rand -hex 32
```

Variable browser yang wajib:

- `VITE_GOOGLE_CLIENT_ID`;
- `VITE_FIREBASE_API_KEY`;
- `VITE_APP_NAME`;
- `VITE_DEMO_MODE=false`.

Variable server Vercel yang wajib:

- `FIREBASE_WEB_API_KEY`;
- `ALLOWED_USERS_JSON`;
- `ALLOWED_ORIGINS`;
- `SESSION_SECRET`;
- `INTERNAL_SHARED_SECRET`;
- `APPS_SCRIPT_WEB_APP_URL` setelah Web App Apps Script tersedia.

Web Push bersifat opsional dan memakai `VITE_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, serta `VAPID_PRIVATE_KEY`. `SESSION_SECRET` dan `INTERNAL_SHARED_SECRET` harus dibuat terpisah, minimal 32 karakter, dan tidak boleh memakai nilai yang sama. `INTERNAL_SHARED_SECRET` wajib disalin ke Script Properties Apps Script dengan nilai persis sama.

`ALLOWED_ORIGINS` harus berisi origin yang tepat, tanpa wildcard dan tanpa slash akhir. Gunakan origin lokal pada `.env.local`; pada Vercel Production gunakan origin production yang benar. Request POST tanpa `Origin` atau dari origin yang tidak terdaftar ditolak.

Deploy dari repository GitHub private. Output frontend telah diatur ke `frontend/dist` melalui `vercel.json`.

## 6. Kalender bersama

Buat kalender `Saldo Bersama`, bagikan ke pasangan, dan simpan Calendar ID pada Script Properties. Kalender hanya menyimpan pengingat. Ledger transaksi tetap menjadi sumber kebenaran status pembayaran, saldo, dan laporan.

Jangan menaruh nomor rekening, saldo, atau rincian sensitif pada judul/deskripsi event.

## 7. Web Push

Setelah `npm install`, buat VAPID key:

```bash
npx web-push generate-vapid-keys
```

- Public key: `VITE_VAPID_PUBLIC_KEY` dan `VAPID_PUBLIC_KEY`.
- Private key: hanya `VAPID_PRIVATE_KEY` di Vercel.
- Subject: `VAPID_SUBJECT`, misalnya `mailto:owner@gmail.com`.

Setiap browser/perangkat harus mengaktifkan izin sendiri. iPhone/iPad memerlukan aplikasi ditambahkan ke Home Screen. Kegagalan push tidak boleh menggagalkan transaksi keuangan.

## 8. Recovery dan maintenance darurat

Restore/import menyalakan `maintenance_mode` pada sheet dan guard emergency pada Script Properties. Jika operasi utama gagal, safety backup dipulihkan dan diverifikasi ulang. Jika rollback juga gagal, maintenance tetap aktif dan API mengembalikan `RECOVERY_REQUIRED` dan tetap fail-closed.

Jangan menghapus property emergency secara manual. Setelah recovery manual selesai, jalankan `releaseEmergencyMaintenanceMode` dari editor Apps Script. Fungsi itu hanya melepas maintenance jika schema dan integrity check lulus.

## 9. Verifikasi sebelum production

```bash
npm run check
npm run dev
```

Lakukan smoke test login, create/edit/cancel transaksi, transfer, alokasi, tagihan, rekonsiliasi, Calendar, notifikasi, backup, import preview, dan restore drill pada DEV. Production baru digunakan setelah integrity check lulus.

# Setup Development dan Production

Gunakan environment terpisah untuk development dan production. Jangan menguji import, restore, migration, atau purge pada spreadsheet production.

## 1. Instalasi lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` hanya menjalankan frontend. Untuk frontend dan Vercel Functions sekaligus:

```bash
npx vercel dev
```

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

Jangan menurunkan atau menonaktifkan owner terakhir. Role yang berbeda antara Vercel dan Sheets akan menghasilkan `ROLE_MISMATCH` dan akses ditolak.

## 4. Google Sheets dan Apps Script

1. Buat spreadsheet DEV dan PROD terpisah.
2. Buka **Extensions → Apps Script** dari spreadsheet.
3. Salin isi folder `apps-script/`.
4. Jalankan `setupSaldoBersama()` satu kali dari editor Apps Script.
5. Isi Script Properties:
   - `SPREADSHEET_ID` — otomatis oleh setup;
   - `INTERNAL_SHARED_SECRET` — sama dengan Vercel, minimal 32 karakter;
   - `CALENDAR_ID` — ID kalender bersama;
   - `PUSH_ENDPOINT_URL` — URL production `/api/push`, opsional;
   - `BACKUP_FOLDER_ID` — folder Drive khusus backup, opsional tetapi direkomendasikan.
6. Jalankan `setupScheduledTriggers()` setelah properties siap.
7. Deploy sebagai Web App dan simpan URL deployment pada `APPS_SCRIPT_WEB_APP_URL` di Vercel.

Trigger yang dibuat:

- pemeriksaan/notifikasi harian sekitar pukul 08.00 zona `Asia/Jakarta`;
- backup harian sekitar pukul 02.00 zona `Asia/Jakarta`.

Waktu Apps Script dapat bergeser. Google Calendar tetap dipakai untuk pengingat tanggal penting.

## 5. Vercel

Isi seluruh Environment Variables sesuai `.env.example`. Secret dapat dibuat dengan:

```bash
openssl rand -hex 32
```

Minimal:

- `SESSION_SECRET`;
- `INTERNAL_SHARED_SECRET`;
- `APPS_SCRIPT_WEB_APP_URL`;
- `ALLOWED_USERS_JSON`;
- `ALLOWED_ORIGINS`;
- Firebase key;
- VAPID key bila Web Push digunakan.

`ALLOWED_ORIGINS` harus berisi origin yang tepat. Request POST tanpa `Origin` atau dari origin yang tidak terdaftar ditolak.

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

## 8. Verifikasi sebelum production

```bash
npm run check
npx vercel dev
```

Lakukan smoke test login, create/edit/cancel transaksi, transfer, alokasi, tagihan, rekonsiliasi, Calendar, notifikasi, backup, import preview, dan restore drill pada DEV. Production baru digunakan setelah integrity check lulus.

# Setup

## 1. Runtime

Gunakan Node 24.x dan npm 10+. Jalankan `npm install` dari root workspace.

## 2. Environment

Salin `.env.example` ke `.env.local` untuk development. Isi Firebase, allowlist dua Gmail, session secret, Turso, Google bridge, jobs, dan VAPID bila dipakai. Jangan commit file tersebut.

## 3. Database

```bash
npm run db:migrate
npm run db:integrity
```

Owner pertama hanya boleh bootstrap jika tabel users dan seluruh data bisnis masih kosong serta role signed allowlist adalah owner.

## 4. Integrasi Google

Deploy Apps Script bridge, isi Script Properties, buat spreadsheet mirror, Calendar, dan folder backup. Verifikasi `integration.health` sebelum menyalakan scheduler.

## 5. PWA

- iOS: buka domain HTTPS melalui Safari, Share, Add to Home Screen.
- Android/desktop: gunakan prompt Pasang Saldo Bersama.
- Push permission hanya diminta setelah aksi pengguna.

## 6. Development

```bash
npm run dev
```

API lokal tetap membutuhkan server environment yang lengkap. `frontend` tidak boleh menerima Turso token atau bridge secret.


Saat deploy Apps Script Web App, pilih **Execute as me/deployer** dan **Anyone/anonymous**. Keamanan akses berasal dari HMAC + timestamp + nonce, bukan sesi browser Google.

# Setup

## 1. Runtime

Gunakan Node 24.x dan npm 10+. Jalankan `npm install` atau `npm ci` dari root workspace.

## 2. Onboarding

Baca `../AGENTS.md`, `PROJECT_STATUS.md`, dan `PROJECT_HANDOFF.md` sebelum mengubah source.

## 3. Environment

Buat konfigurasi lokal dari template:

```bash
cp .env.example .env.local
```

Isi `.env.local` melalui sumber rahasia yang disetujui, kemudian jalankan:

```bash
npm run env:check
# Setelah project Vercel di-link, sinkronkan Production tanpa input manual
npm run env:push:production
npm run diagnose
npm run dev
```

`npm run dev` tidak menarik environment dari Vercel. Ia akan fail closed bila `.env.local` tidak tersedia atau key wajib belum lengkap. Vercel hanya memakai scope **Production**; Preview dan Vercel Development sengaja kosong.

Daftar canonical dan pemisahan Vercel/Apps Script ada di `ENVIRONMENT_VARIABLES.md`. Jangan commit `.env.local` atau `.vercel`.

## 4. Database

```bash
npm run db:migrate
npm run db:integrity
```

Migration hanya eksplisit. Owner pertama hanya boleh bootstrap jika tabel users dan seluruh data bisnis masih kosong serta signed allowlist role adalah owner. Karena runtime lokal dan Vercel Production memakai database yang sama, jangan membuat data dummy atau menjalankan destructive operation.

## 5. Integrasi Google

Deploy Apps Script bridge, isi Script Properties, buat spreadsheet mirror, Calendar, dan folder backup. Verifikasi `integration.health` sebelum menyalakan scheduler.

Saat deploy Web App, pilih **Execute as me/deployer** dan **Anyone/anonymous**. Keamanan berasal dari HMAC + timestamp + nonce, bukan sesi browser Google.

## 6. PWA

- iOS: Safari → Share → Add to Home Screen.
- Android/desktop: gunakan prompt Pasang Saldo Bersama.
- Push permission hanya diminta setelah aksi pengguna.
- `/api/*` tidak dicache dan write offline ditolak.

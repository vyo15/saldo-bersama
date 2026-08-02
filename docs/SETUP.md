# Setup

## 1. Runtime

Gunakan Node 24.x dan npm 10+. Jalankan `npm install` atau `npm ci` dari root workspace.

## 2. Onboarding

Baca `../AGENTS.md`, `PROJECT_STATUS.md`, dan `PROJECT_HANDOFF.md` sebelum mengubah source.

## 3. Environment

Jalankan:

```bash
npm run dev
```

Jika `.env.local` belum lengkap dan terminal interaktif, bootstrap akan:

1. memeriksa login Vercel;
2. menjalankan login bila perlu;
3. menghubungkan folder ke project berdasarkan repository Git;
4. menarik Vercel **Development Environment**;
5. menyimpan `.env.local` secara lokal tanpa menampilkan secret;
6. menjalankan frontend dan lima endpoint API dalam satu proses.

Fallback manual menggunakan `.env.example`. Daftar canonical dan pemisahan Vercel/Apps Script ada di `ENVIRONMENT_VARIABLES.md`.

```bash
npm run env:check
npm run diagnose
```

Jangan commit `.env.local` atau `.vercel`.

## 4. Database

```bash
npm run db:migrate
npm run db:integrity
```

Migration hanya eksplisit. Owner pertama hanya boleh bootstrap jika tabel users dan seluruh data bisnis masih kosong serta signed allowlist role adalah owner. Karena Development dan Production saat ini berbagi database, jangan membuat data dummy atau menjalankan destructive operation.

## 5. Integrasi Google

Deploy Apps Script bridge, isi Script Properties, buat spreadsheet mirror, Calendar, dan folder backup. Verifikasi `integration.health` sebelum menyalakan scheduler.

Saat deploy Web App, pilih **Execute as me/deployer** dan **Anyone/anonymous**. Keamanan berasal dari HMAC + timestamp + nonce, bukan sesi browser Google.

## 6. PWA

- iOS: Safari → Share → Add to Home Screen.
- Android/desktop: gunakan prompt Pasang Saldo Bersama.
- Push permission hanya diminta setelah aksi pengguna.
- `/api/*` tidak dicache dan write offline ditolak.

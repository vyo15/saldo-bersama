# Setup

## 1. Runtime

Gunakan Node 24.x dan npm 10+. `npm run dev` dapat menjalankan `npm ci` otomatis ketika dependency workspace belum tersedia, tetapi `npm ci` tetap menjadi command canonical untuk CI dan quality gate.

## 2. Onboarding

Baca `../AGENTS.md`, `PROJECT_STATUS.md`, dan `PROJECT_HANDOFF.md` sebelum mengubah source.

## 3. Bootstrap lokal otomatis

Pada komputer baru:

```bash
git clone <repository-url>
cd saldo-bersama
npm run dev
```

Alur `npm run dev`:

1. Memeriksa `vite`, `react`, dan `@mantine/core` dari workspace frontend.
2. Menjalankan `npm ci` hanya bila dependency tersebut belum tersedia.
3. Memakai `.env.local` langsung bila delapan key core lengkap.
4. Bila file hilang/tidak lengkap dan terminal interaktif, menjalankan Vercel CLI melalui `npx --yes`.
5. Meminta login Vercel hanya bila sesi belum ada.
6. Menghubungkan repository ke project `saldo-bersama`; bila link otomatis gagal, membuka pemilihan project satu kali.
7. Menarik hanya **Vercel Development Environment** ke file sementara.
8. Menghapus `VERCEL_OIDC_TOKEN`, key legacy, duplikat, serta grup opsional parsial.
9. Memvalidasi delapan key core sebelum mengganti `.env.local` secara atomik.
10. Menjalankan server lokal setelah dependency dan environment valid.

File `.env.local` lama tidak diubah bila login, link, pull, sanitasi, atau validasi gagal. Terminal non-interaktif fail closed dan tidak membuka prompt.

## 4. Seed Vercel Development satu kali

Dari komputer tepercaya yang sudah memiliki `.env.local` lengkap:

```bash
npm run env:clean
npm run env:check
npm run env:push:development
```

Command tersebut mengirim key canonical ke scope **Development**, bukan Production. Nilai Development harus dapat dibaca kembali oleh collaborator Vercel yang berwenang karena dipakai oleh `vercel env pull`.

Production tetap terpisah:

```bash
npm run env:push:production
```

Setelah Production berubah, buat deployment Production baru. Preview dibiarkan kosong.

Daftar canonical dan pemisahan scope ada di `ENVIRONMENT_VARIABLES.md`. Jangan commit `.env.local` atau `.vercel`.

## 5. Database

```bash
npm run db:migrate
npm run db:integrity
```

Migration hanya eksplisit. Owner pertama hanya boleh bootstrap jika tabel users dan seluruh data bisnis masih kosong serta signed allowlist role adalah owner. Karena runtime lokal dan Vercel Production memakai database yang sama, jangan membuat data dummy atau menjalankan destructive operation.

## 6. Integrasi Google

Deploy Apps Script bridge, isi Script Properties, buat spreadsheet mirror, Calendar, dan folder backup. Verifikasi `integration.health` sebelum menyalakan scheduler.

Saat deploy Web App, pilih **Execute as me/deployer** dan **Anyone/anonymous**. Keamanan berasal dari HMAC + timestamp + nonce, bukan sesi browser Google.

## 7. PWA

- iOS: Safari → Share → Add to Home Screen.
- Android/desktop: gunakan prompt Pasang Saldo Bersama.
- Push permission hanya diminta setelah aksi pengguna.
- `/api/*` tidak dicache dan write offline ditolak.

# Saldo Bersama

Aplikasi keuangan privat untuk dua akun Google, dipakai dari ponsel, tablet, dan desktop. Turso adalah **source of truth** untuk saldo dan seluruh data finansial. Google Sheets hanya mirror laporan satu arah, Google Calendar hanya pengingat bersama, Google Drive menyimpan backup teknis, dan Excel adalah export pengguna.

## Stack

- React + Vite PWA
- Firebase Authentication dengan Google
- Vercel Functions
- Turso Database melalui HTTP pipeline resmi dari backend
- Google Apps Script integration bridge
- Google Sheets read-only mirror
- Google Calendar shared reminders
- Google Drive technical backup
- Web Push

## Prinsip integritas

- Nominal Rupiah disimpan sebagai integer.
- Saldo berasal dari saldo awal dan transaksi aktif.
- Transfer tidak dihitung sebagai pemasukan atau pengeluaran.
- Semua write finansial memakai idempotency key, transaction database, optimistic `row_version`, audit append-only, dan soft cancel.
- Frontend tidak pernah memiliki token Turso atau secret Google bridge.
- Google Sheets tidak menerima write balik ke Turso.
- Excel bukan backup recovery.
- Write offline ditolak; aplikasi tidak membuat antrean transaksi di browser.

## Menjalankan lokal

Persyaratan canonical: Node.js 24.x dan npm 10 atau lebih baru.

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Isi seluruh variable server-only pada environment lokal/Vercel. Jangan commit `.env.local`, token Turso, secret session, VAPID private key, atau Google bridge secret.

## Quality gate

```bash
npm run validate:source
npm run lint
npm run test
npm run build
npm run check
npm run zip
```

Database:

```bash
npm run db:migrate
npm run db:integrity
npm run db:import-legacy -- path/to/legacy-export.json
npm run db:import-legacy -- path/to/legacy-export.json --apply --confirm=MIGRATE_LEGACY_TO_TURSO
```

`db:import-legacy` hanya dipakai dalam workflow migrasi terkontrol. Jalankan preview/parity dan backup sebelum cutover production.

## Endpoint

- `/api/session` — login/logout session HttpOnly
- `/api/gateway` — API bisnis
- `/api/export` — download Excel
- `/api/health` — health sanitised
- `/api/jobs` — scheduled integration worker bertanda tangan

## Deployment

Urutan aman:

1. Buat database Turso DEV dan jalankan migration.
2. Konfigurasi Firebase, Vercel env, dan allowlist dua akun.
3. Deploy Apps Script bridge serta Script Properties.
4. Buat spreadsheet mirror baru dan bagikan sebagai viewer saja.
5. Uji migration/parity pada data DEV.
6. Uji backup dan restore drill.
7. Baru lakukan cutover production mengikuti `docs/DATA_MIGRATION.md`.

Dokumentasi lengkap berada di folder `docs/`.


> Mirror Google Sheets hanya memuat data `shared`. Data personal tidak pernah dikirim ke spreadsheet bersama.

# Saldo Bersama

Aplikasi keuangan privat untuk dua akun Google, dipakai dari ponsel, tablet, dan desktop. Turso adalah **source of truth** untuk saldo dan seluruh data finansial. Google Sheets hanya mirror laporan satu arah, Google Calendar hanya pengingat bersama, Google Drive menyimpan backup teknis, dan Excel adalah export pengguna.

## Mulai untuk anggota tim atau ChatGPT baru

Baca berurutan:

1. `AGENTS.md`
2. `docs/PROJECT_STATUS.md`
3. `docs/PROJECT_HANDOFF.md`
4. `docs/INDEX.md`
5. Source dan test aktual pada area task

Jangan menggunakan chat/memory sebagai source of truth ketika repository tersedia.

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
npm run dev
```

`npm run dev` memakai `.env.local` yang lengkap; bila belum ada, terminal interaktif akan login/link Vercel dan menarik **Development Environment** tanpa menampilkan secret. Gunakan `.env.example` hanya sebagai daftar canonical/fallback manual. Verifikasi:

```bash
npm run env:check
npm run diagnose
npm run db:integrity
```

Jangan commit `.env.local`, token Turso, session secret, VAPID private key, atau Google bridge secret.

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

1. Verifikasi environment canonical dan database Turso yang disetujui.
2. Jalankan migration/integrity hanya secara eksplisit.
3. Konfigurasi Firebase, allowlist, Apps Script bridge, mirror, Calendar, dan Drive.
4. Uji migration/parity, backup/restore drill, owner/member, dan smoke test.
5. Cutover mengikuti `docs/DATA_MIGRATION.md` dan `docs/RELEASE_CHECKLIST.md`.

> Mirror Google Sheets hanya memuat data `shared`. Data personal tidak pernah dikirim ke spreadsheet bersama.

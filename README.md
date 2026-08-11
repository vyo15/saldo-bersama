# Saldo Bersama

Aplikasi keuangan privat untuk dua akun Google, dipakai dari ponsel, tablet, dan desktop. Turso adalah **source of truth** untuk saldo dan data finansial. Google Sheets hanya mirror laporan satu arah, Google Calendar untuk pengingat bersama, Google Drive untuk backup teknis, dan Excel untuk export pengguna.

## Mulai untuk anggota tim atau ChatGPT baru

Baca berurutan:

1. `AGENTS.md`
2. `docs/WORKFLOW.md`
3. `docs/PROJECT_STATUS.md`
4. `docs/INDEX.md`
5. source dan test aktual pada area perubahan

Repository/source aktual selalu lebih tinggi prioritasnya daripada memory atau percakapan lama.

## Stack

- React 19 + Vite 7 PWA
- Firebase Authentication dengan Google
- Vercel Functions
- Turso Database melalui backend
- Google Apps Script integration bridge
- Google Sheets read-only mirror
- Google Calendar shared reminders
- Google Drive technical backup
- Web Push

## Prinsip integritas

- Nominal Rupiah disimpan sebagai integer.
- Saldo berasal dari saldo awal dan transaksi aktif.
- Transfer tidak dihitung sebagai pemasukan atau pengeluaran.
- Write finansial memakai idempotency, transaction database, optimistic `row_version`, audit append-only, dan soft lifecycle.
- Frontend tidak menyimpan token Turso atau secret Google bridge.
- Google Sheets tidak menulis balik ke Turso.
- Excel bukan backup recovery.
- Write offline ditolak; browser tidak mengantre transaksi finansial.

## Menjalankan lokal

Gunakan Node 24.x dan npm 10+. `.node-version` memin Node 24.18.1.

```bash
git clone <repository-url>
cd saldo-bersama
npm run dev
```

`npm run dev` menyiapkan dependency bila perlu, menarik Vercel Development Environment pada terminal interaktif, membersihkan key legacy/OIDC, memvalidasi konfigurasi canonical, lalu menjalankan frontend dan lima endpoint API lokal. Jangan commit `.env.local`, `.vercel`, token, private key, atau secret.

## Quality gate

Untuk validasi lokal setelah setiap patch, gunakan satu command canonical:

```bash
npm run verify
```

`npm run verify` melakukan preflight Node 24 dan dependency yang sudah terpasang, lalu menjalankan `npm run check`, `npm run test:guard`, dan `npm run test:browser`. Command ini **tidak menjalankan `npm ci`** dan tidak menghapus `node_modules`.

Gate penyusunnya tetap tersedia untuk diagnosis terarah:

```bash
npm run validate:source
npm run lint
npm run test
npm run build
npm run build:budget
npm run check
npm run test:guard
npm run test:browser
npm run zip
```

`npm ci` hanya dipakai untuk clone/bootstrap baru, perubahan package/lockfile, dependency hilang/rusak, atau clean runner CI. Jangan menjalankan `npm ci` sebagai kebiasaan setelah setiap patch.

## Git harian

Workflow canonical sengaja sederhana dan langsung di `main` setelah patch disetujui serta validation PASS:

```bash
git status --short
npm run verify

git add -A
git commit -m "feat: deskripsi perubahan"
git push origin main
npm run zip
```

Tidak ada lagi task card, Task ID, branch otomatis, `task:finish`, `task:check`, atau `task:list`. PR/branch tetap boleh digunakan bila user memang meminta review tambahan atau repository rules mengharuskannya, tetapi bukan workflow default.

## Database

```bash
npm run db:migrate
npm run db:integrity
npm run db:import-legacy -- path/to/legacy-export.json
npm run db:import-legacy -- path/to/legacy-export.json --apply --confirm=MIGRATE_LEGACY_TO_TURSO
```

Migration/import/restore tetap guarded dan hanya dijalankan setelah approval eksplisit, preview/backup, serta integrity check sesuai runbook.

## Endpoint

- `/api/session` — login/logout session HttpOnly
- `/api/gateway` — API bisnis
- `/api/export` — download Excel
- `/api/health` — health sanitised
- `/api/jobs` — scheduled integration worker bertanda tangan

## Deployment

Ikuti `docs/RELEASE_CHECKLIST.md`, `docs/DEPLOYMENT.md`, dan runbook terkait. Mirror Google Sheets hanya memuat data `shared`; data personal tidak dikirim ke spreadsheet bersama.

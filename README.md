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

`npm run dev` adalah mode **Development lokal**: dependency disiapkan bila perlu, Vercel Development ditarik ke `.env.local`, profile wajib `DATABASE_ENVIRONMENT=development`, Turso Development harus reachable + schema/binding siap, lalu frontend dan lima endpoint API lokal dijalankan. Server tidak lagi dibuka bila database Development salah/unreachable.

Untuk troubleshooting/setup komputer baru tanpa menyalakan server, gunakan `npm run env:pull:development`, lalu `npm run env:status`. Status hanya menampilkan marker, host database, kelengkapan, dan fingerprint publik Web Push—bukan token/private key. Setelah seed Development pusat selesai, komputer tepercaya lain tidak perlu membuat `.env.local` atau VAPID baru secara manual.

Untuk mode **Production**, gunakan `npm run prod`. Command ini tidak menarik atau menulis `.env.local`; Development hanya dibaca untuk membuktikan isolasi. Production profile, Turso Production, core `/api/health`, dan frontend shell deployment canonical `https://saldo-bersama.vercel.app` diperiksa sebelum URL dibuka. Scheduler, Google integration, backup, atau notification degradation ditampilkan sebagai operational warning tetapi tidak mematikan login/ledger bila database/schema/binding, maintenance, integrity, dan frontend core sehat. Production sengaja tidak diemulasi dengan database Production di `localhost` karena auth production memakai HTTPS + Secure HttpOnly cookie/server OAuth dan secret Vercel Sensitive tidak dapat dipull kembali.

Jangan commit `.env.local`, `.env.production.local`, `.vercel`, token, private key, atau secret.

## Quality gate

Untuk validasi lokal setelah setiap patch, gunakan satu command canonical:

```bash
npm run verify
```

`npm run verify` melakukan preflight Node 24 dan dependency yang sudah terpasang, lalu menjalankan source validation, lint/syntax, frontend regression, production build, build budget, serta seluruh backend regression dengan coverage. Guard security/governance ikut tercakup oleh suite frontend/backend sehingga tidak dijalankan dua kali. Command ini **tidak menjalankan `npm ci`** dan tidak menghapus `node_modules`.

Command harian sengaja dibuat ringkas:

```bash
npm run dev   # hanya Development lokal → auto-pull Vercel Development + Turso Development
npm run prod  # hanya jalur Production → profile lokal + Turso Production + Vercel, tanpa menulis DEV
```

Untuk pemakaian harian cukup dua command di atas. Command `verify`, `zip`, database, environment sync, dan diagnosis tetap tersedia untuk quality gate/maintenance, tetapi tidak perlu dihafal untuk penggunaan rutin.

`npm ci` hanya dipakai untuk clone/bootstrap baru, perubahan package/lockfile, dependency hilang/rusak, atau clean runner CI. Jangan menjalankan `npm ci` sebagai kebiasaan setelah setiap patch.

## Git harian

Workflow canonical repository private ini memakai `main` langsung dengan pre-push fail-closed:

```bash
git add .
git commit -m "fix: deskripsi perubahan"
git push origin main
```

Managed pre-push hook memverifikasi bahwa branch aktif/ref/SHA yang benar-benar dikirim semuanya `main`, working tree bersih, push fast-forward, lalu menjalankan full `npm run verify`. Untuk perubahan yang menyentuh database-compatibility guard (`database/migrations/`, `api/_lib/db/`, dan tooling migration/release terkait), hook tetap mewajibkan Turso Production **secara read-only** agar schema/binding kompatibel sebelum ref dikirim. Untuk perubahan non-schema seperti frontend, hook tidak membutuhkan credential Turso Production lokal dan cukup memverifikasi core Vercel Production melalui health publik. Jika satu gate gagal, push dibatalkan; push tidak pernah auto-migrate. GitHub **Quality** tetap berjalan setelah push sebagai verifikasi server-side sekunder. Jangan memakai `--no-verify` atau force push.

## Database

Development memakai `.env.local` secara default:

```bash
npm run db:migrate
npm run db:bind-environment -- development
npm run db:integrity
npm run db:import-legacy -- path/to/legacy-export.json
```

Production wajib eksplisit dan memakai `.env.production.local`:

```bash
npm run db:migrate -- production
npm run db:bind-environment -- production
npm run db:integrity -- production
```

Import Production, bila benar-benar bagian cutover yang disetujui, memakai `--environment=production` selain preview/backup/confirmation canonical. Migration/import/restore tetap guarded dan hanya dijalankan setelah approval eksplisit, preview/backup, serta integrity check sesuai runbook.

## Endpoint

- `/api/session` — login/logout session HttpOnly
- `/api/gateway` — API bisnis
- `/api/export` — download Excel
- `/api/health` — health sanitised
- `/api/jobs` — scheduled integration worker bertanda tangan

## Deployment

Ikuti `docs/RELEASE_CHECKLIST.md`, `docs/DEPLOYMENT.md`, dan runbook terkait. Mirror Google Sheets hanya memuat data `shared`; data personal tidak dikirim ke spreadsheet bersama.

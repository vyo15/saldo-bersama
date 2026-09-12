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
- Dana yang dipisahkan ke Alokasi Dana tidak membuat transaksi bank palsu: saldo rekening tetap aktual, sedangkan `Dana tersedia` mengurangi bagian yang sudah terikat. Alokasi baru dimulai Rp0; menambah/mengubah/mengarsipkan/menghapus/memulihkan Kebutuhan menyesuaikan dana Alokasi otomatis sebesar delta yang aman. Penyesuaian manual hanya dipertahankan untuk compatibility/pemulihan data lama.
- Rekonsiliasi Investasi bersifat manual. Notification Center memprioritaskan kondisi operasional aktif; rekonsiliasi saldo yang baru dikonfirmasi menjadi checkpoint sehingga selisih tetap berada di histori tanpa terus menjadi notifikasi aktif.

## Menjalankan lokal

Gunakan Node **22.15.0 atau lebih baru pada lini 22.x**, atau Node **24.x**, dengan npm 10+. `.node-version` memin **22.15.0** agar PC kantor yang masih memakai Node 22.15 dapat langsung menjalankan project. Frontend memakai `react-router` 7.18.2 agar baseline Node 22 tetap didukung.

```bash
git clone <repository-url>
cd saldo-bersama
npm run dev
```

`npm run dev` adalah mode **Development lokal**: runtime aktif harus Node 22.15.0+ pada lini 22.x atau Node 24.x; versi di luar rentang itu berhenti sebelum dependency/environment/database disentuh. Setelah runtime valid, dependency disiapkan bila perlu, refresh Vercel Development selalu dicoba, profile wajib `DATABASE_ENVIRONMENT=development`, Turso Development harus reachable + schema/binding siap, lalu frontend dan lima endpoint API lokal dijalankan. Jika Vercel login/link/pull sedang tidak tersedia tetapi `.env.local` Development yang ada sudah lengkap, cache tersebut dapat dipakai sementara; database/schema/binding tetap diverifikasi sebelum server dibuka.

Untuk troubleshooting/setup komputer baru tanpa menyalakan server, gunakan `npm run env:pull:development`, lalu `npm run env:status`. Status hanya menampilkan marker, host database, kelengkapan, dan fingerprint publik Web Push—bukan token/private key. Setelah seed Development pusat selesai, komputer tepercaya lain tidak perlu membuat `.env.local` atau VAPID baru secara manual.

Untuk mode **Production**, gunakan `npm run prod`. Runtime Production memakai environment **langsung di Vercel**; secret Sensitive tidak dipull ke workstation. Command hanya memeriksa `/api/health` dan frontend shell canonical `https://saldo-bersama.vercel.app`, lalu membuka deployment bila core sehat. Operasi database Production (`db:migrate`, `db:integrity`, `db:bind-environment`) menjalankan staged Vercel Production build dengan `--skip-domain`, sehingga `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` tetap berada di Vercel dan tidak memerlukan `.env.production.local`. `VERCEL_ENV=production` menjadi marker environment canonical bila `DATABASE_ENVIRONMENT` tidak diset; marker eksplisit yang bertentangan tetap ditolak.

Jangan commit `.env.local`, `.env.production.local`, `.vercel`, token, private key, atau secret.

## Quality gate

Untuk validasi lokal setelah setiap patch, gunakan satu command canonical:

```bash
npm run verify
```

`npm run verify` melakukan preflight runtime Node yang didukung dan dependency yang sudah terpasang, lalu menjalankan source validation, lint/syntax, frontend regression, production build, build budget, serta seluruh backend regression dengan coverage. Guard security/governance ikut tercakup oleh suite frontend/backend sehingga tidak dijalankan dua kali. Command ini **tidak menjalankan `npm ci`** dan tidak menghapus `node_modules`.

Command harian sengaja dibuat ringkas:

```bash
npm run dev   # hanya Development lokal → auto-pull Vercel Development + Turso Development
npm run prod  # cek deployment Vercel Production langsung; tidak menarik secret Sensitive ke lokal
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

Managed pre-push hook memverifikasi bahwa branch aktif/ref/SHA yang benar-benar dikirim semuanya `main`, working tree bersih, push fast-forward, lalu menjalankan full `npm run verify`. Untuk perubahan yang menyentuh database-compatibility guard (`database/migrations/`, `api/_lib/db/`, dan tooling migration/release terkait), hook menjalankan **staged Vercel Production integrity build** agar schema/binding kompatibel sebelum ref dikirim tanpa mengekspor secret database ke workstation. Untuk perubahan non-schema seperti frontend, hook tidak membutuhkan credential Turso Production lokal dan cukup memverifikasi core Vercel Production melalui health publik. Jika satu gate gagal, push dibatalkan; push tidak pernah auto-migrate. GitHub **Quality** tetap berjalan setelah push sebagai verifikasi server-side sekunder. Jangan memakai `--no-verify` atau force push.

## Database

Development memakai `.env.local` secara default:

```bash
npm run db:migrate
npm run db:bind-environment -- development
npm run db:integrity
npm run db:import-legacy -- path/to/legacy-export.json
```

Production wajib eksplisit; credential database tetap berada di Vercel dan operasi berjalan melalui staged Production build:

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

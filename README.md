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

Persyaratan canonical: Node.js 24.x dan npm 10 atau lebih baru. Repository menyertakan `.node-version` agar `fnm` memilih Node 24.18.1 secara konsisten.

Untuk Windows Git Bash, pasang dan aktifkan `fnm` satu kali:

```bash
winget install -e --id Schniz.fnm
grep -qxF 'eval "$(fnm env --use-on-cd --shell bash)"' ~/.bashrc || echo 'eval "$(fnm env --use-on-cd --shell bash)"' >> ~/.bashrc
source ~/.bashrc
fnm install 24.18.1
fnm default 24.18.1
fnm use
node -v
npm -v
```

Setelah `fnm env --use-on-cd` aktif, masuk ke folder repository akan mengikuti `.node-version` secara otomatis.

Pada clone baru cukup jalankan:

```bash
git clone <repository-url>
cd saldo-bersama
npm run dev
```

`npm run dev` melakukan preflight terjaga:

1. bila dependency workspace belum tersedia, menjalankan `npm ci`;
2. pada terminal interaktif, memeriksa login Vercel dan memastikan repository terhubung ke project `saldo-bersama`;
3. menarik **Development Environment** terbaru ke file sementara pada setiap start agar konfigurasi antar-komputer tidak drift;
4. membuang `VERCEL_OIDC_TOKEN`/key legacy, memvalidasi delapan key core dan grup Web Push yang wajib lengkap/valid, lalu mengganti `.env.local` secara atomik;
5. mempertahankan `.env.local` lama jika refresh gagal, tetapi tidak menjalankan server dengan konfigurasi yang belum diverifikasi;
6. menjalankan frontend dan lima endpoint API lokal.

Vercel Development di-seed dari komputer tepercaya. Untuk bootstrap penuh gunakan `npm run env:push:development`. Untuk perubahan Pengaturan eksternal tanpa menyentuh Turso, allowlist, Firebase, atau session gunakan command scoped:

```bash
npm run env:check
npm run env:push:development:settings
```

Command settings mewajibkan pasangan Web Push canonical dan ikut menyinkronkan Google bridge bila grup tersebut sudah diaktifkan. Setelah seed, komputer tepercaya lain cukup menjalankan `npm run dev`. Izin notifikasi browser tetap diberikan satu kali per browser/perangkat.

Production tetap disinkronkan secara eksplisit dan terpisah:

```bash
npm run env:push:production
npm run diagnose
npm run db:integrity
```

Preview tetap kosong. Jangan commit `.env.local`, `.vercel`, token Turso, session secret, VAPID private key, atau Google bridge secret. Akses ke project Vercel Development berarti akses untuk menarik secret development.

## Quality gate

```bash
npm run validate:source
npm run lint
npm run test
npm run build
npm run build:budget
npm run check
npm run test:browser
# Windows: Chrome, Edge, dan Brave dideteksi otomatis. Gunakan CHROMIUM_BIN hanya untuk lokasi khusus.
npm run clean:dry-run
npm run clean
npm run zip
```

Database:

```bash
npm run db:migrate
npm run db:integrity
npm run db:import-legacy -- path/to/legacy-export.json
npm run db:import-legacy -- path/to/legacy-export.json --apply --confirm=MIGRATE_LEGACY_TO_TURSO
```

`npm run clean` hanya menghapus output generated yang aman. Penghapusan dependency harus eksplisit melalui `npm run clean:dependencies -- --force`. `npm run zip` memvalidasi source, membuat archive sementara, memeriksa ukuran serta isi, mengganti output secara atomik, lalu menghapus hanya variasi lama `saldo-bersama-clean*.zip` yang cocok allowlist ketat. ZIP patch, backup, export, dan file lain tidak disentuh. Custom output hanya mengganti path yang diminta.

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
5. Cutover mengikuti `docs/LEGACY_SHEETS_TO_TURSO_CUTOVER.md` dan `docs/RELEASE_CHECKLIST.md`.

> Mirror Google Sheets hanya memuat data `shared`. Data personal tidak pernah dikirim ke spreadsheet bersama.

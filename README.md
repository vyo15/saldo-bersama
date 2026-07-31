# Saldo Bersama

Aplikasi web privat untuk pencatatan keuangan pribadi dan bersama. Frontend memakai React + Vite, login memakai Firebase Authentication Google, API publik berjalan di Vercel Functions, dan sumber data utama berada di Google Sheets di belakang Google Apps Script.

## Struktur canonical

- `frontend/` — React, route, UI, domain helper, dan test frontend.
- `api/` — session, authorization, gateway Apps Script, health, dan Web Push.
- `apps-script/` — business logic, Sheets, Calendar, backup, import/restore, migration, dan integrity guard.
- `docs/` — arsitektur, setup, deployment, schema, QA, dan runbook.
- `scripts/` — validasi source, syntax/boot check, local development, dan clean ZIP.

Tidak ada demo repository atau business logic paralel. Satu fungsi harus memiliki satu lokasi canonical.

## Prinsip data dan privasi

- `Transactions` adalah ledger sumber kebenaran saldo.
- Nominal rupiah disimpan sebagai integer.
- Transfer hanya di antara dua rekening dengan kepemilikan yang sama dan tidak dihitung sebagai income/expense.
- Data `shared` terlihat kedua pengguna; data `personal` hanya terlihat pemiliknya dan owner administratif.
- Scope transaksi, jadwal, budget, kantong, dan target diturunkan server-side dari referensi yang sah, bukan dipercaya dari client.
- Transaksi normal dibatalkan dengan soft delete.
- Write kritis memakai HMAC, LockService, idempotency, `row_version`, audit, dan compensation/fail-closed.
- Browser tidak pernah menulis langsung ke Google Sheets.

## Instalasi lokal

Gunakan Node.js 24 LTS. Project mengunci React 19.2.8 dan React Router 8.3.0; `react-router-dom` tidak digunakan lagi.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` menjalankan Vite dan handler canonical pada `api/` dalam satu proses di `http://localhost:5173`. Gunakan `localhost`, bukan `127.0.0.1`, agar OAuth origin dan cookie konsisten.

Konfigurasi browser dan server lokal dibaca dari satu file root `.env.local`. Hanya variable `VITE_*` yang masuk bundle browser. Jangan commit atau kirim file tersebut.

## Quality gate

```bash
npm run check
```

Perintah tersebut menjalankan source validation, lint/syntax/Apps Script boot, test, dan production build.

## Clean source ZIP

```bash
npm run zip
```

Hasil default: `../saldo-bersama-clean.zip`. `.env*`, secret, `.git`, `.vercel`, dependency, build, cache, dan arsip lama tidak disertakan.

## Schema dan migration

- Spreadsheet baru dibuat langsung dengan schema version 2 melalui `setupSaldoBersama()`.
- Spreadsheet version 1 wajib melalui preview dan migration guarded pada `apps-script/Migration.gs`.
- Jangan mengubah nama sheet/header secara manual.
- Lihat `docs/GOOGLE_SHEETS_SCHEMA.md` dan `docs/SETUP.md`.

## Deployment

GitHub harus private. Vercel menjalankan frontend/API. Firebase hanya menangani Authentication. Google Apps Script menangani authorization kedua, business logic, Sheets, Calendar, backup, migration, restore, dan integrity check.

## Diagnostik dan observability

```bash
npm run diagnose
```

Perintah tersebut memeriksa nama environment variable, validitas URL Apps Script, status schema, waktu respons, dan selisih waktu Google tanpa menampilkan secret. Runtime API dan Apps Script memakai structured log dengan `requestId` yang sama. UI menampilkan kode error dan referensi request agar log lokal, Vercel, dan Apps Script dapat dicocokkan tanpa membuka data keuangan.

Lihat `docs/OBSERVABILITY.md` untuk format log, lokasi pemeriksaan, serta prosedur troubleshooting.

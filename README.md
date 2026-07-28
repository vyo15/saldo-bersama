# Saldo Bersama

Aplikasi web privat untuk pencatatan keuangan pribadi dan bersama. Frontend memakai React + Vite, login memakai Firebase Authentication/Google, API publik berjalan di Vercel Functions, dan penyimpanan utama memakai Google Sheets di belakang Google Apps Script.

## Struktur source canonical

- `frontend/` — React + Vite, route, UI, domain helper, dan test frontend.
- `api/` — Vercel Functions untuk session, authorization, gateway, dan Web Push.
- `apps-script/` — business logic, Google Sheets, Calendar, backup, restore, dan integrity guard.
- `docs/` — arsitektur, setup, deployment, schema, QA, dan SOP.
- `scripts/` — validasi source, syntax check, dan packaging clean source.

Folder scaffold atau implementasi paralel tidak dipertahankan. Satu fungsi harus memiliki satu lokasi canonical.

## Prinsip data

- Satu ledger transaksi menjadi sumber kebenaran saldo.
- Nominal rupiah disimpan sebagai integer.
- Transfer internal tidak dihitung sebagai pemasukan/pengeluaran.
- Alokasi/kantong tidak sama dengan pengeluaran.
- Transaksi normal memakai soft delete.
- Write kritis memakai idempotency, row version, audit, dan LockService.
- Google Sheets tidak ditulis langsung dari browser.

## Instalasi

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` menjalankan frontend. Untuk menguji Vercel Functions secara lokal gunakan Vercel CLI:

```bash
npx vercel dev
```

Demo UI lokal dapat diaktifkan hanya untuk development dengan `VITE_DEMO_MODE=true`. Demo mode tidak boleh diaktifkan pada production.

## Quality gate

```bash
npm run check
```

## Membuat ZIP source bersih

```bash
npm run zip
```

Hasil default dibuat satu tingkat di atas folder project dengan nama `saldo-bersama-clean.zip`. Dependency, hasil build, cache, `.git`, arsip lama, environment lokal, dan credential tidak disertakan. Path output khusus dapat diberikan setelah `--`, misalnya `npm run zip -- ../backup/saldo-bersama-source.zip`.

## Dokumentasi

- `docs/ARCHITECTURE.md`
- `docs/GOOGLE_SHEETS_SCHEMA.md`
- `docs/SETUP.md`
- `docs/QA_CHECKLIST.md`
- `docs/RECOVERY_RUNBOOK.md`
- `docs/GIT_WORKFLOW.md`
- `apps-script/README.md`

## Deployment

Source disimpan di GitHub private dan production di-deploy ke Vercel. Firebase project hanya menangani Authentication. Google Apps Script menangani Sheets, Calendar, trigger, audit, backup, dan integrity check.

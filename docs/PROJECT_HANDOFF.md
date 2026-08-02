# Project Handoff

**Updated:** 2026-08-02  
**Task:** Production-only Environment Synchronization  
**Status:** Implemented in source; lihat hasil test pada bagian Validasi.

## Tujuan task

Menyelaraskan source, test, onboarding, dan dokumentasi dengan keputusan operasional terbaru:

- Vercel hanya memakai scope Production;
- Vercel Preview dan Development sengaja kosong;
- runtime lokal hanya membaca `.env.local`;
- runtime lokal dan Vercel Production mengakses satu database Turso yang sama;
- tidak ada bootstrap otomatis yang menarik secret dari Vercel.

## Perubahan utama

- `.env.example`, README, setup, deployment, architecture, status, ADR, migration, recovery, QA, dan test plan diselaraskan ke kebijakan Production-only.
- `scripts/bootstrap-development-env.mjs` disederhanakan menjadi local-only guard yang fail closed bila `.env.local` hilang atau tidak lengkap.
- Logic login/link/pull Vercel Development dan pembersihan OIDC sementara dihapus karena tidak lagi digunakan.
- `sanitizePulledEnvironment` yang tidak lagi dipakai dihapus.
- Contract test baru mencegah kebijakan `Development + Production` atau `vercel env pull` kembali tanpa review.
- Restore/migration drill tetap wajib memakai salinan terisolasi sementara, bukan database aktif dan bukan database Development permanen.

## Guarded area

Task ini tidak mengubah:

- schema atau data Turso;
- auth, role, session, dan authorization runtime;
- action/API contract;
- saldo, transfer, audit, idempotency, dan `row_version`;
- backup/restore implementation;
- dependency;
- nilai environment atau secret pengguna.

## Validasi

Hasil aktual pada patch sinkronisasi environment:

```text
Runtime pemeriksaan: Node 22.16.0 / npm 10.9.2
Project canonical: Node 24.x / npm >=10

npm run validate:source: LULUS — 218 file; 5/12 Vercel Functions canonical
npm run test: LULUS — frontend 27/27; API/database/governance 66/66
node scripts/check-node-syntax.mjs: LULUS — 50 file
node scripts/check-apps-script-syntax.mjs: LULUS — 6 file/2 load order
npm run lint: BELUM TERVERIFIKASI — archive bersih tidak membawa node_modules/eslint
npm run build: BELUM TERVERIFIKASI — archive bersih tidak membawa dependency Vite/Rollup
```

## Unresolved

- Sembilan environment core masih perlu dipastikan terpasang pada Vercel Production dan diverifikasi melalui deployment baru.
- Google bridge dan Web Push tetap opsional serta belum dikonfigurasi penuh.
- GitHub ruleset/branch protection harus diverifikasi di dashboard.
- Runtime lokal dan Vercel Production memakai satu Turso database; data dummy dan destructive testing dilarang.

## Next safe step

Terapkan patch, jalankan quality gate pada Node 24, sinkronkan `.env.local` ke Vercel Production tanpa Preview/Development, deploy ulang, lalu verifikasi `/api/health`, login, dan `POST /api/gateway`.

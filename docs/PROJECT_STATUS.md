# Project Status

Dokumen ini adalah snapshot kondisi project sekarang, bukan jurnal perubahan.

## Runtime canonical

- **Frontend:** React 19 + Vite 7 PWA.
- **Backend:** Vercel Functions.
- **Database/source of truth:** Turso/SQLite HTTP pipeline.
- **Auth:** Firebase Authentication Google + server session/authorization.
- **Google integration:** Apps Script bridge; Sheets mirror satu arah, Calendar reminder bersama, Drive backup teknis.
- **Active schema contract:** v7.
- Runtime lokal dan Vercel Production dirancang memakai database Turso bersama; operasi destructive/migration tetap guarded.

## Workflow saat ini

- Source terbaru + test aktual adalah sumber kebenaran.
- Tidak ada task card/Task ID/branch automation sebagai workflow wajib.
- Quality gate utama: `npm run check`; frontend/browser ditambah `npm run test:browser`.
- Setelah PASS: `git add -A`, commit, dan `git push origin main`.
- `npm run zip` membuat clean source canonical fail-closed.
- Guarded/high-risk tetap membutuhkan approval eksplisit sebelum coding/operation.

## Open operational risks

1. Repository tidak membuktikan seluruh setting Production/GitHub/Vercel; verifikasi operasional tetap diperlukan.
2. Production schema/runtime parity dan resource Google nyata harus diverifikasi melalui runbook.
3. Real-device Web Push dan restore drill memerlukan evidence operasional bila belum dilakukan.
4. Secret rotation mengikuti runbook; secret tidak boleh disalin ke chat/ZIP/source.

# Project Status

**Updated:** 2026-08-09
**Active schema contract:** v7
**Current workflow:** solo-user + multi-tab ChatGPT dengan team `COORD/FE/BE`.

Dokumen ini hanya menjawab kondisi project sekarang. Histori perubahan berada di Git/PR/`CHANGELOG.md`; progress pekerjaan berada di `docs/tasks/active/`. Dokumen ini tidak lagi menjadi jurnal task.

## Runtime architecture

- Frontend: React + Vite.
- Backend: lima Vercel Functions canonical (`gateway`, `export`, `health`, `jobs`, `session`).
- Authentication: Firebase Authentication dengan Google; backend tetap memverifikasi session/token dan authorization.
- Source of truth finansial: Turso. Google Sheets hanya mirror satu arah.
- Google Apps Script: bridge Sheets/Calendar/Drive dan scheduler, bukan database utama.
- Runtime canonical: Node 24.x.

## Data and integrity state

- Schema canonical tetap v7.
- Nominal Rupiah integer.
- Saldo berasal dari saldo awal + transaksi aktif; transfer tidak dihitung sebagai pemasukan/pengeluaran.
- Write finansial memakai server-side authorization, idempotency, transaction/optimistic versioning, audit, dan soft lifecycle sesuai source/contract.
- Runtime lokal dan Vercel Production dirancang memakai database Turso bersama. Jangan menjalankan destructive/dummy operation pada database nyata.

## Workflow current state

- Team hanya `COORD`, `FE`, `BE`.
- Banyak task/tab boleh aktif selama branch dan `Write Scope` berbeda.
- Normal task diselesaikan lokal melalui `npm run task:finish`.
- Guarded/HIGH/CRITICAL tetap memerlukan approval eksplisit; setelah approved memakai local validation + task:finish yang sama. PR hanya pengecualian.
- `npm run zip` menyaring secret/dependency/build tetapi tidak lagi berhenti hanya karena root file/folder diagnosis non-canonical.
- COORD mengatur prioritas, scope conflict, dan rekomendasi next step.

## Open operational risks

1. Source repository tidak membuktikan seluruh setting Production/GitHub/Vercel; verifikasi operasional tetap diperlukan.
2. Production schema/runtime parity dan resource nyata harus diverifikasi melalui runbook.
3. Real-device Web Push dan restore drill tetap memerlukan evidence operasional bila belum dilakukan.
4. Secret rotation tetap harus mengikuti runbook; jangan menyalin secret ke task card/chat/ZIP.

## Next safe steps

1. Selesaikan task aktif berdasarkan `npm run task:list`.
2. Jangan paralelkan task yang `Write Scope`-nya overlap.
3. Untuk normal task gunakan `npm run task:finish -- "<commit message>"`.
4. Untuk guarded/high-risk, pastikan Guard Approval APPROVED dan evidence validation tersedia sebelum task:finish mengubah main.

# Project Status

**Updated:** 2026-08-09
**Repository baseline before active governance task:** `main@e9b818f1a0f929b80d6f823a419a2ad741ac5304`
**Active schema contract:** v7
**Current governance task:** `SB-001` (`COORD`, `READY_FOR_QA`)

Dokumen ini hanya menjawab kondisi project sekarang. Histori perubahan berada di Git/PR/`CHANGELOG.md`; progress pekerjaan berada di `docs/tasks/active/`.

## Runtime architecture

- Frontend: React 19.2.8 + Vite 7.1.2 + React Router 8.3.0 + Mantine 9.5.0.
- Backend: lima Vercel Functions canonical (`gateway`, `export`, `health`, `jobs`, `session`).
- Authentication: Firebase Authentication dengan Google; backend tetap memverifikasi session/token dan authorization.
- Source of truth finansial: Turso. Google Sheets hanya mirror satu arah.
- Google Apps Script: bridge untuk Sheets/Calendar/Drive dan scheduler, bukan database utama.
- PWA/Web Push tersedia pada source.
- Runtime canonical: Node 24.x, `.node-version` = 24.18.1.

## Data and integrity state

- Schema canonical adalah v7, dibentuk oleh migration `001` sampai `005`; `005_notification_preferences.sql` adalah migration terakhir saat snapshot ini.
- Nominal Rupiah tetap integer.
- Saldo tetap berasal dari saldo awal + transaksi aktif; transfer tidak dihitung sebagai pemasukan/pengeluaran.
- Write finansial tetap menggunakan server-side authorization, idempotency, transaction/optimistic versioning, audit, dan soft lifecycle sesuai contract source.
- Runtime lokal dan Vercel Production dirancang memakai database Turso bersama sesuai keputusan project. Jangan membuat data dummy/destructive operation pada database nyata.

## Current delivery state

- Workflow lama berbasis satu global handoff sudah dimigrasikan melalui `SB-001` ke task-driven multi-team workflow; task kini menunggu QA canonical Node 24 sebelum merge.
- Setelah `SB-001`, progress/handoff harus berada pada satu task card per pekerjaan; `PROJECT_STATUS.md` tidak lagi menjadi jurnal task.
- Product roadmap, implementation matrix, dan RFC Proposed tetap menjadi sumber rencana produk. Governance migration ini tidak mengubah product scope atau RFC status.

## Open operational risks

1. Source repository tidak dapat membuktikan keadaan dashboard Production, branch protection/ruleset, GitHub Security settings, atau Vercel dashboard settings. Verifikasi operasional tetap diperlukan.
2. Production schema/runtime cutover v7 dan kondisi resource nyata harus diverifikasi melalui runbook; source saja tidak cukup untuk menyatakan Production sudah sinkron.
3. Real-device Android/iOS Web Push dan restore drill pada resource nyata tetap perlu bukti operasional bila belum dilakukan setelah baseline terakhir.
4. Rate limit runtime masih best-effort per instance sesuai architecture saat ini.
5. Backup teknis memiliki checksum/compression, tetapi application-level encryption bukan baseline yang terbukti.
6. Snapshot lama mencatat ZIP manual pernah memuat `.env.local`; rotasi `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` harus dianggap masih diperlukan sampai ada bukti operasional bahwa rotasi sudah selesai. Jangan menyalin secret ke task card/chat.
7. Sandbox task `SB-001` berjalan pada Node 22.16.0, bukan Node 24 canonical. Hasil Node-24-only tetap harus diverifikasi pada environment canonical.

## Current validation evidence

Baseline sebelum patch `SB-001` pada sandbox:

```text
npm run validate:source: PASS — 375 file canonical diperiksa
node --test test/governance/governance-docs.test.js test/governance/quality-structure.test.js: PASS — 17/17
```

Hasil patch `SB-001` diperbarui pada task card. Jangan menyalin seluruh log test ke dokumen ini.

## Next safe steps

1. `SB-001` sudah `READY_FOR_QA`. Jalankan `npm ci`, `npm run check`, dan `npm run test:browser` pada Node 24 canonical dengan dependency yang di-install untuk platform tersebut.
2. Jika QA canonical PASS, isi hasil QA/integration pada task card dan pindahkan `SB-001` ke `READY_FOR_MERGE`.
3. Setelah merge dan post-merge verification PASS, pindahkan task card ke archive dan gunakan `npm run task:list` untuk recommended next.
4. Verifikasi risiko operasional Production melalui runbook, terutama secret rotation, schema/runtime parity, real-device Web Push, dan restore drill.

## Cara melanjutkan

Baca `../AGENTS.md`, `WORKFLOW.md`, `tasks/README.md`, task card aktif yang relevan, lalu source/test aktual. Jika user bertanya “kurang apa?” atau “harus kerjakan yang mana dulu?”, gunakan task registry/dependency graph, bukan memory chat.

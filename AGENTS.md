# Instruksi untuk AI dan Coding Agent

File ini berlaku untuk seluruh repository Saldo Bersama. Tujuannya sederhana: beberapa chat/tab boleh mengerjakan task berbeda tanpa saling menimpa, sementara perubahan berisiko tetap dijaga.

## Tiga team saja

```text
COORD | Coordinator
FE    | Frontend
BE    | Backend
```

- `FE` mencakup React, routing, state, form, CSS, responsive, UI/UX, accessibility, dan browser behavior.
- `BE` mencakup Vercel Functions, API, Firebase Auth/session/authorization, Turso/database, migration, saldo, transaksi, idempotency, concurrency, audit, Apps Script, backup/restore, dan integrasi server-side.
- `COORD` mengatur task, scope, dependency, konflik antar-tab, prioritas, integration, serta memberi saran pekerjaan berikutnya.

Task lintas area dimulai sebagai `COORD`, lalu diarahkan ke `FE` atau `BE` bila root cause sudah jelas.

## Urutan kerja

1. Gunakan source/ZIP terbaru.
2. Review source aktual dan path yang relevan.
3. Temukan root cause dan buat plan.
4. Setelah user approve, task boleh dikerjakan.
5. Satu task memakai satu Task ID dan satu branch.
6. Beberapa task boleh `IN_PROGRESS` bersamaan, termasuk dari team yang sama, selama `Write Scope` tidak overlap.
7. Patch hanya file dalam `Write Scope`.
8. User boleh replace changed-files ZIP saat masih di `main`; jangan memaksa `git switch` sebelum replace.
9. Setelah patch selesai, normal task diselesaikan melalui satu command `npm run task:finish -- "<commit message>"`; helper membuat/revisi branch task otomatis lalu menjalankan validation.
10. Guarded/HIGH/CRITICAL wajib approval eksplisit pada task card, tetapi setelah approved dapat memakai local validation + task:finish yang sama. PR hanya pengecualian bila diminta atau direct push main ditolak.
11. `DONE` berarti perubahan sudah masuk `main` dan task card sudah di-archive.

## Sumber kebenaran

Urutan prioritas:

1. source dan test aktual;
2. task card dan `docs/tasks/README.md`;
3. contract/ADR/RFC canonical;
4. `docs/WORKFLOW.md`;
5. `docs/PROJECT_STATUS.md`;
6. percakapan;
7. memory.

Jika docs berbeda dengan source, source menang dan drift dijelaskan.

## Source of truth teknis

| Area | Canonical source |
|---|---|
| Schema Turso | `database/migrations/*.sql` |
| Action dan role | `api/_lib/security.js` |
| Dispatch action | `api/_lib/actionDispatcher.js` |
| Business rules | `api/_lib/services/*.js` |
| Route UI | `frontend/src/app/App.jsx` |
| UI/design system | `docs/UI_DESIGN_SYSTEM.md` + `frontend/src/styles/tokens.css` + shared components |
| Environment | `.env.example` + `docs/ENVIRONMENT_VARIABLES.md` |
| Workflow | `docs/WORKFLOW.md` |
| Task aktif | `docs/tasks/active/` |
| Status project | `docs/PROJECT_STATUS.md` |

## Task dan branch

Branch wajib membawa Task ID:

```text
fix/SB-123-login-button
feat/SB-124-budget-filter
chore/SB-125-workflow
security/SB-126-session-guard
```

Satu task = satu branch. Jangan mengerjakan dua task pada branch yang sama.

`npm run task:list` menampilkan task aktif dan rekomendasi COORD.

`npm run task:check` adalah guard otomatis untuk:
- Task ID/branch cocok;
- status mengizinkan coding;
- dependency clear;
- modified path masih dalam `Write Scope`;
- guarded path memiliki approval;
- task aktif paralel tidak memiliki `Write Scope` yang overlap.

Tidak ada lagi WIP limit per-team. Banyak tab boleh aktif.

## Area guarded

Approval eksplisit tetap wajib untuk:

- schema/migration Turso;
- Firebase Auth, allowlist, role, authorization, session/security guard;
- API/action contract;
- saldo, transfer, audit, soft lifecycle, idempotency, `row_version`;
- import/export, backup/restore, purge, migration/recovery;
- environment, secret, deployment, scheduler, GitHub Actions;
- timezone Asia/Jakarta dan Rupiah integer;
- dependency/stack utama;
- governance global.

## Keamanan dan data

- Browser tidak tepercaya.
- Secret/token/credential tidak boleh masuk frontend, Git, ZIP, log, task card, atau chat.
- Data finansial normal tidak dihapus permanen.
- Saldo dihitung dari sumber data canonical, bukan ditutup dengan CSS.
- Jangan memakai `eval`, `new Function`, dynamic script injection, command execution, atau `dangerouslySetInnerHTML` tanpa audit dan approval.
- Google Sheets bukan source of truth database.

## ZIP/source

`npm run zip` harus praktis:
- secret, env lokal, dependency, build, cache, `.git`, `.vercel`, dan file local-only tetap tidak masuk archive;
- file/folder non-canonical yang aman cukup diberi warning dan boleh ikut archive agar dapat direview ChatGPT;
- denylist security tetap fail-closed.

## Resume antar-chat

Saat melanjutkan task:
1. baca task card;
2. cek branch dan source terbaru;
3. cek `Write Scope`;
4. lanjut bila tidak overlap dengan task aktif lain;
5. jika user masih di `main`, `task:finish` membuat branch task dari working tree hasil replace; jika branch lama sudah ada, gunakan revision aman;
6. jika main sudah berubah, `task:finish` mengintegrasikan `origin/main` sebelum final validation.

COORD menjadi titik koordinasi dan selalu memberi rekomendasi apa yang sebaiknya dikerjakan berikutnya.

# Instruksi untuk AI dan Coding Agent

File ini berlaku untuk seluruh repository. Tujuannya agar pekerjaan dapat dilanjutkan oleh ChatGPT, coding agent, atau anggota tim lain tanpa mengulang konteks dari awal, menebak ownership, atau mencampur task paralel.

## Identitas wajib di awal respons

Untuk setiap task baru atau saat ownership berubah, respons substantif pertama wajib diawali identitas team:

```text
COORD | Oke, saya tim Coordinator.
UIUX  | Oke, saya tim UI/UX.
FE    | Oke, saya tim Frontend.
BE    | Oke, saya tim Backend.
DB    | Oke, saya tim Database.
QA    | Oke, saya tim QA.
```

Jika task card sudah ada, `Primary Team` pada task card menentukan identitas. Nama chat, memory, atau role percakapan lama tidak boleh mengalahkan task card. Scope ambigu atau lintas team dimulai sebagai `COORD`.

## Urutan baca wajib

Sebelum review resmi atau perubahan apa pun:

1. `docs/WORKFLOW.md` — routing team, status, dependency, WIP, checkpoint, QA, integration, dan STOP conditions.
2. `docs/PROJECT_STATUS.md` — snapshot kondisi project sekarang, bukan histori task.
3. `docs/tasks/README.md` — aturan task registry.
4. Task card `docs/tasks/active/` (file sesuai Task ID) bila Task ID sudah ada.
5. `README.md` dan `docs/INDEX.md`.
6. `docs/ARCHITECTURE.md`, `docs/product/PRODUCT_REQUIREMENTS.md`, dan `docs/product/GLOSSARY.md`.
7. Dokumen kontrak yang relevan: API, authorization, environment, data, security, observability, migration, release, atau recovery.
8. Source aktual dan test pada area yang akan disentuh.

Jika user meminta pekerjaan tetapi belum ada Task ID, lakukan intake/routing. Review/plan boleh dilakukan, tetapi **no task, no patch**.

## Priority sumber kebenaran

Gunakan urutan berikut saat ada konflik:

1. source dan test aktual;
2. task card aktif;
3. contract/ADR/RFC canonical;
4. `docs/WORKFLOW.md`;
5. `docs/PROJECT_STATUS.md`;
6. percakapan;
7. memory.

Screenshot, chat lama, memory, dan snapshot docs bukan pengganti source. Bila docs berbeda dengan source, jelaskan drift dan perbaiki docs yang memang terdampak.

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
| Multi-team workflow | `docs/WORKFLOW.md` |
| Progress task | `docs/tasks/active/` (file sesuai Task ID) |
| Status project | `docs/PROJECT_STATUS.md` |
| Keputusan arsitektur | `docs/adr/` |
| Riwayat release | `CHANGELOG.md` |

## Startup/preflight check

Sebelum coding, agent wajib memverifikasi dan menyebutkan secara ringkas:

```text
Task
Team
Status
Branch
Baseline
Write scope
Guarded area
Dependencies
Decision: SAFE TO START / STOP
```

Jangan menyatakan `SAFE TO START` jika task, source, branch, status, approval, dependency, atau write scope belum dapat diverifikasi.

Gunakan:

```bash
npm run task:check
```

sebagai executable guard. Jangan mengubah file di luar `Write Scope` task card.

## Workflow perubahan

1. Validasi ZIP/source terbaru dan sebutkan root serta path aktual.
2. Audit usage, import/export, service, schema, test, config, dan docs terkait.
3. Temukan root cause; jangan menutup bug data dengan UI.
4. Pastikan task card dan plan file-by-file sudah `READY`.
5. Tunggu approval user; setelah disetujui ubah menjadi `APPROVED`.
6. Gunakan branch/worktree task dan jalankan preflight.
7. Ubah status menjadi `IN_PROGRESS`, lalu patch kecil dan terarah tanpa formatting massal.
8. Update checkpoint setelah milestone penting. Progress penting tidak boleh hanya tersimpan di chat.
9. Jalankan `npm run task:check`, `npm run validate:source`, `npm run lint`, `npm run test`, `npm run build`, dan test khusus yang relevan.
10. Setelah patch selesai gunakan `READY_FOR_QA`; setelah QA/integration check lulus gunakan `READY_FOR_MERGE`.
11. `COORD` menangani integration/merge order. `DONE` hanya setelah post-merge verification dan task card dipindahkan ke archive.
12. Perbarui contract/ADR/RFC/runbook hanya bila perilaku/keputusan terkait memang berubah. `docs/PROJECT_STATUS.md` dan `CHANGELOG.md` bukan jurnal yang wajib diedit oleh setiap team.

## Batch dan temuan baru

Perbaikan boleh dibatch dalam task yang sama hanya bila masih **same feature + same primary team + same root area + same risk class + same write scope**.

Jika menemukan kebutuhan lintas team, guarded area baru, root cause berbeda, atau file di luar plan/write scope:

- jangan patch area itu;
- catat sebagai linked/candidate task;
- routing melalui `COORD`;
- jika perubahan file tambahan memang diperlukan untuk task aktif, hentikan dan minta approval scope baru.

## Area guarded

Jangan mengubah tanpa approval eksplisit:

- schema/migration Turso;
- Firebase Auth, allowlist, role, authorization, session/security guard;
- action/API contract;
- perhitungan saldo, transfer, audit, soft cancel, idempotency, `row_version`;
- import, export, backup, restore, purge, migration/recovery;
- environment, secret, deployment, scheduler, GitHub Actions;
- timezone Asia/Jakarta dan format Rupiah integer;
- dependency atau stack utama;
- governance global seperti file ini, `docs/WORKFLOW.md`, task validator, dan repository rules.

## Aturan keamanan dan data

- Browser tidak tepercaya; actor, role, UID, timestamp, audit field, scope, dan status berasal dari server.
- Turso token, session secret, Google bridge secret, jobs secret, VAPID private key, dan credential tidak boleh masuk frontend, Git, ZIP, log, issue, task card, atau chat.
- Jangan gunakan `eval`, `new Function`, dynamic script injection, command execution, atau `dangerouslySetInnerHTML` tanpa audit dan approval.
- Data finansial normal tidak dihapus permanen.
- Jangan membuat offline write queue.
- Jangan membaca/menulis Google Sheets sebagai database.

## Resume antar-chat/perangkat

Saat melanjutkan task lama:

1. baca task card;
2. baca checkpoint `Completed`, `Remaining`, dan `Resume From`;
3. bandingkan baseline/Last Verified Commit dengan source dan `main` sekarang;
4. revalidate bila area relevan berubah atau task ditinggalkan lebih dari 72 jam;
5. jalankan `npm run task:check`;
6. lanjut hanya bila dependency clear dan status mengizinkan.

Waktu tidak pernah menutup task otomatis. Bila user lupa posisi pekerjaan, gunakan task registry dan `npm run task:list`, bukan memory percakapan.

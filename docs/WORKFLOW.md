# Workflow Saldo Bersama

Workflow ini dibuat untuk satu user yang bekerja bersama beberapa tab/chat ChatGPT. Tujuannya bukan meniru proses perusahaan besar, tetapi menjaga task paralel tetap terpisah dan mencegah perubahan berisiko masuk diam-diam.

## Team

| Code | Cakupan |
|---|---|
| `COORD` | Task intake, prioritas, scope, dependency, konflik antar-tab, integration, governance, rekomendasi next step |
| `FE` | React, routing, state, form, CSS, responsive, UI/UX, accessibility, browser behavior |
| `BE` | API/backend, Firebase Auth/session/authorization, Turso/database, migration, saldo, transaksi, audit, concurrency, Apps Script, backup/restore, integrasi server-side |

Tidak ada team `UIUX`, `DB`, atau `QA` terpisah. Tanggung jawab tersebut masuk ke `FE`, `BE`, dan validation oleh owner/COORD.
Task lintas FE+BE boleh dikemas sebagai satu task integrasi `COORD` hanya setelah user menyetujui satu paket gabungan; `Write Scope` tetap eksplisit dan tidak boleh overlap dengan task aktif lain.

## Status task

Status canonical hanya:

```text
DRAFT
APPROVED
IN_PROGRESS
ON_HOLD
DONE
```

- `DRAFT`: sedang direview/direncanakan, belum boleh coding.
- `APPROVED`: plan sudah disetujui dan siap dikerjakan.
- `IN_PROGRESS`: sedang dikerjakan.
- `ON_HOLD`: berhenti karena dependency/kendala.
- `DONE`: sudah masuk `main` dan task card di archive.

Tidak ada lagi `READY`, `READY_FOR_QA`, atau `READY_FOR_MERGE`.

## Task paralel

Banyak task boleh berjalan bersamaan, termasuk dari team yang sama.

Syaratnya:

```text
TASK ID BERBEDA
+ BRANCH BERBEDA
+ WRITE SCOPE TIDAK OVERLAP
```

Contoh aman:

```text
SB-101 FE  -> frontend/src/features/login/**
SB-102 FE  -> frontend/src/features/accounts/**
SB-103 BE  -> api/_lib/services/reporting.js
```

Contoh harus bergantian:

```text
SB-104 FE -> frontend/src/features/login/**
SB-105 FE -> frontend/src/features/login/LoginPage.jsx
```

Validator menolak overlap untuk task `APPROVED`/`IN_PROGRESS`.

Jika dua patch tetap bertemu file yang sama karena `main` berubah, `task:finish` menggabungkan `origin/main` ke branch task terlebih dahulu. Konflik berhenti di branch task dan tidak menyentuh `main`.

## Task card minimal

Task card berada di:

```text
docs/tasks/active/SB-123.md
```

Field wajib hanya:
- Task ID
- Status
- Priority
- Team
- Depends On
- Risk
- Guarded
- Guard Approval
- Branch
- Base
- Updated
- Write Scope

Section lain dipakai hanya bila membantu resume.

## Flow kerja normal

```text
REQUEST
  -> COORD review source
  -> task + plan
  -> user approve
  -> APPROVED / IN_PROGRESS
  -> user replace changed-files ZIP saat masih di main
  -> task:finish membuat branch task otomatis
  -> local validation
  -> merge lokal ke main
  -> push main
  -> archive task
```

Setelah file patch/changed-files ZIP sudah di-replace saat masih di `main`, normal task cukup:

```bash
npm run task:finish -- "fix(SB-123): deskripsi perubahan"
```

Script menangani:
1. verifikasi runtime Node sesuai major canonical pada `.node-version`;
2. baca Task ID dari commit message;
3. bila command dijalankan dari `main`, buat branch task otomatis dari working tree hasil replace;
4. jika nama branch sudah terpakai, pilih revision aman `-r2`/`-r3`;
5. fetch `origin/main` dan validasi task/scope;
6. `git add -A` dan commit;
7. merge `origin/main` ke branch task;
8. jika dependency-sensitive file (`package.json`, `frontend/package.json`, `package-lock.json`, atau `.npmrc`) berubah, jalankan clean `npm ci`; lalu `npm run check` + guard regression; browser test juga wajib bila task menyentuh `frontend/**`, `test/browser/**`, atau browser build helper, termasuk task integrasi milik COORD;
9. push branch sebagai backup;
10. merge task ke `main`;
11. push `main`;
12. archive task;
13. hapus branch revision yang selesai bila aman dan berakhir di `main`;
14. normalisasi metadata closure task (`Status=DONE`, Acceptance Criteria checked, `Remaining/Resume From` selesai, canonical validation evidence) lalu archive;
15. jalankan `npm run zip` otomatis agar clean source terbaru siap di-upload.

Jika direct push ke `main` ditolak repository rules atau `origin/main` berubah pada saat terakhir, script mengembalikan `main` lokal ke kondisi remote lalu kembali ke branch task. Pekerjaan tidak hilang dan command yang sama dapat diulang setelah kondisi stabil.

## Guarded/high-risk

Backend runtime (`api/**`), database (`database/**`), Apps Script, seluruh `scripts/**`, repository workflow/config, dependency/build config, deployment/environment tooling, governance global, serta frontend auth/session, API transport/mutation, domain, dan `FinanceContext` dianggap guarded secara default. Kebijakan ini sengaja broad/fail-closed agar task tidak dapat salah diklasifikasikan aman hanya karena satu path baru belum ditambahkan ke denylist granular.

Guarded/HIGH/CRITICAL tidak memakai flow Git yang berbeda. Pengamannya ada **sebelum** merge:
- task wajib `Guarded=YES`;
- `Guard Approval=APPROVED`;
- Write Scope harus sesuai;
- local `npm run check` wajib PASS.

Setelah user sudah memberi approval eksplisit dan seluruh guard PASS, `task:finish` memakai flow satu command yang sama. PR hanya dipakai sebagai pengecualian bila user memang meminta review tambahan atau repository rules melarang direct push `main`.

## Dependency

`Depends On` memakai Task ID atau `NONE`.

Task `APPROVED`/`IN_PROGRESS` tidak boleh memiliki dependency yang belum `DONE`.

## STOP conditions

Stop bila:
- Task ID/branch tidak cocok.
- Status belum `APPROVED`/`IN_PROGRESS`.
- Modified path di luar `Write Scope`.
- `Write Scope` overlap dengan task aktif paralel lain.
- Dependency belum selesai.
- Guarded path muncul tanpa approval.
- Source/baseline tidak dapat diverifikasi.
- Root cause saldo/data-integrity belum jelas.

## ZIP

`npm run zip` membuat **clean source archive canonical** untuk review/backup source. Policy-nya fail-closed.

Hanya file source canonical yang boleh masuk. Selalu dikeluarkan atau ditolak:
- `.git` dan `.vercel`;
- `node_modules` serta `dist/build/coverage/cache`;
- `.env*` selain `.env.example`;
- secret/key/credential;
- export atau data privat seperti CSV/XLSX/database dump;
- patch/diff, diagnostic report, dan file handoff lokal;
- root/path lain yang tidak termasuk struktur source canonical.

File diagnosis/review/handoff dikirim sebagai artifact terpisah. Jangan menjadikan clean ZIP sebagai wadah arbitrary working-tree files.

## Peran COORD

COORD:
- menjaga Task ID/branch tidak tertukar;
- menghindari dua task menulis path sama;
- menentukan task mana yang harus didahulukan;
- mengarahkan FE/BE berdasarkan root cause;
- memastikan guarded work tidak diperlakukan seperti perubahan biasa;
- setelah satu task selesai, memberi rekomendasi next step.

Target workflow: **REPLACE -> satu command `task:finish` -> selesai di `main` + clean ZIP terbaru otomatis**. User fokus pada hasil aplikasi; detail branch/Git/governance dijalankan tooling.

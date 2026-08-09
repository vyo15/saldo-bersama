# Git Workflow

Dokumen ini adalah sumber canonical untuk command Git dan workflow branch/worktree. Lifecycle task berada di `WORKFLOW.md`; kebijakan kontribusi berada di `../CONTRIBUTING.md`.

## Branch naming

Branch wajib membawa Task ID:

```text
feat/SB-123-nama-fitur
fix/SB-123-nama-bug
security/SB-123-nama-guard
perf/SB-123-nama-perf
docs/SB-123-nama-doc
test/SB-123-nama-test
chore/SB-123-nama-maintenance
```

Jangan bekerja langsung di `main`.


## Alur harian user sederhana

Setelah agent/engineer menyelesaikan patch dan menandai task minimal `READY_FOR_QA`, user tidak perlu mengulang quality command secara manual. Dari branch task cukup:

```bash
git add -A
git commit -m "fix(SB-123): describe the change"
git push -u origin HEAD
```

Push ke branch canonical langsung menjalankan `Quality` dengan permission read-only. Setelah Quality PASS, workflow `Task Submit` yang canonical-nya berada di `main` menerima event `workflow_run`, tidak checkout atau mengeksekusi kode branch, membaca metadata task pada SHA yang diuji melalui GitHub API, lalu membuat/reuse PR. Sebelum merge, workflow membaca registry guarded canonical dari `main`, membandingkannya dengan changed files, lalu memverifikasi SHA branch, SHA `main`, dan PR head tetap sama dengan snapshot yang divalidasi. Task non-guarded berisiko `LOW`/`MEDIUM` dicoba merge otomatis hanya bila repository rules mengizinkan; guarded atau risk `HIGH`/`CRITICAL` selalu berhenti pada PR untuk approval/merge manual. COORD merekonsiliasi task card saat post-merge close.

Setelah PR benar-benar merged, sinkronkan laptop:

```bash
git switch main
git pull origin main
```

`push` berarti laptop -> GitHub. `pull` berarti GitHub -> laptop. Local task branch boleh dibersihkan kemudian; keberadaannya tidak mengubah `main`.

Repository harus mengizinkan `GITHUB_TOKEN` membuat/mengelola pull request sesuai policy organisasi/repository. Jika permission atau repository rule menolak create/merge, workflow gagal tertutup dan `main` tidak diubah.

Saat pertama kali memasang `Task Submit`, workflow tersebut belum bisa memproses branch pemasangannya sendiri karena canonical workflow harus sudah tersedia di default branch. Task bootstrap itu dibuat PR dan di-merge manual satu kali; automation berlaku mulai task berikutnya setelah workflow ada di `main`.

## Mulai task

Pastikan task card `docs/tasks/active/SB-123.md` sudah dibuat dan plan sudah disetujui sebelum coding.

```bash
git checkout main
git pull --rebase origin main
git status --short
npm ci
npm run env:check
npm run check
git checkout -b fix/SB-123-nama-bug
npm run task:check
```

Untuk pekerjaan paralel, lebih aman memakai worktree per task:

```bash
git checkout main
git pull --rebase origin main
git worktree add ../worktrees/SB-123 -b fix/SB-123-nama-bug main
cd ../worktrees/SB-123
npm ci
npm run task:check
```

Jangan memakai satu worktree untuk dua task `IN_PROGRESS`.

## Selama bekerja

- Baca `../AGENTS.md`, `WORKFLOW.md`, dan task card aktif.
- Satu Primary Team maksimal satu `IN_PROGRESS` pada satu waktu.
- Update checkpoint task setelah milestone penting atau sebelum pindah prioritas/perangkat.
- Sync sebelum berpindah laptop/PC.
- Jangan mengerjakan file sama di dua worktree tanpa dependency/ownership yang jelas.
- Jika perlu file di luar `Write Scope`, STOP dan minta approval scope baru.
- Gunakan RFC/ADR untuk perubahan guarded atau lintas arsitektur.

## Resume task lama

```bash
git status --short
git fetch origin
npm run task:check
npm run task:list
```

Bandingkan baseline/checkpoint dengan `main` terbaru. Revalidation wajib bila area relevan berubah atau task tidak disentuh lebih dari 72 jam.

## Sebelum commit

```bash
npm run task:check
npm run check
npm run test:browser
npm run clean:dry-run
npm run zip
git status --short
git diff --check
git diff --stat
git add -A
git diff --cached --check
git diff --cached --stat
```

Pastikan tidak ada `.env`, `.vercel`, ZIP, `node_modules`, build output, credential, token, dump, backup, atau export berisi data nyata. Gunakan `npm run clean` untuk generated output; jangan menghapus `.git`, `.vercel`, atau `.env.local`.

## Commit dan pull request

Prefix commit canonical:

```text
feat:
fix:
security:
docs:
refactor:
perf:
test:
build:
ci:
chore:
```

Contoh:

```bash
git commit -m "fix(SB-123): describe the change"
git push -u origin fix/SB-123-nama-bug
```

Untuk branch canonical, `git push -u origin HEAD` adalah trigger submit. Workflow `Quality` berjalan read-only pada push branch task; setelah PASS, `Task Submit` dari `main` membuat/reuse PR tanpa menjalankan kode branch pada token write. Repository rules tetap authoritative. Guarded/HIGH/CRITICAL tidak pernah auto-merge; task non-guarded LOW/MEDIUM hanya dicoba auto-merge setelah quality PASS. Direct push atau force push ke `main` harus dilarang melalui repository ruleset.

GitHub Actions memakai full history untuk menghitung scope diff terhadap base branch. `npm run task:check` tetap wajib lulus sebagai gate server-side walaupun user tidak perlu menjalankannya lagi secara manual sebelum setiap push.

## Handoff dan close

Handoff harian ada pada task card, bukan satu file global. Sebelum berhenti:

- update `Completed`;
- update `Remaining`;
- tulis `Resume From`;
- catat `Last Verified Commit` dan test aktual;
- gunakan `ON_HOLD` + reason/resume condition bila benar-benar berhenti sementara.

Setelah QA lulus: `READY_FOR_MERGE`. Setelah merge dan post-merge verification: ubah `DONE` lalu `COORD` memindahkan task card ke `docs/tasks/archive/`.

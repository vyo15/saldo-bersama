# Git Workflow

Dokumen ini adalah sumber canonical untuk command Git dan workflow harian. Kebijakan kontribusi, RFC/ADR, serta Definition of Ready/Done berada di `../CONTRIBUTING.md`.

## Mulai task

```bash
git checkout main
git pull --rebase origin main
git status --short
npm ci
npm run env:check
npm run check
git checkout -b feat/nama-fitur
```

Prefix branch yang diizinkan:

```text
feat/
fix/
security/
perf/
docs/
test/
chore/
```

Jangan bekerja langsung di `main`.

## Selama bekerja

- Baca `../AGENTS.md`, `PROJECT_STATUS.md`, dan `PROJECT_HANDOFF.md`.
- Satu task/branch harus memiliki scope jelas.
- Sync sebelum berpindah laptop/PC.
- Jangan mengerjakan file sama di dua perangkat tanpa push/pull.
- Gunakan RFC/ADR untuk perubahan guarded atau lintas arsitektur.
- Perbarui dokumentasi pada patch yang sama dengan perubahan source.

## Sebelum commit

```bash
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

Pastikan tidak ada `.env`, `.vercel`, ZIP, `node_modules`, build output, credential, token, dump, backup, atau export berisi data nyata. Gunakan `npm run clean` untuk generated output; jangan menghapus `.git`, `.vercel`, atau `.env.local`. `npm run zip` menjaga archive lama sampai archive sementara valid, lalu mengganti file canonical secara atomik. Pada output default, hanya variasi nama clean canonical yang dihapus; ZIP patch dan arsip lain tetap dipertahankan.

## Commit dan pull request

Prefix commit yang diizinkan:

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
git commit -m "feat: describe the change"
git push -u origin feat/nama-fitur
```

Buat PR ke `main`, isi template, tunggu code owner approval, quality gate, preview/smoke test yang relevan, dan resolve seluruh conversation. Direct push atau force push ke `main` harus dilarang melalui repository ruleset.

## Handoff

Sebelum task ditutup, perbarui:

- `PROJECT_STATUS.md`;
- `PROJECT_HANDOFF.md`;
- `../CHANGELOG.md`;
- contract, ADR, RFC, matrix, atau runbook yang terdampak.

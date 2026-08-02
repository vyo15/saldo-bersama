# Git Workflow

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

Gunakan prefix `feat/`, `fix/`, `security/`, `perf/`, `docs/`, `test/`, atau `chore/`. Jangan bekerja langsung di `main`.

## Selama bekerja

- Baca `AGENTS.md`, project status, dan handoff.
- Satu task/branch harus memiliki scope jelas.
- Sync sebelum berpindah laptop/PC.
- Jangan mengerjakan file sama di dua perangkat tanpa push/pull.
- Gunakan RFC/ADR untuk perubahan guarded/lintas tim.

## Sebelum commit

```bash
npm run check
git status --short
git diff --check
git diff --stat
git add -A
git diff --cached --check
git diff --cached --stat
```

Pastikan tidak ada `.env`, `.vercel`, ZIP, `node_modules`, build output, credential, token, dump, backup, atau export berisi data nyata.

## Commit dan PR

```bash
git commit -m "feat: describe the change"
git push -u origin feat/nama-fitur
```

Buat PR ke `main`, isi template, tunggu code owner approval, quality gate, preview/smoke test, dan resolve seluruh conversation. Direct push/force push ke `main` harus dilarang melalui repository ruleset.

## Handoff

Sebelum task ditutup, perbarui:

- `docs/PROJECT_STATUS.md`
- `docs/PROJECT_HANDOFF.md`
- `CHANGELOG.md`
- contract/ADR/RFC/runbook yang terdampak

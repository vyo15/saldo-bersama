# Git Workflow

Gunakan branch terpisah untuk perubahan besar. Jangan langsung menimpa `main` tanpa review.

## Mulai bekerja

```bash
git checkout main
git pull --rebase origin main
git checkout -b refactor/saldo-bersama-foundation
npm ci
```

Jika branch sudah ada:

```bash
git checkout refactor/saldo-bersama-foundation
git pull --rebase origin refactor/saldo-bersama-foundation
npm ci
```

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

Pastikan tidak ada `.env`, `.vercel`, ZIP, `node_modules`, `dist`, credential, token, atau export spreadsheet berisi data nyata.

## Commit dan push

```bash
git commit -m "feat: build Saldo Bersama foundation"
git push -u origin refactor/saldo-bersama-foundation
```

Buat Pull Request ke `main`, periksa Vercel Preview, lalu merge setelah quality gate dan smoke test lulus.

## Sinkronisasi laptop rumah dan PC kantor

Sebelum mulai di perangkat mana pun:

```bash
git status --short
git pull --rebase
npm ci
```

Setelah selesai:

```bash
npm run check
git add -A
git commit -m "chore: describe the completed change"
git push
```

Jangan mengerjakan file yang sama pada dua perangkat tanpa push/pull terlebih dahulu.

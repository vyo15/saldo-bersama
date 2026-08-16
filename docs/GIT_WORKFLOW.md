# Git Workflow

Workflow canonical Saldo Bersama adalah **branch + Pull Request dengan Quality wajib lulus sebelum merge ke `main`**. Enforcement GitHub mengikuti `GITHUB_RULESET.md`.

Lihat juga `../CONTRIBUTING.md`.

## Normal flow

Setelah patch disetujui dan diterapkan:

```bash
git status --short
npm run verify
```

Jika full local gate PASS:

```bash
git switch -c fix/deskripsi-singkat
git add -A
git commit -m "fix: deskripsi perubahan"
git push -u origin HEAD
```

Buat Pull Request ke `main`. Merge hanya setelah workflow **Quality** lulus dan review yang diwajibkan repository selesai. Setelah merge:

```bash
git switch main
git pull origin main
```

Gunakan `git add -A` agar file yang memang dihapus ikut tercatat. Periksa `git status --short` sebelum commit untuk mencegah file lokal/secret ikut masuk.

## Tidak lagi digunakan

Workflow berikut bukan bagian source canonical:

- direct push rutin ke `main`;
- task card aktif/Task ID;
- `npm run task:check`;
- `npm run task:list`;
- `npm run task:finish`;
- branch otomatis/revision branch otomatis;
- archive task sebagai syarat merge.

Historical `docs/tasks/archive/` boleh tetap ada sebagai catatan lama, tetapi tidak mengontrol workflow saat ini.

## Guarded/high-risk

Untuk schema/auth/API/saldo/transfer/backup/restore/env/deployment/security/data-integrity:

1. review source aktual;
2. plan file-by-file;
3. approval eksplisit;
4. patch terarah;
5. test domain relevan + `npm run verify`;
6. push branch;
7. tunggu **Quality** PASS;
8. review;
9. merge ke `main`.

## Recovery sederhana

Jika validation gagal, jangan push/merge. Perbaiki file yang gagal lalu ulangi gate.

Jika ada perubahan lokal yang tidak sengaja, lihat dulu:

```bash
git status --short
git diff -- <path>
```

Gunakan `git restore <path>` hanya setelah yakin perubahan pada path tersebut memang harus dibuang. Jangan force-push/reset destructive untuk recovery rutin.

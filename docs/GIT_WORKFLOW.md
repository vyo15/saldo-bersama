# Git Workflow

Workflow canonical Saldo Bersama adalah **branch + Pull Request dengan Quality wajib lulus sebelum merge ke `main`**. Enforcement GitHub mengikuti `GITHUB_RULESET.md`.

Lihat juga `../CONTRIBUTING.md`.

## Normal flow

Setelah patch disetujui dan diterapkan, workflow harian dapat tetap sederhana:

```bash
git status --short
npm run zip
git switch -c fix/deskripsi-singkat
git add -A
git commit -m "fix: deskripsi perubahan"
git push -u origin HEAD
```

`npm run zip` memastikan pre-push Auto Quality Guard tersedia lalu menjalankan full `npm run verify` terlebih dahulu dan **tidak membuat ZIP bila lint/test/build/guard/browser gagal**. Selain itu, `npm ci` dan `npm run dev` memasang pre-push Auto Quality Guard lokal secara idempotent. Saat `git push`, hook menjalankan full verification lagi dan membatalkan push bila gate gagal. GitHub Quality tetap menjadi gate server-side terakhir.

Jika repository sudah memiliki `pre-push` custom yang bukan milik Saldo Bersama, installer tidak menimpanya. Pada kondisi itu jalankan `npm run verify` manual sebelum push atau integrasikan guard canonical ke hook custom tersebut.

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

Jika validation gagal, jangan push/merge. `npm run zip` akan membatalkan packaging dan pre-push guard akan membatalkan push. Perbaiki file yang gagal lalu ulangi `npm run zip` atau `npm run verify`.

Jika ada perubahan lokal yang tidak sengaja, lihat dulu:

```bash
git status --short
git diff -- <path>
```

Gunakan `git restore <path>` hanya setelah yakin perubahan pada path tersebut memang harus dibuang. Jangan force-push/reset destructive untuk recovery rutin.

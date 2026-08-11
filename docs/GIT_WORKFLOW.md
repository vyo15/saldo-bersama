# Git Workflow

Workflow canonical Saldo Bersama adalah **direct main yang tervalidasi**. Tujuannya mengurangi Git ceremony tanpa mengurangi quality/security gate.

Lihat juga `../CONTRIBUTING.md`.

## Normal flow

Setelah patch disetujui dan diterapkan ke working tree `main`:

```bash
git status --short
npm run verify
```

Jika full local gate PASS:

```bash
git add -A
git commit -m "feat: deskripsi perubahan"
git push origin main
npm run zip
```

Gunakan `git add -A` agar file yang memang dihapus ikut tercatat. Periksa `git status --short` sebelum commit untuk mencegah file lokal/secret ikut masuk.

## Tidak lagi digunakan

Workflow berikut sudah dipensiunkan dan bukan bagian source canonical:

- task card aktif/Task ID;
- `npm run task:check`;
- `npm run task:list`;
- `npm run task:finish`;
- branch otomatis/revision branch otomatis;
- archive task sebagai syarat merge.

Historical `docs/tasks/archive/` boleh tetap ada sebagai catatan lama, tetapi tidak mengontrol workflow saat ini.

## Guarded/high-risk

Git flow tetap sederhana, tetapi **approval dan validation tidak boleh disederhanakan**. Untuk schema/auth/API/saldo/transfer/backup/restore/env/deployment/security/data-integrity:

1. review source aktual;
2. plan file-by-file;
3. approval eksplisit;
4. patch terarah;
5. test domain relevan + `npm run verify`;
6. baru commit/push.

## Recovery sederhana

Jika validation gagal, jangan commit/push. Perbaiki file yang gagal lalu ulangi gate.

Jika ada perubahan lokal yang tidak sengaja, lihat dulu:

```bash
git status --short
git diff -- <path>
```

Gunakan `git restore <path>` hanya setelah yakin perubahan pada path tersebut memang harus dibuang. Jangan force-push/reset destructive untuk recovery rutin.

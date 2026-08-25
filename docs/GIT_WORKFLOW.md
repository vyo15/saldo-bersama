# Git Workflow

Workflow canonical Saldo Bersama untuk repository private ini sengaja sederhana: **kerja di `main`, commit, lalu `git push origin main`**. Safety gate dipindahkan ke pre-push Auto Quality Guard agar pengguna tidak perlu membuat branch/PR untuk perubahan rutin.

Lihat juga `../CONTRIBUTING.md`.

## Workflow harian

Untuk menjalankan aplikasi hanya ada dua command runtime yang perlu diingat:

```bash
npm run dev
npm run prod
```

Untuk mengirim source:

```bash
git add .
git commit -m "deskripsi perubahan"
git push origin main
```

`git push origin main` tidak langsung mengirim source. Hook lokal membaca ref yang benar-benar akan dikirim oleh Git, lalu fail-closed jika:

- branch aktif bukan `main`;
- ref lokal/remote bukan `main`;
- SHA yang akan dikirim berbeda dari `HEAD` yang diverifikasi;
- working tree masih mempunyai perubahan yang belum di-commit;
- push non-fast-forward/force;
- full `npm run verify` gagal.

Dengan demikian kasus lama ketika working tree branch A diverifikasi tetapi ref `main` lain yang terkirim tidak boleh terulang.

Setelah pre-push PASS, GitHub workflow **Quality** tetap berjalan pada `main` sebagai verifikasi server-side sekunder. Jangan memakai `--no-verify`, `--force`, atau bypass routine.

## Runtime DEV/PROD di setiap workstation tepercaya

Setiap PC/laptop tepercaya mempunyai dua profile lokal:

```text
.env.local              -> Development -> saldo-bersama-dev
.env.production.local   -> Production  -> saldo-bersama
```

`npm run dev` otomatis refresh Vercel Development, memastikan `.env.production.local` minimal sudah tersedia sebagai template aman bila belum pernah dibuat, memeriksa Turso Development + schema/binding, lalu menjalankan localhost.

`npm run prod` otomatis memastikan Development profile tersedia, mewajibkan `.env.production.local` Production yang lengkap, memeriksa isolasi DEV/PROD, menguji Turso Production secara read-only, memeriksa Vercel Production + frontend shell, lalu membuka Production pada terminal interaktif.

Credential Production Sensitive tidak dapat dipull kembali dari Vercel. Karena itu pada workstation baru, `.env.production.local` hanya perlu diisi **satu kali** dari secret store/profile Production canonical yang sama. File existing tidak pernah ditimpa otomatis.

## Perubahan guarded/high-risk

Direct push tidak menghapus review discipline. Untuk schema/auth/API/saldo/transfer/backup/restore/env/deployment/security/data-integrity:

1. review source aktual;
2. plan file-by-file;
3. approval eksplisit;
4. patch terarah;
5. targeted regression;
6. commit;
7. `git push origin main` menjalankan full verification sebelum ref dikirim.

Operasi live yang destructive atau mutation database Production tetap **tidak boleh** diotomatisasi oleh push. Migration/backup/restore tetap mengikuti runbook dan approval canonical.

## Recovery sederhana

Jika push dibatalkan, baca step verification yang gagal, perbaiki hanya scope tersebut, commit ulang, lalu jalankan kembali:

```bash
git push origin main
```

Tidak perlu membuat branch recovery baru hanya karena lint/test gagal.

Jika ada perubahan lokal yang tidak sengaja, lihat dulu:

```bash
git status --short
git diff -- <path>
```

Gunakan `git restore <path>` hanya setelah yakin perubahan tersebut memang harus dibuang. Jangan force-push/reset destructive untuk recovery rutin.

## Command non-harian

`npm run verify`, `npm run zip`, command database, environment sync, backup/restore, dan tooling lain tetap tersedia karena dibutuhkan quality gate atau operasi maintenance. Pengguna tidak perlu menghafalnya untuk pemakaian harian; jalankan hanya ketika runbook/diagnosis memang memerlukannya.

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
- full `npm run verify` gagal;
- untuk diff database-compatibility: profile Production lokal tidak valid, Turso Production tidak reachable, schema source/Production berbeda, atau binding Production tidak siap;
- untuk diff non-schema: core Vercel Production tidak sehat atau tidak dapat dijangkau.

Pre-push selalu menjalankan `npm run verify`. Setelah itu, diff diklasifikasikan: perubahan database-compatibility menjalankan Production DB check **read-only**, sedangkan perubahan non-schema menjalankan core Vercel Production health tanpa membutuhkan credential Turso Production lokal. Push tidak pernah memigrasikan database otomatis. Dengan demikian ref yang salah tetap ditolak, runtime schema baru tidak dapat terdeploy saat database Production tertinggal, dan perubahan UI/backend non-schema tidak memaksa setiap laptop menyimpan token database Production.

Setelah pre-push PASS, GitHub workflow **Quality** tetap berjalan pada `main` sebagai verifikasi server-side sekunder. Jangan memakai `--no-verify`, `--force`, atau bypass routine.

## Runtime DEV/PROD di setiap workstation tepercaya

Setiap PC/laptop tepercaya mempunyai dua profile lokal:

```text
.env.local              -> Development -> saldo-bersama-dev
.env.production.local   -> Production  -> saldo-bersama
```

`npm run dev` hanya mengurus Development: otomatis refresh Vercel Development, memeriksa Turso Development + schema/binding, lalu menjalankan localhost. Command ini tidak membuat atau mengubah `.env.production.local`.

`npm run prod` tidak menarik atau menulis Development. Command ini memastikan `.env.production.local` tersedia/lengkap, membaca `.env.local` hanya untuk membuktikan isolasi DEV/PROD, boleh menyejajarkan hanya grup Google bridge pusat bila Production lokal kosong, menguji Turso Production secara read-only, memeriksa Vercel Production + frontend shell, lalu membuka Production pada terminal interaktif. Database/schema/binding, maintenance, dan integrity failure tetap blocker; scheduler/integrasi/backup/notifikasi degraded menjadi operational warning dan tidak mematikan login/ledger yang core-nya sehat.

Credential Production Sensitive tidak dapat dipull kembali dari Vercel. Karena itu pada workstation baru, `.env.production.local` hanya perlu diisi **satu kali** dari secret store/profile Production canonical yang sama. File existing tidak pernah ditimpa otomatis.

## Perubahan guarded/high-risk

Direct push tidak menghapus review discipline. Untuk schema/auth/API/saldo/transfer/backup/restore/env/deployment/security/data-integrity:

1. review source aktual;
2. plan file-by-file;
3. approval eksplisit;
4. patch terarah;
5. targeted regression;
6. commit;
7. `git push origin main` menjalankan full verification, lalu Production DB preflight read-only hanya untuk diff database-compatibility; diff non-schema memakai core Vercel Production health sebelum ref dikirim.

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

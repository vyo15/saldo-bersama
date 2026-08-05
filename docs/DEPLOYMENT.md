# Deployment

## 1. Environment canonical

Gunakan `docs/ENVIRONMENT_VARIABLES.md` sebagai satu-satunya daftar nama variable. Scope **Development** dipakai untuk bootstrap lokal terjaga, scope **Production** dipakai deployment, dan Preview tetap kosong. Nama key yang sama pada Development dan Production adalah pemisahan scope yang disengaja, bukan duplikasi konflik.

Variable `VITE_*` bersifat publik. Secret tidak boleh memakai prefix `VITE_`. Setelah environment berubah, deployment Production wajib dijalankan ulang. Seed Development adalah onboarding terpisah melalui `npm run env:push:development`, bukan bagian release gate rutin.

## 2. Database Turso tunggal

Sesuai keputusan pemilik, localhost dan Production memakai satu database Turso. Konsekuensinya:

- jangan memakai data dummy setelah aplikasi mulai digunakan;
- jangan menjalankan restore/import/purge untuk eksperimen;
- backup wajib sebelum migration atau operasi besar;
- migration hanya dijalankan eksplisit;
- selalu jalankan integrity check.

```bash
npm run db:migrate
npm run db:integrity
```

## 3. Firebase

Aktifkan Google provider dan authorized domain untuk localhost serta domain Vercel. Backend memverifikasi ID token memakai `VITE_FIREBASE_API_KEY`; Firebase Web API key bukan secret. Authorization tetap ditentukan oleh `ALLOWED_USERS_JSON` dan binding tabel `users`.

## 4. Apps Script bridge

1. Buat project bridge dari folder `apps-script/`.
2. Isi hanya Script Properties pada `GOOGLE_INTEGRATIONS.md`.
3. Deploy Web App sebagai user deploying dengan akses anyone/anonymous.
4. Simpan URL `/exec` sebagai `GOOGLE_BRIDGE_WEB_APP_URL` di Vercel.
5. Pastikan shared secret sama pada Vercel dan Script Properties.
6. Instal satu scheduled trigger.

ID Spreadsheet, Calendar, folder Drive, dan `JOBS_ENDPOINT_URL` hanya berada di Apps Script Properties, bukan di Vercel.

## 5. Web Push Production

1. Buat satu pasangan VAPID melalui tooling `web-push`, lalu simpan public key, private key, dan subject sebagai satu grup. Jangan pernah menaruh private key pada variable `VITE_*`.
2. Isi `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` pada environment lokal tepercaya. Jalankan `npm run env:check` untuk memvalidasi panjang key, kecocokan pasangan public/private, dan format subject.
3. Jalankan `npm run env:push:production`. Grup parsial atau invalid harus menghentikan sinkronisasi.
4. Deploy Production baru. Buka `/pengaturan` melalui HTTPS, aktifkan notifikasi, lalu gunakan Uji notifikasi pada setiap perangkat.
5. Verifikasi trigger Apps Script memanggil `/api/jobs`, status queue berubah, delivery per perangkat tercatat, subscription 404/410 dinonaktifkan, dan backup terjadwal tetap berjalan saat tahap Push gagal.
6. Pada iPhone/iPad, uji hanya dari aplikasi yang sudah ditambahkan ke Home Screen.

## 6. Migration schema v6

Sebelum migration, buat backup teknis terverifikasi. Jalankan migration secara eksplisit sebelum runtime v6 menerima traffic:

```bash
npm run db:migrate
npm run db:integrity
```

Migration `004_notification_deliveries.sql` bersifat additive. Ia menambah delivery per subscription agar retry tidak mengirim ulang ke perangkat yang sudah sukses. Rollback aman dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment. Jangan menghapus tabel langsung pada database aktif.

## 7. Release gate

```bash
npm ci
npm run env:check
npm run env:push:production
npm run check
npm run db:integrity
```

Lanjutkan smoke test login owner/member, create/update/cancel transaksi, transfer, conflict, Excel, status/register/test/unregister Web Push, retry dua perangkat, mirror, Calendar, backup, restore drill, dan PWA iOS/Android.

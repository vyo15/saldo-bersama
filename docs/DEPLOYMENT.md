# Deployment

## 1. Environment canonical

Gunakan `docs/ENVIRONMENT_VARIABLES.md` sebagai satu-satunya daftar nama variable. Scope **Development** dipakai untuk bootstrap lokal terjaga, scope **Production** dipakai deployment, dan Preview tetap kosong. Nama key yang sama pada Development dan Production adalah pemisahan scope yang disengaja, bukan duplikasi konflik.

Variable `VITE_*` bersifat publik. Secret tidak boleh memakai prefix `VITE_`. Setelah environment berubah, deployment Production wajib dijalankan ulang. Development adalah source bootstrap lokal dan direfresh pada setiap `npm run dev` interaktif. Seed Development tetap operasi terpisah dari release gate rutin.

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
6. Isi `JOBS_ENDPOINT_URL=https://saldo-bersama.vercel.app/api/jobs` dan pastikan `JOBS_SHARED_SECRET` sama pada Vercel serta Script Properties.
7. Jalankan `installScheduledTrigger()` satu kali dan pastikan health trigger melaporkan `ready: true` serta `count: 1`.
8. Setelah environment Vercel memakai bridge URL/secret yang sama, buka `/pengaturan/integrasi`. Status `Siap` hanya sah jika signed `integration.health` memverifikasi resource dan scheduler. Jangan menganggap konfigurasi selesai hanya karena environment bridge terisi.

ID Spreadsheet, Calendar, folder Drive, dan `JOBS_ENDPOINT_URL` hanya berada di Apps Script Properties, bukan di Vercel. Jika salah satu resource belum tersedia, provider terkait harus tetap `Belum siap` tanpa memblokir Turso.

## 5. Web Push Production

1. Pastikan backup teknis terbaru berstatus terverifikasi. Jangan melanjutkan migration atau perubahan environment tanpa titik pemulihan.
2. Buat satu pasangan VAPID pada komputer tepercaya:

   ```bash
   npx web-push generate-vapid-keys --json
   ```

   Salin hasil langsung ke `.env.local`. Jangan menaruh private key di chat, issue, screenshot, GitHub, ZIP, atau variable `VITE_*`.
3. Isi satu grup lengkap:

   ```text
   VITE_VAPID_PUBLIC_KEY=<public-key>
   VAPID_PRIVATE_KEY=<private-key>
   VAPID_SUBJECT=https://saldo-bersama.vercel.app
   ```

4. Validasi pasangan key dan seluruh environment tanpa mencetak nilai secret:

   ```bash
   npm run env:check
   ```

5. Pastikan database sudah memakai schema v6 dan integrity check lulus:

   ```bash
   npm run db:migrate
   npm run db:integrity
   ```

6. Sinkronkan environment dan buat deployment Production baru:

   ```bash
   npm run env:push:production
   npx vercel --prod
   ```

   Environment baru tidak berlaku pada deployment lama.
7. Dari komputer tepercaya yang memakai pasangan VAPID yang sama, seed konfigurasi settings ke Vercel Development tanpa menyentuh Turso/allowlist/session:

   ```bash
   npm run env:push:development:settings
   ```

   Langkah ini dilakukan satu kali setelah aktivasi/rotasi settings. Laptop atau PC lain kemudian cukup menjalankan `npm run dev`; bootstrap menarik Development terbaru secara otomatis.
8. Pada Apps Script Properties, pastikan `JOBS_ENDPOINT_URL=https://saldo-bersama.vercel.app/api/jobs` dan `JOBS_SHARED_SECRET` sama dengan Vercel. Jalankan `installScheduledTrigger()` sekali dan pastikan hasilnya melaporkan `ready: true` serta `count: 1`.
9. Buka `/pengaturan` melalui HTTPS. Status backend harus `Siap` dan schema harus v6. Buka `/pengaturan/notifikasi`, ketuk tile Notifikasi perangkat, izinkan browser, lalu pastikan verifikasi otomatis berhasil pada setiap perangkat.
10. Desktop dan Android dapat diuji dari browser yang mendukung. Pada iPhone/iPad, tambahkan aplikasi ke Home Screen dan buka dari ikon aplikasi sebelum meminta izin.
11. Verifikasi `/api/jobs`, queue, delivery per perangkat, audit register/test/unregister, subscription 404/410, retry, serta backup terjadwal ketika tahap Push gagal.

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

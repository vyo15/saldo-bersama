# Deployment

## 1. Environment canonical

Gunakan `docs/ENVIRONMENT_VARIABLES.md` sebagai satu-satunya daftar nama variable. Scope **Development** dipakai untuk bootstrap lokal terjaga, scope **Production** dipakai deployment, dan Preview tetap kosong. Nama key yang sama pada Development dan Production adalah pemisahan scope yang disengaja, bukan duplikasi konflik.

Variable `VITE_*` bersifat publik. Secret tidak boleh memakai prefix `VITE_`. Setelah environment berubah, deployment Production wajib dijalankan ulang. Development adalah source bootstrap lokal dan direfresh pada setiap `npm run dev` interaktif. Seed Development tetap operasi terpisah dari release gate rutin.

## 2. Database Turso: kondisi saat ini dan cutover isolation

Sampai exit criteria ADR-0007 dibuktikan, localhost dan Production masih memakai satu database Turso. Konsekuensinya:

- jangan memakai data dummy setelah aplikasi mulai digunakan;
- jangan menjalankan restore/import/purge untuk eksperimen;
- backup wajib sebelum migration atau operasi besar;
- migration hanya dijalankan eksplisit;
- selalu jalankan integrity check.

```bash
npm run db:migrate
npm run db:integrity
```



### Target hardening yang disetujui

Sebelum aplikasi bergantung pada data finansial nyata, pindahkan Development ke database Turso terpisah:

1. buat database Development;
2. migrate sampai schema v10;
3. jalankan integrity dan pastikan timezone/currency canonical;
4. ubah **hanya** Vercel Development `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, dan `SESSION_SECRET`;
5. tarik ulang Development melalui `npm run dev`;
6. smoke dengan data dummy pada Development;
7. verifikasi Production masih menunjuk database Production yang benar;
8. rotasi/revoke credential lama per scope setelah cutover terbukti.

Jangan menjalankan `npm run env:push:development` dari `.env.local` yang masih menunjuk Production setelah isolation dimulai. Jangan menyalin database Production ke Development sebagai default; gunakan data dummy/fixture aman kecuali ada drill terkontrol dengan data yang sudah dianonimkan dan approval khusus.

## 3. Google OAuth + Firebase Authentication

Aktifkan Google provider pada Firebase dan pertahankan authorized domain untuk localhost serta `saldo-bersama.vercel.app`. Desktop dan mobile memakai tombol Google branded Saldo Bersama. Localhost/device emulation memakai Firebase popup untuk development. **Production tidak memakai `signInWithRedirect()` atau `/__/auth/*` lagi.** Tombol branded membuka server OAuth flow `/api/auth/google/start`; Google kembali ke callback `https://saldo-bersama.vercel.app/api/auth/google/callback`. Server memvalidasi signed `state` dan `nonce`, menukar authorization code ke Google ID token, menukar Google ID token melalui Firebase Identity Toolkit, lalu memakai verifier Firebase + `ALLOWED_USERS_JSON` existing sebelum membuat signed HttpOnly session.

Pada Google Auth Platform → Clients → OAuth Web Client yang sama dengan `VITE_GOOGLE_CLIENT_ID`:

1. Authorized JavaScript origins tetap memuat `http://localhost:5173` dan `https://saldo-bersama.vercel.app` untuk Firebase popup development dan konfigurasi OAuth Web Client.
2. Authorized redirect URIs **wajib** memuat `https://saldo-bersama.vercel.app/api/auth/google/callback` persis.
3. URI lama `https://saldo-bersama.vercel.app/__/auth/handler` tidak lagi dipakai source canonical. Boleh dibiarkan sementara selama rollout, lalu dibersihkan setelah production desktop/mobile terbukti stabil.
4. Simpan client secret Web Client hanya sebagai `GOOGLE_OAUTH_CLIENT_SECRET` pada `.env.local` komputer tepercaya dan Vercel **Production Sensitive**. Jangan memakai prefix `VITE_`, jangan menaruh nilai secret di Git, ZIP, screenshot, log, issue, atau chat.

`VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com` tetap public Firebase config untuk fallback popup lokal dan compatibility, bukan secret. Server OAuth production tidak menyimpan Google access token/refresh token. Signed OAuth transaction cookie berumur 5 menit, `HttpOnly`, `SameSite=Lax`, dan hanya berlaku pada callback; session aplikasi existing tetap `HttpOnly` + `SameSite=Strict`.

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

5. Pastikan database sudah memakai schema v10 dan integrity check lulus:

   ```bash
   npm run db:migrate
   npm run db:integrity
   ```

6. Jika dan hanya jika nilai environment memang berubah, sinkronkan environment Production secara eksplisit:

   ```bash
   npm run env:push:production
   ```

   Setelah itu commit/push source yang sudah lolos quality gate dan tunggu deployment Git-connected Vercel untuk commit tersebut berstatus `Ready`. Jangan menjalankan `npx vercel --prod` dari working tree yang masih memiliki perubahan lokal karena file yang belum dikomit dapat ikut terdeploy. Environment baru juga tidak berlaku pada deployment lama sebelum redeploy.
7. Dari komputer tepercaya yang memakai pasangan VAPID yang sama, seed konfigurasi settings ke Vercel Development tanpa menyentuh Turso/allowlist/session:

   ```bash
   npm run env:push:development:settings
   ```

   Langkah ini dilakukan satu kali setelah aktivasi/rotasi settings. Laptop atau PC lain kemudian cukup menjalankan `npm run dev`; bootstrap menarik Development terbaru secara otomatis.
8. Pada Apps Script Properties, pastikan `JOBS_ENDPOINT_URL=https://saldo-bersama.vercel.app/api/jobs` dan `JOBS_SHARED_SECRET` sama dengan Vercel. Jalankan `installScheduledTrigger()` sekali dan pastikan hasilnya melaporkan `ready: true` serta `count: 1`.
9. Buka `/pengaturan` melalui HTTPS. Status backend harus `Siap` dan schema harus v10. Buka `/pengaturan/notifikasi`, ketuk tile Notifikasi perangkat, izinkan browser, lalu pastikan verifikasi otomatis berhasil pada setiap perangkat.
10. Desktop dan Android dapat diuji dari browser yang mendukung. Pada iPhone/iPad, tambahkan aplikasi ke Home Screen dan buka dari ikon aplikasi sebelum meminta izin.
11. Verifikasi `/api/jobs`, queue, delivery per perangkat, audit register/test/unregister, subscription 404/410, retry, serta backup terjadwal ketika tahap Push gagal.

## 6. Migration schema v10

Migration terbaru adalah `database/migrations/008_manual_reminders.sql`. Migration bersifat additive. Ia menambah tabel `manual_reminders`, unique partial index untuk satu reminder aktif per user dan objek, serta due index untuk scheduler. Ledger, saldo, transaksi, rekening, dan ownership entity existing tidak diubah.

Sebelum migration, buat backup teknis terverifikasi. Jalankan migration secara eksplisit sebelum runtime v10 menerima traffic:

```bash
npm run db:migrate
npm run db:integrity
```

Migration v9 `007_envelope_assignee.sql` tetap menjadi dasar penerima jatah. Migration v8 `006_account_ewallet_template.sql` tetap menjadi dasar provider E-wallet canonical.

Backup schema v10 menyertakan `manual_reminders`, `assignee_user_id`, `ewallet_template`, dan notification preferences. Runtime v10 tetap dapat membaca backup v3-v9 melalui normalisasi additive; backup lama diperlakukan memiliki daftar manual reminder kosong. Rollback aman dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment. Jangan menghapus tabel/kolom langsung pada database aktif.

## 7. Release gate

```bash
npm ci
npm run env:check
npm run check
npm run test:guard
npm run db:integrity
```

`npm run env:push:production` hanya dijalankan ketika perubahan environment memang menjadi bagian release yang sudah direview; jangan menjadikannya efek samping setiap release. Lanjutkan smoke test login Administrator/Member, create/update/cancel transaksi, transfer, conflict, Excel, status/register/test/unregister Web Push, retry dua perangkat, mirror, Calendar, backup, restore drill, dan PWA iOS/Android.

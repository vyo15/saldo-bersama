# Deployment

## Cutover schema v13 + environment/session

1. Buat/konfirmasi database Turso Development dan Production yang berbeda sebelum memindahkan data nyata.
2. Ambil backup teknis terverifikasi masing-masing database. Development memakai `npm run db:migrate` + `npm run db:bind-environment -- development`; Production memakai `.env.production.local` dan target eksplisit `npm run db:migrate -- production` + `npm run db:bind-environment -- production`. Rebind silang ditolak; jangan mengubah binding database Production menjadi Development atau sebaliknya.
3. Set `DATABASE_ENVIRONMENT` pada Vercel Development/Production sesuai scope. Preview tidak diberi credential database aktif.
4. Deploy runtime v13. Session v1 tidak kompatibel dengan registry v2 sehingga semua perangkat login ulang satu kali.
5. Jalankan integrity check, health, login Administrator/Member, session list/revoke, mutation retry outcome-unknown, scheduler heartbeat, backup/restore drill, lalu baru buka traffic normal.


## 1. Environment canonical

Gunakan `docs/ENVIRONMENT_VARIABLES.md` sebagai satu-satunya daftar nama variable. Scope **Development** dipakai untuk bootstrap lokal terjaga, scope **Production** dipakai deployment, dan Preview tetap kosong. Nama key yang sama pada Development dan Production adalah pemisahan scope yang disengaja, bukan duplikasi konflik.

Variable `VITE_*` bersifat publik. Secret tidak boleh memakai prefix `VITE_`. Setelah environment berubah, deployment Production wajib dijalankan ulang. Development adalah source bootstrap lokal dan direfresh pada setiap `npm run dev` interaktif. Seed Development tetap operasi terpisah dari release gate rutin.

Mode operator dibedakan tegas: `npm run dev` = localhost + Vercel Development + Turso Development; `npm run prod` = health check + akses deployment Vercel Production aktual. Jangan membuat localhost memakai credential Production sebagai pengganti smoke Vercel karena production auth membutuhkan HTTPS/Secure cookie dan secret Sensitive tidak dapat dipull kembali.

## 2. Database Turso: isolation fail-closed

Source v13 tetap tidak mengizinkan Development/Production memakai database yang sama secara normal. `DATABASE_ENVIRONMENT` harus cocok dengan `VERCEL_ENV` dan binding `system_config.database_environment`. Database baru dimulai `unbound` dan harus di-bind eksplisit. Rebind silang ditolak. Live cutover baru dianggap selesai setelah Vercel/Turso membuktikan database/token Development dan Production berbeda.

Development (`.env.local`):

```bash
npm run db:migrate
npm run db:bind-environment -- development
npm run db:integrity
```

Production (`.env.production.local` pada workstation tepercaya; operasi mutation hanya setelah backup terverifikasi):

```bash
npm run env:check:production
npm run db:migrate -- production
npm run db:bind-environment -- production
npm run db:integrity -- production
```

Migration melakukan preflight binding existing sebelum mutation sehingga target silang fail-closed. Jangan menjalankan `npm run env:push:development` dari `.env.local` yang menunjuk Production. Preview tidak boleh diberi credential database aktif. Jika database legacy yang sama masih dipakai dua scope, bind hanya salah satu scope lalu pisahkan database lainnya; jangan mencoba rebind silang untuk mempertahankan sharing.

## 3. Google OAuth + Firebase Authentication

Aktifkan Google provider pada Firebase dan pertahankan authorized domain untuk localhost serta `saldo-bersama.vercel.app`. Desktop dan mobile memakai tombol Google branded Saldo Bersama. Localhost/device emulation memakai Firebase popup untuk development. **Production tidak memakai `signInWithRedirect()` atau `/__/auth/*` lagi.** Tombol branded membuka server OAuth flow `/api/auth/google/start`; Google kembali ke callback `https://saldo-bersama.vercel.app/api/auth/google/callback`. Server memvalidasi signed `state` dan `nonce`, menukar authorization code ke Google ID token, menukar Google ID token melalui Firebase Identity Toolkit, lalu memakai verifier Firebase + registry `users` canonical sebelum membuat signed HttpOnly session. `ALLOWED_USERS_JSON` hanya dipakai untuk bootstrap/recovery Administrator pertama pada database kosong; menambah Member/Administrator operasional dilakukan dari **Pengaturan → Anggota** dan tidak memerlukan edit environment atau redeploy.

Pada Google Auth Platform → Clients → OAuth Web Client yang sama dengan `VITE_GOOGLE_CLIENT_ID`:

1. Authorized JavaScript origins tetap memuat `http://localhost:5173` dan `https://saldo-bersama.vercel.app` untuk Firebase popup development dan konfigurasi OAuth Web Client.
2. Authorized redirect URIs **wajib** memuat `https://saldo-bersama.vercel.app/api/auth/google/callback` persis.
3. URI lama `https://saldo-bersama.vercel.app/__/auth/handler` tidak lagi dipakai source canonical. Boleh dibiarkan sementara selama rollout, lalu dibersihkan setelah production desktop/mobile terbukti stabil.
4. Simpan client secret Web Client hanya sebagai `GOOGLE_OAUTH_CLIENT_SECRET` pada `.env.production.local` komputer tepercaya dan Vercel **Production Sensitive**. Jangan memakai prefix `VITE_`, jangan menaruh nilai secret di Git, ZIP, screenshot, log, issue, atau chat.

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
2. **Jangan generate key jika Production Web Push sudah aktif.** Periksa source secret yang sah pada `.env.production.local`/password manager dan jalankan `npm run env:check:production`. Generate pasangan baru hanya untuk initial provisioning atau rotasi Production yang disetujui:

   ```bash
   npx web-push generate-vapid-keys --json
   ```

   Salin hasil hanya ke `.env.production.local` pada komputer tepercaya. Jangan menaruh private key di chat, issue, screenshot, GitHub, ZIP, `.env.local`, atau variable `VITE_*`. Production dan Development wajib memakai pasangan berbeda setelah database terisolasi.
3. Isi satu grup lengkap pada profile Production:

   ```text
   VITE_VAPID_PUBLIC_KEY=<public-key>
   VAPID_PRIVATE_KEY=<private-key>
   VAPID_SUBJECT=https://saldo-bersama.vercel.app
   ```

4. Validasi pasangan key dan seluruh profile Production tanpa mencetak nilai secret:

   ```bash
   npm run env:check:production
   npm run env:status
   ```

5. Pastikan database Production sudah memakai schema v13, binding `production`, dan integrity check lulus. Migration hanya dijalankan bila memang ada migration pending dan backup telah terverifikasi:

   ```bash
   npm run db:migrate -- production
   npm run db:bind-environment -- production
   npm run db:integrity -- production
   ```

6. Jika dan hanya jika nilai environment memang berubah, sinkronkan environment Production secara eksplisit:

   ```bash
   npm run env:check:production
   npm run env:push:production
   ```

   Setelah itu commit/push source yang sudah lolos quality gate dan tunggu deployment Git-connected Vercel untuk commit tersebut berstatus `Ready`. Jangan menjalankan `npx vercel --prod` dari working tree yang masih memiliki perubahan lokal karena file yang belum dikomit dapat ikut terdeploy. Environment baru juga tidak berlaku pada deployment lama sebelum redeploy.
7. Seed Web Push **Development** secara terpisah. Jika Vercel Development sudah memiliki VAPID yang valid, jangan generate ulang; jalankan `npm run env:pull:development`, `npm run env:status`, dan `npm run diagnose`. Jika initial provisioning/rotasi Development memang diperlukan, buat pair Development terpisah lalu sinkronkan dengan `npm run env:push:development -- --settings-only`. Laptop/PC lain kemudian cukup menjalankan `npm run dev`; bootstrap menarik Development terbaru secara otomatis.
8. Pada Apps Script Properties, pastikan `JOBS_ENDPOINT_URL=https://saldo-bersama.vercel.app/api/jobs` dan `JOBS_SHARED_SECRET` sama dengan Vercel. Jalankan `installScheduledTrigger()` sekali dan pastikan hasilnya melaporkan `ready: true` serta `count: 1`.
9. Buka `/pengaturan` melalui HTTPS. Status backend harus `Siap` dan schema harus v13. Buka `/pengaturan/notifikasi`, ketuk tile Notifikasi perangkat, izinkan browser, lalu pastikan verifikasi otomatis berhasil pada setiap perangkat.
10. Desktop dan Android dapat diuji dari browser yang mendukung. Pada iPhone/iPad, tambahkan aplikasi ke Home Screen dan buka dari ikon aplikasi sebelum meminta izin.
11. Verifikasi `/api/jobs`, queue, delivery per perangkat, audit register/test/unregister, subscription 404/410, retry, serta backup terjadwal ketika tahap Push gagal.

## 6. Migration schema v13

Migration terbaru adalah `database/migrations/011_distributed_rate_limits.sql`. Migration v13 bersifat additive: menambah `rate_limit_buckets` durable untuk throttle lintas instance lalu menaikkan schema ke v13. Migration v12 `010_environment_sessions.sql` tetap menjadi dasar `user_sessions`, binding `database_environment`, dan scheduler heartbeat. Ledger/saldo dan field cost-sharing v11 tidak diubah.

Sebelum migration Production, buat backup teknis terverifikasi dan pastikan `.env.production.local` lolos pemeriksaan. Jalankan target Production secara eksplisit sebelum runtime v13 menerima traffic:

```bash
npm run env:check:production
npm run db:migrate -- production
npm run db:bind-environment -- production
npm run db:integrity -- production
```

Migration v11 `009_transaction_cost_sharing.sql` tetap menjadi dasar cost sharing, migration v10 `008_manual_reminders.sql` menjadi dasar pengingat manual, migration v9 `007_envelope_assignee.sql` menjadi dasar penerima jatah, dan migration v8 `006_account_ewallet_template.sql` menjadi dasar provider E-wallet canonical.

Backup schema v13 menyertakan data aplikasi canonical tetapi mengecualikan `user_sessions`, `rate_limit_buckets`, binding environment, maintenance flag, dan scheduler heartbeat. Runtime v13 tetap dapat membaca backup v3-v12 melalui normalisasi additive; backup lama diperlakukan sesuai field additive versi masing-masing. Rollback aman dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment. Jangan menghapus tabel/kolom langsung pada database aktif.

## 7. Release gate

```bash
npm ci
npm run env:check:production
npm run verify
npm run db:integrity -- production
# setelah deployment:
npm run prod:check
```

`npm run env:push:production` hanya dijalankan ketika perubahan environment memang menjadi bagian release yang sudah direview; jangan menjadikannya efek samping setiap release. Lanjutkan smoke test login Administrator/Member, create/update/cancel transaksi, transfer, conflict, Excel, status/register/test/unregister Web Push, retry dua perangkat, mirror, Calendar, backup, restore drill, dan PWA iOS/Android.

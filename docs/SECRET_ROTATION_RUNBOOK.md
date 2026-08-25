# Secret Rotation Runbook

Gunakan runbook ini bila `SESSION_SECRET`, `TURSO_AUTH_TOKEN`, `VAPID_PRIVATE_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_BRIDGE_SHARED_SECRET`, `JOBS_SHARED_SECRET`, atau credential privat lain pernah keluar dari secret store tepercaya, termasuk pernah masuk ZIP manual. Jangan menyalin nilai secret ke Git, issue, chat, screenshot, atau log.

## Boundary saat ini

Source v14 mewajibkan binding environment fail-closed dan tidak mendukung sharing Development/Production sebagai konfigurasi normal. Runbook tetap tidak boleh menganggap live isolation selesai sebelum evidence membuktikan dua database/token berbeda.

Konsekuensinya:

- rotasi token dilakukan per environment; jangan menyalin token Development ke Production atau sebaliknya;
- `DATABASE_ENVIRONMENT` dan database binding harus tetap cocok saat rotasi;
- jika live isolation belum terbukti, hentikan operasi destructive sampai target database dipastikan;
- `.env.local` tetap local-only dan tidak boleh masuk Git/ZIP/log/chat.

## Urutan rotasi `TURSO_AUTH_TOKEN`

1. Pastikan backup/integrity evidence terbaru tersedia sesuai risiko operasi.
2. Buat/rotasi token **secara terpisah** untuk database Development dan Production; jangan menyalin satu token lintas environment. Jika live target belum dapat dibedakan dengan pasti, hentikan rotasi dan verifikasi infrastruktur lebih dulu.
3. Simpan token baru hanya pada secret store/runtime yang sah.
4. Perbarui local `.env.local` pada komputer tepercaya.
5. Sinkronkan environment sesuai scope tanpa menampilkan nilai token. Setelah isolation, Development hanya menerima token Development dan Production hanya menerima token Production.
6. Buat deployment baru bila runtime memerlukan redeploy untuk membaca environment terbaru.
7. Verifikasi login, `system.health`, read transaksi, dan operation non-destructive yang relevan. Untuk perubahan data, gunakan test dummy hanya bila aplikasi masih pada fase trial dan preview memastikan tidak ada data nyata terdampak.
8. Setelah seluruh runtime yang diperlukan terbukti menggunakan token baru, revoke token lama di Turso.
9. Verifikasi ulang health dan catat evidence tanpa nilai secret.

Jangan revoke token lama sebelum runtime yang diperlukan terbukti memakai token baru. Setelah isolation, verifikasi dan revoke dilakukan per environment agar kegagalan Development tidak memaksa rollback credential Production.

## Urutan rotasi `SESSION_SECRET`

1. Buat secret acak baru minimal 32 karakter pada mesin/secret manager tepercaya.
2. Perbarui environment runtime yang menggunakan secret tersebut.
3. Deploy ulang bila diperlukan.
4. Verifikasi login baru berhasil. Session lama boleh menjadi invalid setelah rotasi dan user harus login ulang.
5. Pastikan tidak ada nilai secret di log, source, ZIP, atau screenshot evidence.

## Urutan rotasi VAPID Web Push

`VAPID_PRIVATE_KEY` dan `VITE_VAPID_PUBLIC_KEY` adalah satu pasangan kriptografis. Rotasi private key **wajib** diikuti public key pasangannya; jangan mencampur private key baru dengan public key lama. Pair Development dan Production harus tetap terpisah dan stabil per environment, bukan dibuat ulang per perangkat.

1. Generate satu VAPID key pair baru pada mesin/secret manager tepercaya untuk environment yang sedang dirotasi. Jangan menaruh private key di chat, Git, ZIP, screenshot, atau `VITE_*`.
2. Simpan private key baru sebagai `VAPID_PRIVATE_KEY` pada secret store environment tersebut dan public pair-nya sebagai `VITE_VAPID_PUBLIC_KEY`.
3. Jalankan environment check canonical untuk memastikan pair lengkap dan environment tidak memakai pair environment lain.
4. Deploy/sinkronkan runtime dan frontend yang memakai pair baru.
5. Karena subscription Web Push terikat application server key, anggap subscription lama perlu didaftarkan ulang. Uji unregister/register atau re-subscribe pada perangkat yang relevan; jangan menyalin subscription antar user/perangkat.
6. Jalankan `notifications.status`/test notification dan real-device smoke minimal pada browser/perangkat yang memang dipakai. Pastikan payload lock-screen tetap privacy-safe.
7. Setelah runtime dan perangkat yang diperlukan terbukti memakai pair baru, hapus private key lama dari secret store/credential history yang dapat direvoke. Simpan evidence tanpa nilai key.

## Urutan rotasi `GOOGLE_OAUTH_CLIENT_SECRET`

1. Buka Google Auth Platform pada project yang sama dengan Firebase dan OAuth Web Client yang ID-nya sama dengan `VITE_GOOGLE_CLIENT_ID`.
2. Buat client secret baru. Salin nilainya satu kali langsung ke secret store/`.env.production.local` komputer tepercaya; jangan taruh di chat, screenshot, Git, atau ZIP.
3. Pastikan authorized redirect URI production tetap `https://saldo-bersama.vercel.app/api/auth/google/callback`.
4. Jalankan `npm run env:check:production` lalu `npm run env:push:production`; tooling harus mengirim `GOOGLE_OAUTH_CLIENT_SECRET` sebagai Sensitive dan tidak mengirimkannya ke Vercel Development.
5. Deploy Production baru lalu uji login mobile real-device sampai Vercel Logs menunjukkan `session.oauth.start`, `session.login` dengan `flow=google-oauth-server` status 200, dan `GET /api/session` 200.
6. Setelah secret baru terbukti aktif, hapus/revoke client secret lama di Google Auth Platform.
7. Verifikasi ulang login branded desktop dan mobile production tanpa mencatat nilai credential pada evidence.

## Google bridge dan jobs secret

Bila `GOOGLE_BRIDGE_SHARED_SECRET` atau `JOBS_SHARED_SECRET` dirotasi, kedua sisi kontrak harus diperbarui secara terkoordinasi. Jangan menyatakan selesai sebelum Vercel dan Apps Script yang aktif memakai nilai baru dan probe/operation aman berhasil. Resource ID Google tidak boleh dipindahkan atau diganti hanya karena rotasi secret.

## Fail closed

Jangan melanjutkan bila:

- tidak dapat memastikan database Turso target adalah database canonical project;
- token/secret baru belum tersimpan pada runtime yang diperlukan;
- deployment baru belum sehat;
- ada kemungkinan nilai secret masuk source, archive, terminal history yang dibagikan, issue, atau chat;
- backup/integrity evidence diwajibkan oleh jenis operasi tetapi belum tersedia.

Source repository tidak dapat membuktikan credential lama sudah direvoke. Bukti rotasi adalah evidence operasional di Vercel/Turso/Apps Script dan harus disimpan tanpa nilai secret.

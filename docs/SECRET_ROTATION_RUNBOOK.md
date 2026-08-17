# Secret Rotation Runbook

Gunakan runbook ini bila `SESSION_SECRET`, `TURSO_AUTH_TOKEN`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_BRIDGE_SHARED_SECRET`, `JOBS_SHARED_SECRET`, atau credential privat lain pernah keluar dari secret store tepercaya, termasuk pernah masuk ZIP manual. Jangan menyalin nilai secret ke Git, issue, chat, screenshot, atau log.

## Boundary saat ini

Project **sengaja memakai satu database Turso** untuk runtime lokal dan Vercel Production sesuai ADR-0007. Runbook ini tidak membuat database Development terpisah dan tidak mengubah `TURSO_DATABASE_URL`.

Konsekuensinya:

- token Turso yang dirotasi tetap mengarah ke database Turso canonical yang sama;
- rotasi harus dikoordinasikan agar local tooling dan Production tidak memakai token yang sudah direvoke;
- data lokal bukan sandbox terisolasi. Jangan menjalankan migration eksperimen, reset destructive, atau data dummy setelah data nyata mulai digunakan;
- `.env.local` tetap local-only dan tidak boleh masuk Git/ZIP/log/chat.

## Urutan rotasi `TURSO_AUTH_TOKEN`

1. Pastikan backup/integrity evidence terbaru tersedia sesuai risiko operasi.
2. Buat token Turso baru untuk **database canonical yang sama**. Jangan membuat database baru sebagai bagian runbook ini.
3. Simpan token baru hanya pada secret store/runtime yang sah.
4. Perbarui local `.env.local` pada komputer tepercaya.
5. Sinkronkan environment Vercel Development/Production sesuai tooling canonical tanpa menampilkan nilai token.
6. Buat deployment baru bila runtime memerlukan redeploy untuk membaca environment terbaru.
7. Verifikasi login, `system.health`, read transaksi, dan operation non-destructive yang relevan. Untuk perubahan data, gunakan test dummy hanya bila aplikasi masih pada fase trial dan preview memastikan tidak ada data nyata terdampak.
8. Setelah seluruh runtime yang diperlukan terbukti menggunakan token baru, revoke token lama di Turso.
9. Verifikasi ulang health dan catat evidence tanpa nilai secret.

Jangan revoke token lama sebelum runtime yang diperlukan terbukti memakai token baru karena satu database ini dipakai bersama.

## Urutan rotasi `SESSION_SECRET`

1. Buat secret acak baru minimal 32 karakter pada mesin/secret manager tepercaya.
2. Perbarui environment runtime yang menggunakan secret tersebut.
3. Deploy ulang bila diperlukan.
4. Verifikasi login baru berhasil. Session lama boleh menjadi invalid setelah rotasi dan user harus login ulang.
5. Pastikan tidak ada nilai secret di log, source, ZIP, atau screenshot evidence.

## Urutan rotasi `GOOGLE_OAUTH_CLIENT_SECRET`

1. Buka Google Auth Platform pada project yang sama dengan Firebase dan OAuth Web Client yang ID-nya sama dengan `VITE_GOOGLE_CLIENT_ID`.
2. Buat client secret baru. Salin nilainya satu kali langsung ke secret store/`.env.local` komputer tepercaya; jangan taruh di chat, screenshot, Git, atau ZIP.
3. Pastikan authorized redirect URI production tetap `https://saldo-bersama.vercel.app/api/auth/google/callback`.
4. Jalankan `npm run env:push:production`; tooling harus mengirim `GOOGLE_OAUTH_CLIENT_SECRET` sebagai Sensitive dan tidak mengirimkannya ke Vercel Development.
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

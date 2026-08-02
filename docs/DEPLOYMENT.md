# Deployment

## Vercel environment

Gunakan `.env.example` sebagai daftar canonical. Variable `VITE_*` bersifat publik; jangan menyimpan secret di sana. Server-only wajib mencakup session secret, Turso URL/token, allowlist, Google bridge secret, jobs secret, serta VAPID private key bila push aktif.

## Turso

1. Buat database DEV dan production terpisah.
2. Simpan URL/token hanya di Vercel.
3. Jalankan `npm run db:migrate` terhadap target yang benar.
4. Jalankan `npm run db:integrity`.
5. Jangan menjalankan migration otomatis pada cold start API.

## Firebase

Aktifkan Google provider dan masukkan authorized domains untuk localhost serta domain Vercel. Backend tetap memverifikasi token dengan Firebase Identity Toolkit; allowlist frontend tidak cukup.

## Apps Script

1. Buat project bridge dari folder `apps-script/`.
2. Isi Script Properties sesuai `GOOGLE_INTEGRATIONS.md`.
3. Deploy Web App sebagai pemilik.
4. Isi URL deployment pada `GOOGLE_BRIDGE_WEB_APP_URL` Vercel.
5. Pasang scheduler melalui fungsi setup yang disediakan dan pastikan hanya satu trigger aktif.

## Google resources

- Spreadsheet mirror baru; share viewer kepada pasangan.
- Calendar khusus Saldo Bersama atau kalender shared yang disetujui.
- Folder Drive khusus backup dengan akses minimum.

## Release gate

```bash
npm ci
npm run check
npm run db:integrity
```

Lanjutkan smoke test login owner/member, create/update/cancel transaksi, transfer, conflict, Excel, push, mirror, Calendar, backup, restore DEV, PWA iOS/Android. Production NO-GO bila salah satu financial parity atau restore drill belum lulus.


## Deployment Google bridge

Manifest bridge memakai `executeAs: USER_DEPLOYING` dan `access: ANYONE_ANONYMOUS`. Pastikan shared secret minimal 32 karakter, simpan hanya di Vercel dan Script Properties, lalu uji request tanpa signature ditolak.

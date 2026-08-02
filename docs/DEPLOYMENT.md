# Deployment

## 1. Environment canonical

Gunakan `docs/ENVIRONMENT_VARIABLES.md` sebagai satu-satunya daftar nama variable. Hapus entry Vercel lama terlebih dahulu, lalu buat satu entry per key hanya pada scope **Production**. Preview dan Vercel Development tidak digunakan.

Variable `VITE_*` bersifat publik. Secret tidak boleh memakai prefix `VITE_`. Setelah environment berubah, deployment Production wajib dijalankan ulang.

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

## 5. Release gate

```bash
npm ci
npm run env:check
npm run env:push:production
npm run check
npm run db:integrity
```

Lanjutkan smoke test login owner/member, create/update/cancel transaksi, transfer, conflict, Excel, push, mirror, Calendar, backup, restore drill, dan PWA iOS/Android.

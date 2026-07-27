# Deployment dan aktivasi produksi

## 1. Siapkan lingkungan terpisah

Buat resource terpisah:

- `Saldo Bersama - DEV`
- `Saldo Bersama - PROD`

Masing-masing memakai Firebase project, spreadsheet, Calendar ID, Apps Script
deployment, folder backup, dan environment variable yang berbeda.

## 2. Firebase Google login

1. Buat project Firebase.
2. Aktifkan Authentication → Google provider.
3. Tambahkan domain deployment pada Authorized domains.
4. Simpan konfigurasi browser pada `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY`.
5. Simpan `FIREBASE_WEB_API_KEY` pada environment server untuk verifikasi ID token.

Firebase config frontend bukan secret. Private key/service account tidak boleh
masuk repository.

## 3. Google Sheets dan Apps Script

1. Buat spreadsheet kosong.
2. Buka Extensions → Apps Script.
3. Salin seluruh file `apps-script/*.gs` dan `apps-script/appsscript.json` ke project Apps Script yang sama.
4. Isi Script Properties:

   - `SPREADSHEET_ID`
   - `INTERNAL_SHARED_SECRET` (acak, panjang minimal 32 byte)
   - `CALENDAR_ID`
   - `BACKUP_FOLDER_ID`
   - `PUSH_ENDPOINT_URL` — URL production `/api/push`, opsional sampai Web Push diaktifkan

5. Jalankan `setupSaldoBersama()` sekali dari editor dan setujui izin.
6. Deploy sebagai Web App, execute as pemilik script.
7. Simpan URL deployment ke `APPS_SCRIPT_WEB_APP_URL` pada Vercel.
8. Login menggunakan owner pertama dari `ALLOWED_USERS_JSON`, jalankan `system.initialize`, lalu jalankan integrity check.
9. Jalankan `setupScheduledTriggers()` hanya setelah Calendar, backup, dan Web Push DEV selesai diuji.

Apps Script Web App dapat menerima request publik karena autentikasi internal
menggunakan HMAC, timestamp, nonce, dan allowlist. Jangan memanggil endpoint itu
langsung dari browser.

## 4. Google Calendar bersama

1. Buat kalender bernama `Saldo Bersama`.
2. Bagikan kepada pasangan menggunakan alamat Google yang benar.
3. Berikan izin yang sesuai; jangan gunakan kalender utama.
4. Salin Calendar ID ke Script Properties `CALENDAR_ID`.
5. Jalankan sinkronisasi uji di DEV.

Event tidak boleh berisi saldo, nominal, nomor rekening, atau catatan sensitif.

## 5. Web Push

1. Buat VAPID key pair dan simpan hanya di environment server.
2. Isi `VITE_VAPID_PUBLIC_KEY` untuk subscription browser.
3. Isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` pada server.
4. Isi URL route production `/api/push` sebagai `PUSH_ENDPOINT_URL`; signature memakai `INTERNAL_SHARED_SECRET` yang sama.
5. Jalankan `setupScheduledTriggers()` untuk membuat trigger notifikasi dan backup terjadwal.
6. Uji register, revoke, deduplikasi, quiet hours, endpoint kedaluwarsa, dan
   retry maksimal tiga kali.

## 6. Google Drive backup

Buat satu folder backup. Gunakan subfolder operasional:

```text
daily/
monthly/
manual/
safety/
```

Trigger Apps Script harian menjalankan backup DEV/PROD sesuai jadwal. Uji restore
harus dilakukan pada spreadsheet DEV, bukan langsung pada PROD.

Restore menggunakan dua action Owner-only: `restore.preview` dengan `backupFileId`,
kemudian `restore.apply` dengan `previewToken`, file yang sama, dan frasa
`RESTORE SALDO BERSAMA`. Eksekusi otomatis mengaktifkan maintenance, membuat
safety backup, memvalidasi hasil, dan rollback ke safety backup bila gagal.

## 7. Environment deployment

Salin `.env.example` ke penyimpanan environment platform. Jangan commit `.env`.
Pastikan preview dan production mempunyai value terpisah.

## 8. Gate sebelum data nyata

- API status menunjukkan `connected`.
- Login akun di luar allowlist ditolak.
- Owner dan member mendapat batas aksi berbeda.
- Create expense/income/transfer lulus.
- Double submit hanya menghasilkan satu transaksi.
- Transfer total kekayaan tidak berubah.
- Calendar gagal tidak menggagalkan transaksi.
- Backup dan integrity check berhasil.
- Restore drill berhasil pada DEV.
- Tampilan desktop dan mobile diperiksa.

Sampai seluruh gate lulus, gunakan data uji.

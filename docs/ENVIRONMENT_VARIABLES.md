# Environment Variables

Dokumen ini adalah daftar **canonical** untuk Vercel dan `.env.local`. Jangan menambahkan nama lain tanpa perubahan source dan review.

## Kebijakan environment

- Project memakai satu database Turso yang sama untuk Development lokal dan Production, sesuai keputusan pemilik.
- Vercel menggunakan scope **Development + Production**. Preview tidak diberi secret atau akses database.
- `.env.local` boleh ditarik dari Vercel Development melalui `npm run dev`, tetapi tidak pernah di-commit.
- Variable `VITE_*` bersifat publik dan masuk ke bundle browser.
- Setelah variable Vercel berubah, lakukan deployment baru; deployment lama tidak memperoleh nilai baru.

## Vercel canonical

### Core — wajib

| Key | Scope | Sensitive | Keterangan |
|---|---|---:|---|
| `VITE_APP_NAME` | Development + Production | Tidak | Nama aplikasi |
| `VITE_GOOGLE_CLIENT_ID` | Development + Production | Tidak | OAuth Web Client ID Google |
| `VITE_FIREBASE_API_KEY` | Development + Production | Tidak | Firebase Web API key; dipakai frontend dan backend |
| `ALLOWED_USERS_JSON` | Development + Production | Ya | Dua email dan role canonical |
| `ALLOWED_ORIGINS` | Development + Production | Tidak | `http://localhost:5173,https://saldo-bersama.vercel.app` |
| `SESSION_SECRET` | Development + Production | Ya | Minimal 32 karakter acak |
| `TURSO_DATABASE_URL` | Development + Production | Ya | URL database Turso tunggal |
| `TURSO_AUTH_TOKEN` | Development + Production | Ya | Token database Turso |

### Logging — opsional

| Key | Scope | Sensitive | Nilai default |
|---|---|---:|---|
| `LOG_LEVEL` | Development + Production | Tidak | `info` |

### Google bridge — opsional sebagai satu grup

Ketiga key harus lengkap atau seluruh grup dibiarkan kosong.

| Key | Scope | Sensitive |
|---|---|---:|
| `GOOGLE_BRIDGE_WEB_APP_URL` | Development + Production | Ya |
| `GOOGLE_BRIDGE_SHARED_SECRET` | Development + Production | Ya |
| `JOBS_SHARED_SECRET` | Development + Production | Ya |

ID Spreadsheet, Calendar, folder Drive, dan URL scheduler **tidak disimpan di Vercel**. Nilai tersebut hanya berada di Apps Script Properties.

### Web Push — opsional sebagai satu grup

| Key | Scope | Sensitive |
|---|---|---:|
| `VITE_VAPID_PUBLIC_KEY` | Development + Production | Tidak |
| `VAPID_PRIVATE_KEY` | Development + Production | Ya |
| `VAPID_SUBJECT` | Development + Production | Tidak |

## Apps Script Properties canonical

```text
GOOGLE_BRIDGE_SHARED_SECRET
MIRROR_SPREADSHEET_ID
GOOGLE_CALENDAR_ID
BACKUP_FOLDER_ID
JOBS_ENDPOINT_URL
JOBS_SHARED_SECRET
```

`JOBS_ENDPOINT_URL` harus bernilai:

```text
https://saldo-bersama.vercel.app/api/jobs
```

## Nama legacy yang wajib dihapus

```text
INTERNAL_SHARED_SECRET
APPS_SCRIPT_WEB_APP_URL
FIREBASE_WEB_API_KEY
VAPID_PUBLIC_KEY
VITE_DEV_MODE
SPREADSHEET_ID
MIRROR_SPREADSHEET_ID        # dari Vercel saja; tetap ada di Apps Script Properties
GOOGLE_CALENDAR_ID           # dari Vercel saja; tetap ada di Apps Script Properties
BACKUP_FOLDER_ID             # dari Vercel saja; tetap ada di Apps Script Properties
JOBS_ENDPOINT_URL            # dari Vercel saja; tetap ada di Apps Script Properties
```

## Verifikasi lokal

```bash
npm run env:check
npm run diagnose
```

Kedua command hanya menampilkan status nama variable, bukan isi secret.

## Reset Vercel

1. Simpan `.env.local` yang sudah benar dan pastikan `git check-ignore -v .env.local` berhasil.
2. Di Vercel Project Settings → Environment Variables, hapus seluruh entry lama melalui menu tiga titik.
3. Buat ulang hanya key pada tabel **Vercel canonical**.
4. Pilih scope Development + Production untuk satu entry per key; jangan buat duplikat terpisah.
5. Jangan centang Preview.
6. Redeploy Production.
7. Tarik ulang Development env bila diperlukan:

```bash
npx vercel env pull .env.local --environment=development --yes
npm run env:check
```

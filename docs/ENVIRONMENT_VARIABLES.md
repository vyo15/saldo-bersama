# Environment Variables

Dokumen ini adalah daftar **canonical** untuk Vercel Production dan `.env.local`. Jangan menambahkan nama lain tanpa perubahan source dan review.

## Kebijakan environment

- Project memakai satu database Turso untuk runtime lokal dan Vercel Production.
- Vercel hanya memakai scope **Production**.
- Vercel Preview dan Development sengaja dibiarkan kosong.
- Runtime lokal hanya membaca `.env.local`; `npm run dev` tidak menarik environment dari Vercel.
- `.env.local` tidak pernah di-commit, dimasukkan ZIP, atau dibagikan melalui chat.
- Sensitive Production variables tidak boleh dijadikan sumber bootstrap yang perlu dibaca kembali. Simpan salinan lokal melalui password manager atau media rahasia yang disetujui.
- Variable `VITE_*` bersifat publik dan masuk ke bundle browser.
- Setelah variable Vercel berubah, buat deployment Production baru; deployment lama tidak memperoleh nilai baru.

## Vercel Production canonical

### Core — wajib

| Key | Scope | Sensitive | Keterangan |
|---|---|---:|---|
| `VITE_APP_NAME` | Production | Tidak | Nama aplikasi |
| `VITE_GOOGLE_CLIENT_ID` | Production | Tidak | OAuth Web Client ID Google |
| `VITE_FIREBASE_API_KEY` | Production | Tidak | Firebase Web API key; dipakai frontend dan backend |
| `ALLOWED_USERS_JSON` | Production | Ya | Dua email dan role canonical |
| `ALLOWED_ORIGINS` | Production | Tidak | `http://localhost:5173,https://saldo-bersama.vercel.app` |
| `SESSION_SECRET` | Production | Ya | Minimal 32 karakter acak |
| `TURSO_DATABASE_URL` | Production | Ya | URL database Turso tunggal |
| `TURSO_AUTH_TOKEN` | Production | Ya | Token database Turso |

### Logging — opsional

| Key | Scope | Sensitive | Nilai default |
|---|---|---:|---|
| `LOG_LEVEL` | Production | Tidak | `info` |

### Google bridge — opsional sebagai satu grup

Ketiga key harus lengkap atau seluruh grup dibiarkan kosong.

| Key | Scope | Sensitive |
|---|---|---:|
| `GOOGLE_BRIDGE_WEB_APP_URL` | Production | Ya |
| `GOOGLE_BRIDGE_SHARED_SECRET` | Production | Ya |
| `JOBS_SHARED_SECRET` | Production | Ya |

ID Spreadsheet, Calendar, folder Drive, dan URL scheduler **tidak disimpan di Vercel**. Nilai tersebut hanya berada di Apps Script Properties.

### Web Push — opsional sebagai satu grup

| Key | Scope | Sensitive |
|---|---|---:|
| `VITE_VAPID_PUBLIC_KEY` | Production | Tidak |
| `VAPID_PRIVATE_KEY` | Production | Ya |
| `VAPID_SUBJECT` | Production | Tidak |

## `.env.local` canonical

Gunakan key yang sama dengan tabel Vercel Production. Nilai Turso, session, allowlist, dan integrasi harus sama dengan Production yang sedang aktif. `ALLOWED_ORIGINS` tetap memuat origin localhost dan domain Production karena backend yang sama dipakai pada kedua runtime.

Buat file dari template:

```bash
cp .env.example .env.local
npm run env:check
npm run diagnose
```

`npm run dev` akan menolak berjalan bila key core belum lengkap. Jangan membuat fallback, token dummy, atau environment kedua.

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

Bersihkan key legacy, token OIDC sementara, duplikat, dan grup opsional yang belum lengkap terlebih dahulu:

```bash
npm run env:clean
npm run env:check
npm run diagnose
```

`env:clean` hanya mengubah `.env.local`. Grup Google bridge atau Web Push yang sudah lengkap dipertahankan; grup parsial dibuang agar tidak meninggalkan konfigurasi setengah jadi.

Kedua command hanya menampilkan status nama variable, bukan isi secret.

## Sinkronisasi otomatis ke Vercel Production

Setelah `.env.local` lulus `npm run env:check`, pastikan Vercel CLI dapat mengenali project melalui koneksi Git atau link lokal, lalu jalankan:

```bash
npm run env:push:production
```

Command hanya mengirim sembilan key canonical ke scope Production: delapan key core wajib dan satu key logging opsional (`LOG_LEVEL`); secret ditandai sebagai Sensitive, tidak mengisi Preview/Development, dan tidak mencetak nilai ke terminal. Validasi project dilakukan melalui Vercel CLI, bukan dengan mewajibkan file `.vercel/project.json`, karena project yang sudah terhubung lewat Git tetap valid. Setelah selesai, jalankan deployment Production baru.

## Reset dan sinkronisasi Vercel Production

1. Pastikan `.env.local` lengkap dan `git check-ignore -v .env.local` berhasil.
2. Hapus seluruh entry lama dari Vercel Project Settings → Environment Variables.
3. Buat ulang hanya key pada tabel **Vercel Production canonical**.
4. Pilih scope Production saja. Jangan centang Preview atau Development.
5. Tandai secret/token sebagai Sensitive.
6. Jalankan deployment Production baru.
7. Verifikasi `/api/health`, login, dan `POST /api/gateway`.

Jangan memakai `vercel env pull` sebagai bootstrap `.env.local`. Sensitive Production variables disimpan sebagai nilai yang tidak dapat dibaca kembali. Pada perangkat baru, salin `.env.local` melalui mekanisme rahasia yang disetujui, lalu jalankan `npm run env:check`.

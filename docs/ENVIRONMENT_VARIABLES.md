# Environment Variables

Dokumen ini adalah daftar **canonical** untuk Vercel Production dan Development serta `.env.local`. Jangan menambahkan nama lain tanpa perubahan source dan review.

## Kebijakan environment

- Project saat ini memakai satu database Turso untuk runtime lokal dan Vercel Production sesuai keputusan pemilik.
- Vercel **Development** menjadi source bootstrap `.env.local` untuk komputer tepercaya. Vercel Development hanya boleh diakses collaborator yang disetujui.
- Vercel **Production** menjadi runtime deployment production.
- Vercel **Preview** dibiarkan kosong agar preview tidak pernah menulis ke database aktif secara tidak sengaja.
- Nama key dapat terlihat dua kali di dashboard karena scope Development dan Production memang terpisah; itu bukan duplikat konflik.
- `.env.local` tidak pernah di-commit, dimasukkan ZIP, log, issue, atau chat.
- Variable `VITE_*` bersifat publik dan masuk ke bundle browser.
- Setelah variable Production berubah, buat deployment Production baru.
- Hanya collaborator Vercel yang dipercaya boleh memiliki akses project karena Development Environment dapat ditarik ke komputer lokal.

## Scope Development canonical

Development menyimpan delapan key core wajib dan satu key logging opsional, ditambah grup integrasi opsional yang lengkap. Nilainya harus sesuai runtime lokal yang disetujui.

### Core — wajib

| Key | Sensitive data | Keterangan |
|---|---:|---|
| `VITE_APP_NAME` | Tidak | Nama aplikasi |
| `VITE_GOOGLE_CLIENT_ID` | Tidak | OAuth Web Client ID Google |
| `VITE_FIREBASE_API_KEY` | Tidak | Firebase Web API key |
| `ALLOWED_USERS_JSON` | Ya | Dua email dan role canonical |
| `ALLOWED_ORIGINS` | Tidak | Memuat `http://localhost:5173` dan domain Production |
| `SESSION_SECRET` | Ya | Minimal 32 karakter acak |
| `TURSO_DATABASE_URL` | Ya | URL database Turso yang disetujui |
| `TURSO_AUTH_TOKEN` | Ya | Token database Turso |

### Logging — opsional

| Key | Nilai default |
|---|---|
| `LOG_LEVEL` | `info` |

### Google bridge — opsional sebagai satu grup

| Key |
|---|
| `GOOGLE_BRIDGE_WEB_APP_URL` |
| `GOOGLE_BRIDGE_SHARED_SECRET` |
| `JOBS_SHARED_SECRET` |

### Web Push — opsional sebagai satu grup

| Key |
|---|
| `VITE_VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_KEY` |
| `VAPID_SUBJECT` |

Grup opsional harus lengkap atau seluruh grup dibiarkan kosong. Development variables sengaja dapat ditarik oleh collaborator yang berwenang; jangan memberikan akses project Vercel kepada pihak yang tidak perlu melihat secret development.

## Scope Production canonical

Production memakai delapan key core dan satu key logging opsional yang sama namanya. Google bridge dan Web Push ditambahkan hanya bila fitur diaktifkan dan seluruh grup lengkap.

Secret/token Production harus diperlakukan sebagai secret deployment. `npm run env:push:production` hanya menyinkronkan delapan core dan `LOG_LEVEL`; perubahan integrasi opsional tetap mengikuti runbook integrasi yang disetujui.

## `.env.local` canonical

`.env.local` memakai key canonical yang sama dengan Development. Pada kondisi database tunggal saat ini, nilai Turso/allowlist/session yang aktif harus sesuai keputusan owner. Jangan membuat fallback, token dummy, atau database lokal kedua secara diam-diam.

`npm run dev` berperilaku sebagai berikut:

```text
.env.local lengkap
  → bersihkan OIDC/key legacy secara lokal
  → gunakan lokal, tanpa network Vercel

.env.local hilang/tidak lengkap + terminal interaktif
  → cek/login Vercel
  → cek/link project saldo-bersama
  → vercel env pull <temporary-file> dari scope Development
  → hapus VERCEL_OIDC_TOKEN/key legacy
  → validasi core
  → atomic replace .env.local
  → start server

pull/login/link/validasi gagal
  → pertahankan file lama
  → server tidak dijalankan
```

Vercel mendokumentasikan `vercel env pull <file>` sebagai export Development Environment ke file lokal. Script tidak menarik scope Production.

## Seed/sinkronisasi Development

Dari komputer yang memiliki `.env.local` valid:

```bash
npm run env:clean
npm run env:check
npm run env:push:development
```

Command mengirim core, `LOG_LEVEL`, dan grup opsional lengkap ke Development tanpa mencetak nilai. `vercel link` dapat menambahkan `VERCEL_OIDC_TOKEN`; script membersihkannya pada jalur sukses maupun gagal sehingga sinkronisasi tetap idempotent. Jalankan kembali hanya setelah perubahan environment lokal memang disetujui.

## Sinkronisasi Production

```bash
npm run env:check
npm run env:push:production
```

Command mengirim delapan key core dan `LOG_LEVEL` ke Production. Jalankan deployment Production baru setelah sinkronisasi.

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
VITE_DEMO_MODE
SPREADSHEET_ID
MIRROR_SPREADSHEET_ID        # dari Vercel saja; tetap ada di Apps Script Properties
GOOGLE_CALENDAR_ID           # dari Vercel saja; tetap ada di Apps Script Properties
BACKUP_FOLDER_ID             # dari Vercel saja; tetap ada di Apps Script Properties
JOBS_ENDPOINT_URL            # dari Vercel saja; tetap ada di Apps Script Properties
VERCEL_OIDC_TOKEN            # token sementara hasil CLI; tidak boleh disimpan di .env.local
```

## Verifikasi aman

```bash
npm run env:clean
npm run env:check
npm run diagnose
```

Command hanya menampilkan status/nama variable, bukan isi secret. Source validator dan clean ZIP tetap menolak `.env.local`, `.vercel`, token, dump database, serta file sementara.

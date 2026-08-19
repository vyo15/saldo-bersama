# Environment Variables

Dokumen ini adalah daftar **canonical** untuk Vercel Production dan Development serta `.env.local`. Jangan menambahkan nama lain tanpa perubahan source dan review.

## Kebijakan environment

Runtime Development canonical terdiri dari **sembilan key core wajib dan satu key logging opsional**; grup Google bridge dan Web Push mengikuti aturan kelengkapan masing-masing. Production menambahkan **satu secret auth wajib** untuk Google OAuth server-side.

- Project **masih** memakai satu database Turso untuk runtime lokal dan Vercel Production sampai exit criteria ADR-0007 dibuktikan. Target hardening yang disetujui adalah Development dan Production memakai database/token/session secret yang berbeda.
- Vercel **Development** menjadi source of truth bootstrap `.env.local` untuk komputer tepercaya. `npm run dev` pada terminal interaktif selalu menarik ulang Development sebelum server dimulai agar konfigurasi antar-PC tidak drift.
- Vercel **Production** menjadi runtime deployment production.
- Vercel **Preview** dibiarkan kosong agar preview tidak pernah menulis ke database aktif secara tidak sengaja.
- Nama key dapat terlihat dua kali di dashboard karena scope Development dan Production memang terpisah; itu bukan duplikat konflik.
- `.env.local` hanya cache lokal terjaga. File ini tidak pernah di-commit, dimasukkan ZIP, log, issue, atau chat.
- Variable `VITE_*` bersifat publik dan masuk ke bundle browser.
- Setelah variable Production berubah, buat deployment Production baru.
- Hanya collaborator Vercel yang dipercaya boleh memiliki akses project. Vercel Development dapat ditarik ke komputer lokal dan tidak mendukung mode Sensitive seperti Production/Preview. Karena itu `GOOGLE_OAUTH_CLIENT_SECRET` **tidak boleh disimpan pada scope Development**.
- Selama database masih shared, Web Push Development memakai pasangan VAPID yang sama dengan Production agar subscription pada database bersama tetap konsisten. Setelah database Development terisolasi, pasangan VAPID boleh dipisahkan/dirotasi per environment melalui perubahan reviewed; jangan membuat pasangan VAPID per perangkat.

## Scope Development canonical

Development menyimpan sembilan key core wajib dan satu key logging opsional. Web Push wajib lengkap dan valid untuk baseline local testing. Google bridge tetap opsional karena bergantung pada resource Apps Script/Sheets/Calendar/Drive yang diaktifkan terpisah.

### Core — wajib

| Key | Sensitive data | Keterangan |
|---|---:|---|
| `VITE_APP_NAME` | Tidak | Nama aplikasi |
| `VITE_GOOGLE_CLIENT_ID` | Tidak | OAuth Web Client ID Google |
| `VITE_FIREBASE_API_KEY` | Tidak | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Tidak | Firebase Auth domain publik untuk OAuth web |
| `ALLOWED_USERS_JSON` | Ya | Dua email dengan role `administrator` atau `member`; backend menormalisasi `administrator` ke compatibility key internal |
| `ALLOWED_ORIGINS` | Tidak | Memuat `http://localhost:5173` dan domain Production |
| `SESSION_SECRET` | Ya | Minimal 32 karakter acak |
| `TURSO_DATABASE_URL` | Ya | URL database Turso sesuai scope; setelah isolation, Development wajib menunjuk database Development |
| `TURSO_AUTH_TOKEN` | Ya | Token database Turso sesuai scope; setelah isolation tidak boleh sama dengan token Production |

### Logging — opsional

| Key | Nilai default |
|---|---|
| `LOG_LEVEL` | `info` |

### Web Push — wajib untuk Development canonical

| Key | Validasi |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Base64url uncompressed P-256 public key, 65 byte dan diawali byte `0x04` |
| `VAPID_PRIVATE_KEY` | Base64url private key, 32 byte |
| `VAPID_SUBJECT` | URI `mailto:` valid atau URL HTTPS publik. `https://localhost`, IP literal, dan hostname internal tidak diterima. |

Public dan private key harus berasal dari pasangan VAPID yang sama. `npm run env:check`, bootstrap Development, dan script sinkronisasi menolak pasangan yang tidak cocok. Rotasi key membuat subscription lama perlu didaftarkan ulang.

### Google bridge — opsional sebagai satu grup

| Key |
|---|
| `GOOGLE_BRIDGE_WEB_APP_URL` |
| `GOOGLE_BRIDGE_SHARED_SECRET` |
| `JOBS_SHARED_SECRET` |

Jika Google bridge diaktifkan, ketiga key harus lengkap. Satu konfigurasi pusat melayani halaman Integrasi Google, backup teknis, restore Drive, dan scheduler. Secret tidak pernah dimasukkan dari browser.

## Scope Production canonical

Production memakai sembilan key core dan satu key logging opsional yang sama namanya, ditambah satu secret auth wajib. Google bridge dan Web Push ikut disinkronkan hanya bila seluruh key pada grup terkait lengkap dan valid.

### Auth production — wajib dan Sensitive

| Key | Sensitive data | Keterangan |
|---|---:|---|
| `GOOGLE_OAUTH_CLIENT_SECRET` | Ya | Client secret untuk OAuth Web Client yang ID-nya sama dengan `VITE_GOOGLE_CLIENT_ID`; hanya dipakai server callback Google OAuth production dan tidak pernah masuk browser bundle |

`GOOGLE_OAUTH_CLIENT_SECRET` tidak boleh dibuat sebagai `VITE_*`, tidak boleh disimpan pada Vercel Development, dan tidak boleh dipull dari Development. Jika secret sudah ada pada `.env.local` komputer tepercaya, bootstrap Development mempertahankan assignment lokal tersebut saat core/settings lain direfresh dari Vercel Development. Jika key yang sama tidak sengaja muncul pada hasil pull Development, bootstrap membuang nilai Development tersebut dan tidak mengimpornya ke `.env.local`.

Secret/token Production harus diperlakukan sebagai secret deployment. `npm run env:push:production` mewajibkan `GOOGLE_OAUTH_CLIENT_SECRET` dan menyinkronkannya sebagai **Sensitive**, bersama core, `LOG_LEVEL`, serta grup Google bridge dan Web Push yang lengkap. Grup parsial atau key VAPID invalid membuat command berhenti sebelum mengubah Vercel.

## `.env.local` canonical

`.env.local` memakai key canonical Development dan boleh menyimpan `GOOGLE_OAUTH_CLIENT_SECRET` sebagai **production-only local credential** pada komputer tepercaya. Pada kondisi database tunggal saat ini, nilai Turso masih mengikuti database aktif yang disetujui. Setelah exit plan ADR-0007 dijalankan, `.env.local` yang ditarik dari Vercel Development wajib memakai database/token/session secret Development dan tidak boleh diarahkan kembali ke Production. Jangan membuat fallback, token dummy, atau pasangan VAPID baru per komputer.

`npm run dev` berperilaku sebagai berikut:

```text
terminal interaktif
  → bersihkan OIDC/key legacy lokal
  → cek/login Vercel bila diperlukan
  → cek/link project saldo-bersama
  → vercel env pull <temporary-file> dari scope Development
  → hapus VERCEL_OIDC_TOKEN/key legacy dan grup parsial
  → buang GOOGLE_OAUTH_CLIENT_SECRET bila salah ditempatkan di Development
  → pertahankan GOOGLE_OAUTH_CLIENT_SECRET lama hanya dari .env.local tepercaya
  → validasi sembilan core + Web Push wajib
  → atomic replace .env.local
  → start server

pull/login/link/validasi gagal
  → pertahankan .env.local lama
  → fail closed; server tidak dijalankan

terminal non-interaktif
  → tidak membuka login/network bootstrap
  → hanya menerima .env.local yang sudah valid
```

Refresh setiap start interaktif disengaja. Tujuannya agar perubahan allowlist, session, VAPID, atau konfigurasi settings pusat tidak tertinggal pada laptop/PC lain.

## Seed/sinkronisasi Development

### Seluruh environment canonical

Dari komputer tepercaya yang memiliki `.env.local` valid:

```bash
npm run env:clean
npm run env:check
npm run env:push:development
```

Command mengirim core, `LOG_LEVEL`, Web Push, dan Google bridge bila aktif ke Development tanpa mencetak nilai.

### Settings saja

Untuk menyalin konfigurasi settings tanpa menyentuh Turso, allowlist, Firebase, atau session:

```bash
npm run env:push:development:settings
```

Command ini selalu memerlukan Web Push valid dan hanya menyinkronkan:

```text
VITE_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
GOOGLE_BRIDGE_WEB_APP_URL       # bila grup Google bridge aktif
GOOGLE_BRIDGE_SHARED_SECRET     # bila grup Google bridge aktif
JOBS_SHARED_SECRET              # bila grup Google bridge aktif
```

Gunakan command settings dari komputer yang sudah memiliki pasangan VAPID canonical, misalnya PC yang notifikasinya sudah berfungsi. Jangan generate pasangan baru hanya untuk mengisi Development. Setelah seed selesai, komputer lain cukup menjalankan `npm run dev`.

`vercel link` dapat menambahkan `VERCEL_OIDC_TOKEN`; script membersihkannya pada jalur sukses maupun gagal. Development variable dapat dibaca collaborator project yang berwenang, sehingga akses Vercel harus dibatasi ketat.

## Sinkronisasi Production

```bash
npm run env:check
npm run env:push:production
```

Command mewajibkan dan mengirim `GOOGLE_OAUTH_CLIENT_SECRET` sebagai Sensitive, bersama core, `LOG_LEVEL`, serta grup Google bridge dan Web Push yang lengkap ke Production tanpa mencetak nilai secret. Jalankan deployment Production baru setelah sinkronisasi.

Jangan mengandalkan Production sebagai sumber untuk mengambil kembali secret Sensitive. Simpan sumber canonical secret hanya pada workflow tepercaya dan rotasi bila sumber tersebut hilang.



## Cutover Development/Production database isolation

Perubahan ini adalah operasi environment, bukan sekadar edit source. Jalankan hanya dari komputer tepercaya setelah backup/integrity evidence tersedia.

1. Buat database Turso **Development** baru.
2. Terapkan migration canonical sampai schema v11:
   ```bash
   npm run db:migrate
   npm run db:integrity
   ```
   Command di atas harus dijalankan dengan environment yang secara eksplisit menunjuk database Development.
3. Pastikan `system_config.timezone=Asia/Jakarta`, `currency=IDR`, dan business integrity lulus.
4. Siapkan token Development baru. Jangan reuse token Production setelah isolation.
5. Ubah Vercel **Development** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, dan `SESSION_SECRET` ke nilai Development. Jangan mengubah Production pada langkah ini.
6. Jalankan `npm run dev`, lalu `npm run env:check` dan smoke read/write menggunakan data dummy pada Development.
7. Verifikasi Vercel Production tetap memakai database/token Production dan aplikasi Production tetap sehat.
8. Setelah kedua scope terbukti terpisah, rotasi credential lama sesuai `SECRET_ROTATION_RUNBOOK.md` dan revoke token yang tidak lagi dipakai.
9. Simpan evidence tanpa nilai secret. Source baru boleh menyatakan isolation selesai setelah langkah di atas dibuktikan.

`npm run env:push:development` membaca `.env.local`; jangan menjalankannya sebelum memastikan `.env.local` sudah menunjuk database Development yang benar.

## Apps Script Properties canonical

```text
GOOGLE_BRIDGE_SHARED_SECRET
MIRROR_SPREADSHEET_ID
GOOGLE_CALENDAR_ID
BACKUP_FOLDER_ID
JOBS_ENDPOINT_URL
JOBS_SHARED_SECRET
```

`MIRROR_SPREADSHEET_ID`, `GOOGLE_CALENDAR_ID`, `BACKUP_FOLDER_ID`, dan `JOBS_ENDPOINT_URL` hanya berada di Apps Script Properties. `GOOGLE_BRIDGE_SHARED_SECRET` dan `JOBS_SHARED_SECRET` juga berada di Vercel dengan nilai yang sama; jangan menyalin resource ID Google ke Vercel atau `.env.local`.

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
MIRROR_SPREADSHEET_ID        # hapus jika ada di Vercel/.env.local; hanya Apps Script Properties
GOOGLE_CALENDAR_ID           # hapus jika ada di Vercel/.env.local; hanya Apps Script Properties
BACKUP_FOLDER_ID             # hapus jika ada di Vercel/.env.local; hanya Apps Script Properties
JOBS_ENDPOINT_URL            # hapus jika ada di Vercel/.env.local; hanya Apps Script Properties
VERCEL_OIDC_TOKEN            # token sementara hasil CLI; tidak boleh disimpan di .env.local
```

## Verifikasi aman

```bash
npm run env:clean
npm run env:check
npm run diagnose
```

Command hanya menampilkan status/nama variable, bukan isi secret. Source validator dan clean ZIP tetap menolak `.env.local`, `.vercel`, token, dump database, serta file sementara.


### Firebase Auth domain
`VITE_FIREBASE_AUTH_DOMAIN` adalah public Firebase web config. Nilai production saat ini `saldo-bersama.firebaseapp.com`; jangan menaruh secret pada key `VITE_*`.
### Firebase Auth domain belum ada di Vercel

`VITE_FIREBASE_AUTH_DOMAIN` termasuk **core environment**, bukan settings-only. Untuk project ini nilainya tetap `saldo-bersama.firebaseapp.com`. Jika bootstrap Development melaporkan key ini belum tersedia, tambahkan/sinkronkan key tersebut ke Vercel Development. `npm run env:push:development:settings` hanya untuk Web Push dan Google bridge, sehingga tidak dapat memperbaiki core key ini. Production juga tetap mempunyai nilai yang sama untuk Firebase public config/compatibility. Production desktop/mobile server OAuth tidak memakai Firebase browser redirect atau `/__/auth/*`; callback server menukar Google ID token ke Firebase ID token lalu verifier backend tetap menjadi authority sebelum allowlist/role dan session dibuat.


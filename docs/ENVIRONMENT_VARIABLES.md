# Environment Variables

Dokumen ini adalah daftar **canonical** untuk Vercel Production dan Development serta dua profile lokal pada setiap workstation tepercaya: `.env.local` (Development) dan `.env.production.local` (Production). Jangan menambahkan nama lain tanpa perubahan source dan review.

## Kebijakan environment

Runtime Development canonical terdiri dari **sepuluh key core wajib dan satu key logging opsional**; grup Google bridge dan Web Push mengikuti aturan kelengkapan masing-masing. Production menambahkan **satu secret auth wajib** untuk Google OAuth server-side.

- Source sekarang mewajibkan isolasi fail-closed: Development memakai `DATABASE_ENVIRONMENT=development`, Production memakai `DATABASE_ENVIRONMENT=production`, dan database harus di-bind ke nilai yang sama. Jika infrastruktur live masih memakai satu Turso database, hanya satu environment yang dapat berhasil di-bind; environment lain akan ditolak sampai database/token benar-benar dipisahkan. ADR-0007 baru dapat ditutup setelah evidence live separation tersedia.
- Vercel **Development** menjadi source of truth bootstrap `.env.local` untuk komputer tepercaya. `.env.local` sekarang **Development-only**; `npm run dev` pada terminal interaktif selalu menarik ulang Development sebelum server dimulai agar konfigurasi antar-PC tidak drift.
- Vercel **Production** menjadi runtime deployment production. Secret Production yang diberi atribut **Sensitive** bersifat write-only dan tidak dapat dipull kembali; setiap workstation tepercaya tetap mempunyai `.env.production.local` yang di-seed satu kali dari secret store canonical yang sama.
- Vercel **Preview** dibiarkan kosong agar preview tidak pernah menulis ke database aktif secara tidak sengaja.
- Nama key dapat terlihat dua kali di dashboard karena scope Development dan Production memang terpisah; itu bukan duplikat konflik.
- `.env.local` hanya cache lokal terjaga. File ini tidak pernah di-commit, dimasukkan ZIP, log, issue, atau chat.
- Variable `VITE_*` bersifat publik dan masuk ke bundle browser.
- Setelah variable Production berubah, buat deployment Production baru.
- Hanya collaborator Vercel yang dipercaya boleh memiliki akses project. Vercel Development dapat ditarik ke komputer lokal dan tidak mendukung mode Sensitive seperti Production/Preview. Karena itu `GOOGLE_OAUTH_CLIENT_SECRET` **tidak boleh disimpan pada scope Development**.
- Karena Development dan Production sekarang memakai database Turso terpisah, pasangan VAPID juga **wajib berbeda per environment**. Jangan membuat pasangan VAPID per komputer/perangkat; satu pair Development disimpan di Vercel Development dan satu pair Production disimpan di secret store/Vercel Production.

## Scope Development canonical

Development menyimpan sepuluh key core wajib dan satu key logging opsional. Web Push wajib lengkap dan valid untuk baseline local testing. Google bridge tetap opsional karena bergantung pada resource Apps Script/Sheets/Calendar/Drive yang diaktifkan terpisah.

### Core — wajib

| Key | Sensitive data | Keterangan |
|---|---:|---|
| `VITE_APP_NAME` | Tidak | Nama aplikasi |
| `VITE_GOOGLE_CLIENT_ID` | Tidak | OAuth Web Client ID Google |
| `VITE_FIREBASE_API_KEY` | Tidak | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Tidak | Firebase Auth domain publik untuk OAuth web |
| `ALLOWED_USERS_JSON` | Ya | Bootstrap/recovery Administrator. Minimal satu email Administrator tepercaya; anggota operasional tidak perlu dimasukkan ke environment. `administrator` dinormalisasi ke compatibility key internal `owner`. |
| `ALLOWED_ORIGINS` | Tidak | Memuat `http://localhost:5173` dan domain Production |
| `SESSION_SECRET` | Ya | Minimal 32 karakter acak |
| `TURSO_DATABASE_URL` | Ya | URL database Turso sesuai scope; setelah isolation, Development wajib menunjuk database Development |
| `TURSO_AUTH_TOKEN` | Ya | Token database Turso sesuai scope; setelah isolation tidak boleh sama dengan token Production |
| `DATABASE_ENVIRONMENT` | Tidak | Harus `development` pada Development dan `production` pada Production; runtime mencocokkan nilai ini dengan `VERCEL_ENV` dan binding database |

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

Public dan private key harus berasal dari pasangan VAPID yang sama. `npm run env:check`, bootstrap Development, dan script sinkronisasi menolak pasangan yang tidak cocok. Development dan Production tidak boleh memakai pasangan yang sama. Rotasi key membuat subscription lama pada environment terkait perlu didaftarkan ulang.

### Google bridge — opsional sebagai satu grup

| Key |
|---|
| `GOOGLE_BRIDGE_WEB_APP_URL` |
| `GOOGLE_BRIDGE_SHARED_SECRET` |
| `JOBS_SHARED_SECRET` |

Jika Google bridge diaktifkan, ketiga key harus lengkap. Satu konfigurasi pusat melayani halaman Integrasi Google, backup teknis, restore Drive, dan scheduler. Secret tidak pernah dimasukkan dari browser.

## Scope Production canonical

Production memakai sepuluh key core dan satu key logging opsional yang sama namanya, ditambah satu secret auth wajib. Google bridge dan Web Push ikut disinkronkan hanya bila seluruh key pada grup terkait lengkap dan valid.

### Auth production — wajib dan Sensitive

| Key | Sensitive data | Keterangan |
|---|---:|---|
| `GOOGLE_OAUTH_CLIENT_SECRET` | Ya | Client secret untuk OAuth Web Client yang ID-nya sama dengan `VITE_GOOGLE_CLIENT_ID`; hanya dipakai server callback Google OAuth production dan tidak pernah masuk browser bundle |

`GOOGLE_OAUTH_CLIENT_SECRET` tidak boleh dibuat sebagai `VITE_*`, tidak boleh disimpan pada Vercel Development, dan tidak boleh berada di `.env.local`. Bootstrap Development membuang key Production-only bila salah ditempatkan pada Vercel Development maupun cache lokal. Simpan sumber lokalnya hanya pada `.env.production.local` di komputer tepercaya.

Secret/token Production harus diperlakukan sebagai secret deployment. `npm run env:push:production` membaca `.env.production.local`, mewajibkan `GOOGLE_OAUTH_CLIENT_SECRET`, dan menyinkronkan secret sebagai **Sensitive**, bersama core, `LOG_LEVEL`, serta grup Google bridge dan Web Push yang lengkap. Grup parsial, key VAPID invalid, atau profile Production yang belum valid membuat command berhenti sebelum mengubah Vercel.

## Profile environment lokal canonical

`.env.local` adalah cache **Development-only**. File ini wajib memakai database/token/session secret Development dan `DATABASE_ENVIRONMENT=development`; jangan pernah diarahkan ke Production dan jangan simpan `GOOGLE_OAUTH_CLIENT_SECRET` di sini. `npm run dev` menolak marker Development yang salah, database unreachable, schema yang belum siap, atau binding database yang tidak cocok sebelum server dibuka.

`.env.production.local` adalah profile **Production-only** yang wajib ada pada PC/laptop tepercaya. `npm run dev` **tidak pernah membuat, membaca untuk mutation, atau menimpa** file ini. Bila file belum ada, `npm run prod` membuat skeleton aman satu kali lalu berhenti agar credential Production environment-specific dapat diisi secara eksplisit. File ini tidak dapat dipull lengkap dari Vercel karena secret Production Sensitive bersifat write-only. Setelah profile ada, `npm run prod` hanya membaca `.env.local` sebagai pembanding isolasi; command ini tidak menarik atau menulis Development. Jika grup Google bridge Development lengkap sementara grup Production lokal seluruhnya kosong, hanya tiga key bridge pusat yang boleh di-seed DEV → PROD lokal. Turso, session, OAuth, dan VAPID tidak pernah disalin lintas environment.

Jangan membuat fallback, token dummy, atau pasangan VAPID baru per komputer. Gunakan `npm run env:pull:development` untuk mengambil cache Development pusat dan `npm run env:status` untuk melihat fingerprint publik/isolasi tanpa membocorkan secret. Kedua file tetap gitignored dan tidak boleh masuk ZIP/log/chat.

`npm run dev` berperilaku sebagai berikut:

```text
terminal interaktif
  → bersihkan OIDC/key legacy lokal
  → cek/login Vercel bila diperlukan
  → cek/link project saldo-bersama
  → vercel env pull <temporary-file> dari scope Development
  → hapus VERCEL_OIDC_TOKEN/key legacy dan grup parsial
  → buang GOOGLE_OAUTH_CLIENT_SECRET bila salah ditempatkan di Development/cache lokal
  → validasi sepuluh core + DATABASE_ENVIRONMENT=development + Web Push wajib
  → atomic replace .env.local
  → preflight Turso reachable + schema/binding Development siap
  → start server

pull/login/link/validasi gagal
  → pertahankan .env.local lama
  → fail closed; server tidak dijalankan

terminal non-interaktif
  → tidak membuka login/network bootstrap
  → hanya menerima .env.local yang sudah valid
```

Refresh setiap start interaktif disengaja. Tujuannya agar perubahan bootstrap Administrator, session, VAPID, atau konfigurasi settings pusat tidak tertinggal pada laptop/PC lain.


## Matriks nilai yang sama vs berbeda

| Grup | Development vs Production | Aturan |
|---|---|---|
| `VITE_APP_NAME` | Sama | Identitas aplikasi |
| `VITE_GOOGLE_CLIENT_ID` | Sama | OAuth Web Client canonical yang sama |
| `VITE_FIREBASE_API_KEY` | Sama | Public Firebase config yang sama |
| `VITE_FIREBASE_AUTH_DOMAIN` | Sama | Public Firebase auth domain yang sama |
| `ALLOWED_ORIGINS` | Sama secara set | Memuat localhost canonical dan domain Production |
| `TURSO_DATABASE_URL` | **Berbeda** | Development → `saldo-bersama-dev`; Production → `saldo-bersama` |
| `TURSO_AUTH_TOKEN` | **Berbeda** | Token scope database masing-masing |
| `SESSION_SECRET` | **Berbeda** | Session Development dan Production tidak boleh saling valid |
| `DATABASE_ENVIRONMENT` | **Berbeda** | `development` vs `production` |
| VAPID public/private pair | **Berbeda** | Satu pair stabil per environment, bukan per komputer |
| `VAPID_SUBJECT` | Boleh sama | Contact URI, bukan secret |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Production saja | Tidak pernah ada di Development |
| Google bridge group | Boleh sama bila memakai deployment bridge yang sama | Jika URL bridge sama, secret bridge/jobs harus tetap pasangan canonical deployment tersebut |
| `ALLOWED_USERS_JSON` | Tidak diwajibkan sama | Hanya bootstrap/recovery; registry `users` di tiap DB adalah authority operasional |
| `LOG_LEVEL` | Tidak diwajibkan sama | Operasional saja |

`npm run env:status` menampilkan status aman dan `npm run env:check:production` memblok shared public drift serta credential/session/VAPID yang seharusnya terisolasi.

## Mode runtime harian

```bash
npm run dev
npm run prod
```

Hanya dua command ini yang perlu diingat untuk penggunaan rutin:

- `npm run dev` hanya mengurus Development: refresh Vercel Development, menulis `.env.local` atomik, memeriksa Turso Development + schema/binding, lalu menjalankan localhost. Command ini tidak menyentuh `.env.production.local`.
- `npm run prod` hanya mengurus jalur Production: memastikan `.env.production.local` tersedia/lengkap, membaca `.env.local` tanpa memodifikasinya untuk validasi isolasi, menyelaraskan **hanya** grup Google bridge pusat bila Production lokal kosong, menguji Turso Production secara read-only, memeriksa health Vercel Production + frontend shell, lalu membuka URL Production. Core readiness memblokir database/schema/binding/maintenance/integrity yang tidak aman; scheduler, integrasi Google, backup, dan notifikasi yang degraded tetap dilaporkan sebagai operational warning tanpa mematikan login/ledger yang core-nya sehat.

`npm run prod` tetap **bukan** localhost dengan credential Production. Production auth canonical bergantung pada HTTPS, Secure HttpOnly cookie, callback OAuth server, dan Vercel Production. Command maintenance lain tetap tersedia untuk operasi khusus tetapi bukan bagian workflow harian.

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

Untuk menyalin konfigurasi settings tanpa menyentuh Turso, bootstrap Administrator, Firebase, atau session:

```bash
npm run env:push:development -- --settings-only
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

Gunakan command settings dari komputer yang sudah memiliki pasangan VAPID **Development** canonical. Jangan generate pasangan baru hanya karena pindah laptop/PC; setelah seed selesai, komputer lain cukup menjalankan `npm run env:pull:development` atau `npm run dev`. Generate hanya untuk initial provisioning atau rotasi Development yang disengaja, lalu daftarkan ulang subscription Development bila key berubah.

`vercel link` dapat menambahkan `VERCEL_OIDC_TOKEN`; script membersihkannya pada jalur sukses maupun gagal. Development variable dapat dibaca collaborator project yang berwenang, sehingga akses Vercel harus dibatasi ketat.

## Sinkronisasi Production

```bash
npm run env:check:production
npm run env:push:production
```

Command mewajibkan dan mengirim `GOOGLE_OAUTH_CLIENT_SECRET` sebagai Sensitive, bersama core, `LOG_LEVEL`, serta grup Google bridge dan Web Push yang lengkap ke Production tanpa mencetak nilai secret. Jalankan deployment Production baru setelah sinkronisasi.

Jangan mengandalkan Production sebagai sumber untuk mengambil kembali secret Sensitive. Simpan sumber canonical secret hanya pada workflow tepercaya dan rotasi bila sumber tersebut hilang.



## Cutover Development/Production database isolation

Perubahan ini adalah operasi environment, bukan sekadar edit source. Jalankan hanya dari komputer tepercaya setelah backup/integrity evidence tersedia.

1. Buat database Turso **Development** baru.
2. Terapkan migration canonical sampai schema v15 pada Development, lalu bind dan jalankan integrity check. Command tanpa target membaca `.env.local`:
   ```bash
   npm run db:migrate
   npm run db:bind-environment -- development
   npm run db:integrity
   ```
   Rebind silang wajib ditolak dan migration memeriksa binding existing sebelum mutation.
3. Pastikan `system_config.timezone=Asia/Jakarta`, `currency=IDR`, `database_environment=development`, dan business integrity lulus.
4. Siapkan token Development baru. Jangan reuse token Production setelah isolation.
5. Ubah Vercel **Development** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, dan `DATABASE_ENVIRONMENT=development` ke nilai Development. Jangan mengubah Production pada langkah ini.
6. Pastikan Vercel **Production** tetap memakai database/token Production dan `DATABASE_ENVIRONMENT=production`. Dari komputer tepercaya, siapkan `.env.production.local`, ambil backup Production terverifikasi, lalu jalankan secara eksplisit:
   ```bash
   npm run env:check:production
   npm run db:migrate -- production
   npm run db:bind-environment -- production
   npm run db:integrity -- production
   ```
   Profile Production tidak pernah diambil dari `.env.local`; runtime v15 baru boleh menerima traffic setelah langkah ini lulus.
7. Jalankan `npm run dev`, lalu `npm run env:check` dan smoke read/write menggunakan data dummy pada Development.
8. Verifikasi aplikasi Production tetap sehat dan tidak pernah mengakses database Development.
9. Setelah kedua scope terbukti terpisah, rotasi credential lama sesuai `SECRET_ROTATION_RUNBOOK.md` dan revoke token yang tidak lagi dipakai.
10. Simpan evidence tanpa nilai secret. Source baru boleh menyatakan isolation selesai setelah langkah di atas dibuktikan.

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

`VITE_FIREBASE_AUTH_DOMAIN` termasuk **core environment**, bukan settings-only. Untuk project ini nilainya tetap `saldo-bersama.firebaseapp.com`. Jika bootstrap Development melaporkan key ini belum tersedia, tambahkan/sinkronkan key tersebut ke Vercel Development. `npm run env:push:development -- --settings-only` hanya untuk Web Push dan Google bridge, sehingga tidak dapat memperbaiki core key ini. Production juga tetap mempunyai nilai yang sama untuk Firebase public config/compatibility. Production desktop/mobile server OAuth tidak memakai Firebase browser redirect atau `/__/auth/*`; callback server memakai state/nonce + PKCE, menukar Google ID token ke Firebase ID token, lalu verifier backend menyelesaikan identitas terhadap registry `users` canonical sebelum registered session dibuat. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama.


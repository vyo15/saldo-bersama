# Setup

## 1. Runtime

Gunakan Node 24.x dan npm 10+. Versi project dipin pada `.node-version` ke Node 24.18.1. `npm run dev` dapat menjalankan `npm ci` otomatis ketika dependency workspace belum tersedia. Untuk validasi lokal setelah patch, command canonical adalah `npm run verify`; command ini memakai dependency yang sudah terpasang dan tidak menjalankan `npm ci`. `npm ci` tetap canonical untuk clean CI, clone/bootstrap baru, perubahan package/lockfile, atau reinstall dependency.

### Windows Git Bash

Gunakan `fnm` agar Node project tidak bertabrakan dengan instalasi Node global Windows:

```bash
winget install -e --id Schniz.fnm
grep -qxF 'eval "$(fnm env --use-on-cd --shell bash)"' ~/.bashrc || echo 'eval "$(fnm env --use-on-cd --shell bash)"' >> ~/.bashrc
source ~/.bashrc
fnm install 24.18.1
fnm default 24.18.1
fnm use
hash -r
node -v
npm -v
```

Hasil `node -v` harus `v24.18.1`. `fnm env --use-on-cd` membaca `.node-version` setiap kali Git Bash masuk ke repository.

### Windows: `npm ci` gagal `EPERM` pada Rollup/esbuild/native module

`npm ci` selalu membersihkan `node_modules` sebelum memasang dependency dari lockfile. Di Windows, proses Node/Vite yang masih berjalan dapat mengunci file native seperti `rollup.win32-x64-msvc.node`, sehingga npm gagal dengan `EPERM ... unlink`. Ini bukan alasan untuk mengganti `npm ci` dengan `npm install` atau mengubah lockfile.

1. Hentikan semua `npm run dev`, Vite preview, atau proses Node yang sedang memakai repository ini. Tutup terminal development yang masih aktif.
2. Jalankan cleanup dependency project:

```bash
npm run clean:dependencies -- --force
```

3. Setelah cleanup berhasil, install ulang secara canonical:

```bash
npm ci
```

4. Jika cleanup masih melaporkan `Dependency masih dikunci Windows`, tutup aplikasi yang memakai project ini. Bila lock tetap ada, restart Windows lalu ulangi langkah 2 dan 3. Jangan memakai `taskkill /F /IM node.exe` sebagai langkah default karena command tersebut dapat mematikan proses Node milik project lain.

Setelah dependency berhasil terpasang, jangan mengulang `npm ci` untuk setiap perubahan source. Gunakan:

```bash
npm run verify
```

`npm run verify` memeriksa Node 24 dan kesehatan dependency secara read-only melalui npm, lalu menjalankan check dan guard regression. Bila dependency tidak sinkron, verify berhenti dengan instruksi recovery tanpa menghapus `node_modules` secara otomatis.

Validator source menampilkan jumlah endpoint Vercel yang benar-benar aktif dan batas maksimum secara terpisah. Baseline saat ini adalah **5 Vercel Functions canonical** (`gateway`, `export`, `health`, `jobs`, `session`) dengan **batas maksimum 12**. Angka 12 bukan target jumlah function.

## 2. Onboarding

Baca `../AGENTS.md`, `WORKFLOW.md`, `GIT_WORKFLOW.md`, dan `PROJECT_STATUS.md` sebelum mengubah source. Validasi source aktual dan jalankan quality gate sesuai scope sebelum commit/push.

## 3. Bootstrap lokal otomatis

Pada komputer baru:

```bash
git clone <repository-url>
cd saldo-bersama
npm run dev
```

Alur `npm run dev` pada terminal interaktif:

1. Memeriksa `vite`, `react`, `@mantine/core`, dan `@fontsource-variable/manrope` dari workspace frontend.
2. Menjalankan `npm ci` hanya bila dependency tersebut belum tersedia.
3. Membersihkan token OIDC sementara dan key legacy dari `.env.local` bila file sudah ada.
4. Meminta login Vercel hanya bila sesi belum ada.
5. Menghubungkan repository ke project `saldo-bersama`; bila link otomatis gagal, membuka pemilihan project satu kali.
6. Menarik **Vercel Development Environment** terbaru ke file sementara pada setiap start interaktif.
7. Menghapus `VERCEL_OIDC_TOKEN`, key legacy, duplikat, serta grup opsional parsial.
8. Memvalidasi sembilan key core dan satu grup Web Push lengkap/valid.
9. Mengganti `.env.local` secara atomik hanya setelah hasil pull lolos validasi.
10. Menjalankan server lokal setelah dependency dan environment valid.

Refresh Development setiap start disengaja agar laptop, PC kantor, dan komputer tepercaya lain tidak menyimpan allowlist, session, VAPID, atau konfigurasi settings yang sudah tertinggal. Bila login, link, pull, atau validasi gagal, `.env.local` lama dipertahankan tetapi server tidak dijalankan. Terminal non-interaktif tidak membuka login/network bootstrap dan hanya menerima `.env.local` yang sudah valid.

## 4. Seed Vercel Development satu kali

Dari komputer tepercaya yang sudah memiliki `.env.local` canonical lengkap:

```bash
npm run env:clean
npm run env:check
npm run env:push:development
```

Untuk kebutuhan settings saja, gunakan command scoped berikut agar Turso, allowlist, Firebase, dan session tidak disentuh:

```bash
npm run env:push:development:settings
```

Command settings selalu menyinkronkan pasangan Web Push yang valid dan ikut menyinkronkan Google bridge bila grup tersebut sudah aktif di `.env.local`. Gunakan komputer yang sudah memakai pasangan VAPID canonical. Jangan generate VAPID baru per laptop atau browser.

Setelah Development terisi, komputer lain cukup menjalankan `npm run dev`. Tidak perlu copy/edit `.env.local` per perangkat. Izin notifikasi browser tetap harus diberikan satu kali oleh pengguna pada setiap browser/perangkat.

Production tetap terpisah:

```bash
npm run env:push:production
```

Setelah Production berubah, buat deployment Production baru. Command Production juga menyinkronkan grup Google bridge dan Web Push bila grup tersebut lengkap dan valid. Preview dibiarkan kosong.

Daftar canonical dan pemisahan scope ada di `ENVIRONMENT_VARIABLES.md`. Jangan commit `.env.local` atau `.vercel`.

## 5. Database

```bash
npm run db:migrate
npm run db:integrity
```

Migration hanya eksplisit. Administrator pertama hanya boleh bootstrap jika tabel users dan seluruh data bisnis masih kosong serta signed allowlist role adalah Administrator (`administrator`, dinormalisasi ke compatibility key internal). Karena runtime lokal dan Vercel Production memakai database yang sama, jangan membuat data dummy atau menjalankan destructive operation.

## 6. Integrasi Google

Deploy Apps Script bridge, isi Script Properties, buat spreadsheet mirror, Calendar, dan folder backup. Verifikasi `integration.health` sebelum menyalakan scheduler.

Saat deploy Web App, pilih **Execute as me/deployer** dan **Anyone/anonymous**. Keamanan berasal dari HMAC + timestamp + nonce, bukan sesi browser Google.

Jika Integrasi Google menampilkan `Gangguan`, jalankan `npm run diagnose` pada komputer tepercaya. Diagnostic membedakan liveness `/exec` dan signed health tanpa mencetak secret. `MESSAGE_EXPIRED` akan dicoba pulih satu kali dengan clock offset dari timestamp Apps Script, tetapi jam Windows tetap harus disinkronkan. `INVALID_SIGNATURE` berarti shared secret tidak cocok, sedangkan `UNKNOWN_ACTION`/`GOOGLE_BRIDGE_DEPLOYMENT_STALE` biasanya berarti deployment Web App masih versi lama dan perlu **New version**.

## 7. PWA dan Web Push

- iOS/iPadOS: buka melalui Safari, pilih Share, Add to Home Screen, lalu jalankan dari ikon aplikasi sebelum mengaktifkan notifikasi.
- Android/desktop: gunakan prompt Pasang Saldo Bersama atau jalankan dari browser HTTPS yang mendukung Push API.
- Desktop `http://localhost` dapat dipakai untuk development. Alamat LAN seperti `http://192.168.x.x` tidak aman dan harus ditolak. Pengujian ponsel memakai deployment HTTPS.
- Push permission hanya diminta setelah pengguna menekan Aktifkan.
- Status aktif memerlukan subscription browser dan registrasi backend yang cocok. Setelah aktivasi, backend mengirim notifikasi verifikasi otomatis. Pengguna tetap harus memeriksa status pada `/pengaturan/notifikasi` dan memastikan notifikasi benar-benar muncul pada perangkat.
- Bila permission ditolak, aktifkan kembali dari pengaturan browser atau sistem operasi.
- `/api/*` tidak dicache dan write offline ditolak.

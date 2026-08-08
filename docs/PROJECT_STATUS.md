# Project Status

## Google integration hardening final 2026-08-08

- **Source baseline diverifikasi:** `saldo-bersama-clean(20260808-075946).zip`, root `saldo-bersama/`, **351 file canonical**, schema tetap v6. Stack aktual: React 19 + Vite 7 + Firebase Google session + Vercel Functions + Turso sebagai source of truth; Apps Script hanya bridge Sheets/Calendar/Drive + scheduler.
- Baseline operator sebelum hardening ini pada Node 24.18.1 tetap hijau: source validation 351 file, lint/syntax PASS, frontend **84/84**, backend/business/security/tooling **147/147**, Vite build PASS, build budget PASS (**main JS 102139 B gzip; global CSS 17928 B gzip; 53 asset**), dan browser **9/9 PASS**.
- Production `/api/jobs` sudah lolos HMAC scheduler dengan HTTP 200. Mirror Sheets nyata sudah menghasilkan tab canonical dan full sync `system:sync` terbaru berstatus `completed`; histori `failed/dead_letter` sebelumnya berasal dari target Spreadsheet yang salah dan tidak mengubah Turso.
- Hardening final membuat signed `integration.health` memverifikasi **akses resource nyata**, bukan sekadar keberadaan Script Property: Spreadsheet harus dapat dibuka dan aman sebagai target mirror, Calendar harus dapat diakses, Drive folder harus dapat diakses, dan konfigurasi Jobs harus HTTPS + secret minimal 32 karakter.
- `MirrorService.gs` sekarang fail-closed terhadap spreadsheet non-kosong yang belum memiliki metadata canonical, menulis metadata sebelum data pada adopsi pertama, dan hanya menghapus `Sheet1` default bila kosong setelah sinkronisasi berhasil.
- Status Integrasi tidak menghapus histori outbox. Successful full snapshot Sheets/Calendar menyupersede failure lama untuk perhitungan status aktif; failure yang lebih baru tetap tampil sebagai `failed/dead_letter`.
- Konfigurasi lintas perangkat tetap terpusat: laptop/PC tepercaya cukup `npm run dev` untuk menarik Vercel Development. Resource ID Google hanya disetel satu kali pada Apps Script Properties; tidak perlu copy/edit `.env.local` atau mengulang setup Google per perangkat.
- Workflow deployment Apps Script tetap: `clasp push` memperbarui source, lalu Web App existing harus **Manage deployments -> Edit -> New version -> Deploy**. Jangan membuat URL `/exec` baru atau trigger kedua.
- Verifikasi sandbox hardening: `validate:source` **351 file PASS**, Apps Script syntax/boot **6 file/2 load order PASS**, `api/_lib/services/integrations.js` syntax PASS, dan focused integration + governance/source tests **41/41 PASS**. Full lint/build/browser setelah patch tetap wajib diulang pada Node 24.x operator karena clean ZIP tidak membawa `node_modules`.

### Status verifikasi operasional

- **Sheets:** full snapshot sudah pernah `completed` dan tab canonical terlihat pada resource dedicated. Setelah hardening dideploy, verifikasi `_Mirror_Metadata.schema_version=6`, `Sheet1` kosong hilang, dan UI tidak lagi menghitung failure historis sebagai masalah aktif.
- **Calendar:** queue sudah pernah `completed`, tetapi isi Calendar nyata tetap harus dicek sekali untuk memastikan hanya recurring `shared` dan tidak ada duplikasi/personal item.
- **Drive:** backup v6 contract dan regression sudah lulus; file backup nyata di folder Drive tetap harus dicek sekali sebelum verifikasi operasional ditutup.
- Jangan mengirim shared secret, Script Properties value, resource ID, token, `.env.local`, `.clasp.json`, atau private VAPID/Turso credential ke chat/repository.

> **Catatan histori:** seluruh section setelah blok current status ini adalah checkpoint pekerjaan sebelumnya. Angka test, baseline ZIP, dan status provisioning di section historis dipertahankan untuk audit trail dan tidak menggantikan status current di atas.

## Google integration readiness dan observability 2026-08-08

- **Source baseline diverifikasi:** `saldo-bersama-clean(20260808-035858).zip`, root `saldo-bersama/`, schema tetap v6. Stack aktual React 19 + Vite 7 + Firebase Google session + Vercel Functions + Turso; Apps Script tetap Google integration bridge.
- Baseline lokal pemilik sebelum patch ini: source validation 346 file lulus, frontend test 83/83 lulus, backend/business/security/tooling 141/141 lulus, Vite build dan build budget lulus. Browser suite 7/9 lulus; dua kegagalan berada pada journey Aktivitas anggota dan capability rekening personal pasangan. ESLint memiliki satu warning `react-hooks/exhaustive-deps` pada `MembersSettingsPage.jsx`. Tiga temuan tersebut berada di luar scope patch Integrasi Google ini dan belum diubah.
- `integrations.status` sekarang melakukan signed health probe hanya saat route status Integrasi Google diminta. `system.health` tetap tidak melakukan network probe eksternal.
- Provider tidak lagi diberi status `Siap` hanya berdasarkan bridge URL/secret. Sheets memerlukan mirror resource + jobs + satu trigger; Calendar memerlukan Calendar resource + jobs + satu trigger; Drive memerlukan folder backup. Health failure bersifat fail closed untuk UI dan tidak mengubah write Turso.
- Ringkasan queue memisahkan pending, processing, failed, dead-letter, dan completed. Timestamp sukses terakhir berasal dari `completed_at`, sehingga kegagalan terbaru tidak disalahartikan sebagai sinkronisasi berhasil.
- Resource ID Google tetap hanya berada pada Apps Script Properties. Tidak ada perubahan schema, auth, allowlist, role, saldo, transaksi, transfer, backup/restore contract, VAPID value, atau dependency.
- Google Calendar/Sheets nyata tetap belum dapat dinyatakan sinkron sampai bridge, Script Properties, deployment Apps Script, dan trigger operator dikonfigurasi serta health resource nyata lulus.

### Quality gate baseline operator

- `npm run validate:source`: PASS, 346 file.
- `npm run test`: frontend 83/83 PASS; backend/business/security/tooling 141/141 PASS.
- `npm run build`: PASS; `npm run build:budget`: PASS.
- `npm run test:browser`: 7/9 PASS, 2 FAIL pada area anggota/rekening yang tidak disentuh patch ini.
- `npm run lint`: 0 error, 1 warning pada `frontend/src/features/settings/MembersSettingsPage.jsx`; warning tersebut tidak disentuh karena berada di luar plan file-by-file yang disetujui.

### Verifikasi patch Integrasi Google

- Frontend static/contract setelah patch: 84/84 PASS.
- Backend/business/security/tooling setelah patch: 145/145 PASS memakai stub `web-push` sementara hanya untuk module resolution; stub sudah dihapus dan tidak masuk source/artifact.
- Source validation: 346 file PASS. Syntax Node: 96 file PASS. Apps Script syntax/boot: 6 file, 2 urutan load PASS.
- Focused Google bridge: 6/6 PASS, termasuk health resource, queue breakdown, dan fail-closed saat bridge tidak dapat dijangkau.
- Full ESLint/Vite build/build budget/browser suite belum diulang pada sandbox setelah patch karena runtime sandbox Node 22.16.0 dan dependency project tidak tersedia. Gunakan hasil baseline operator sebagai pembanding dan ulangi full gate pada Node 24.18.1 setelah patch diterapkan.

## Login, sidebar, anggota, dan aktivitas pencatat 2026-08-08

- **Source diverifikasi:** `saldo-bersama-clean(20260808-035320).zip`, root `saldo-bersama/`. Source aktual tetap React 19 + Vite 7 + Firebase Google session + Vercel Functions + Turso; Apps Script tetap integration bridge.
- Login normal state sekarang logo-first dan compact. Google Identity Services/Firebase exchange, config error, login error, dan retry session tetap canonical. Kredit `Vio Yusup Iskandar` menuju LinkedIn dengan `noopener noreferrer` dan target sentuh 44px.
- Sidebar desktop tetap memakai `sidebar-rail-mask.svg`/`sidebar-rail-mask-dark.svg` tanpa perubahan asset. Enam kontrol utama dirapatkan di tengah rail; submenu Perencanaan/Data keuangan menjadi anchored flyout pada trigger, ditutup melalui trigger, click-outside, route navigation, atau Escape dengan focus restoration.
- Akses anggota tetap owner-only dan memakai `users.list`/`users.upsert`/deactivate/reactivate guarded. UI berubah menjadi grid profil, search/filter role, modal tambah/ubah, dan action disclosure; destructive action tetap memakai confirmation canonical.
- Foto Google hanya digunakan untuk current session yang memang membawa `photoURL`; `users.list` dan schema v6 belum menyimpan foto anggota lain, sehingga fallback inisial tetap canonical dan tidak ada URL foto yang diarang.
- Aktivitas anggota memakai read-path existing `transactions.list.created_by` dan `reports.monthly.creatorExpenses`. Panel bersifat read-only, transfer tidak dijumlahkan sebagai pemasukan/pengeluaran, dan tombol `Lihat semua` membuka `/transaksi` dengan `location.state` untuk initial creator/period tanpa query URL. Desktop memakai right drawer; ≤820px memakai full-screen detail dengan focus trap dan safe area.
- Tidak ada perubahan schema, API contract, saldo, transaction write flow, Firebase auth, allowlist, role, backup/restore, environment, dependency, route canonical, atau asset rail. Playwright tidak ditambahkan; browser regression tetap Node test runner + Chromium/CDP.

### Verifikasi patch

- `npm run validate:source`: lulus, 346 file diperiksa pada source patch sebelumnya; verifikasi ulang terhadap baseline `035320` dilakukan sebelum distribusi patch kompatibel ini.
- Frontend static/contract patch sebelumnya: 83/83 lulus.
- `npm run test` patch sebelumnya: frontend lulus; full backend/business/security/tooling 141/141 lulus setelah stub `web-push` sementara hanya untuk module resolution. Stub dihapus dan tidak menjadi bagian source/artifact.
- `npm ci` pada sandbox sebelumnya terblokir karena Node 22.16.0 berada di bawah baseline Node 24.x/React Router dan registry sandbox tidak menyediakan `vite@7.3.6`. ESLint, Vite build, build budget, dan authenticated browser runtime tetap wajib diulang pada Node 24.x dengan registry npm lengkap setelah patch diterapkan.

## Centralized Settings environment 2026-08-08

- **Source diverifikasi:** `saldo-bersama-clean(20260808-025809).zip`, root `saldo-bersama/`.
- Vercel Development sekarang menjadi sumber environment lokal untuk komputer tepercaya. `npm run dev` interaktif selalu menarik Development terbaru sebelum server mulai.
- Baseline Development mewajibkan delapan core key dan Web Push lengkap/valid. Google bridge tetap opsional karena resource Apps Script/Sheets/Calendar/Drive belum dikonfigurasi pada environment yang dibuktikan saat review. Bila diaktifkan, tiga key bridge harus lengkap dan akan ikut tersinkron terpusat.
- `npm run env:push:development:settings` hanya menyinkronkan Web Push dan Google bridge yang aktif. Command ini tidak menyentuh Turso, allowlist, Firebase, session, role, schema, saldo, transaksi, backup contract, atau Production.
- Pengaturan yang hanya memakai API/Turso, yaitu Ringkasan, Akses anggota, Export, Import, Periode dan integritas, serta Audit, sudah portable melalui environment core dan database canonical. Backup/Pemulihan full backup dan Integrasi Google tetap bergantung pada Google bridge pusat, bukan konfigurasi per browser.
- `.env.local` lama tidak ditimpa jika pull/validasi Development gagal. Interactive dev fail closed agar komputer tidak berjalan diam-diam dengan konfigurasi pusat yang stale.
- Pesan UI Notifikasi dan Integrasi Google menjelaskan bahwa konfigurasi eksternal dikelola terpusat. Izin Web Push browser tetap memerlukan tindakan pengguna satu kali per browser/perangkat.
- Dokumen `README.md`, `ENVIRONMENT_VARIABLES.md`, `SETUP.md`, `DEPLOYMENT.md`, `GOOGLE_INTEGRATIONS.md`, `IMPLEMENTATION_MATRIX.md`, `QA_CHECKLIST.md`, `TEST_PLAN.md`, ADR-0007, dan ADR-0010 telah diselaraskan dengan source ini.

### Verifikasi patch

- Frontend static/contract: 82/82 lulus.
- Environment/tooling/governance focused: 54/54 lulus.
- Backend/business/security/tooling: 141/141 lulus dengan stub `web-push` sementara hanya untuk module resolution; stub sudah dihapus dan tidak menjadi bagian source/artifact.
- Source validation: 345 file lulus. Syntax Node: 96 file lulus. Apps Script: 6 file dan 2 urutan load lulus.
- `npm ci` terblokir pada sandbox: Node 22.16.0 berada di bawah baseline Node 24.x/React Router dan registry sandbox tidak menyediakan `vite@7.3.6`. Karena dependency lengkap tidak tersedia, ESLint, Vite build, dan build budget belum dapat diklaim.
- Browser test: 5/9 helper/contract lulus; 4 journey terblokir karena `frontend/dist/index.html` belum dapat dibangun di sandbox. Ulangi full gate pada Node 24.18.1 dengan registry npm lengkap.

### Operasional berikutnya

1. VAPID telah dipusatkan melalui scope Development/Production pada sesi operator 2026-08-08; jangan membuat pasangan VAPID per komputer dan jangan menaruh private key di source/dokumen. Deployment Production tetap harus diverifikasi setelah setiap rotasi environment.
2. Di laptop/PC tepercaya lain tarik source terbaru dan jalankan `npm run dev`. Expected log: Web Push `set`; tidak perlu copy/edit `.env.local`.
3. Google bridge masih harus diprovision terpisah: isi resource ID hanya pada Apps Script Properties, sinkronkan tiga key bridge secara pusat, deploy Apps Script, instal satu trigger, lalu pastikan `/pengaturan/integrasi` health-check `Siap`.
4. Sebelum merge/deploy, jalankan Node 24.18.1: `npm ci`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:budget`, dan `npm run test:browser`.

## CSS token, auto-zoom, contrast, dan archive tooling 2026-08-06

- Menambahkan token canonical `--font-size-body: 16px` dan mengganti seluruh custom property yang tidak pernah didefinisikan dengan token existing: `--border`, `--surface-soft`, `--text`, dan `--negative`.
- Filter periode Pembayaran keluar serta filter transaksi dashboard tablet sekarang memakai font 16px. Target sentuh filter dashboard dinaikkan ke control height 44px tanpa menonaktifkan zoom browser.
- Gradient avatar desktop, avatar user, dan shield login memakai endpoint `--primary` sampai `--primary-strong`, sehingga foreground semantic memenuhi kontras pada light dan dark theme. Kartu generic rekening tetap memakai `--primary-deep` flat.
- Media query Rekening 820px, selector responsive sederhana, transaction filter, empty state, dan mobile transaction item dikonsolidasikan tanpa mengubah route atau business flow. `!important` non-esensial pada empty widget dihapus.
- Test frontend kini memindai seluruh CSS untuk token statis yang tidak terdefinisi, menjaga pengecualian hanya untuk lima custom property runtime Login, serta memeriksa auto-zoom dan gradient contrast.
- `npm run zip` membuat ZIP sementara, memvalidasinya, mengganti output secara atomik, dan baru kemudian menghapus variasi archive clean lama. Custom output tidak membersihkan sibling; ZIP patch, backup, export, symlink, dan target non-file tidak dihapus.
- Schema, auth, role, API, saldo, transaksi, audit, backup data, restore, environment, dan deployment tidak berubah.

### Verifikasi patch

- Frontend static/contract: 82/82 lulus.
- Backend/business/security/tooling: 135/135 lulus dengan stub `web-push` sementara hanya untuk module resolution; stub dihapus setelah test dan tidak masuk source atau ZIP.
- Artifact hygiene: 6/6 lulus, termasuk replacement atomic, allowlist nama, custom output, dan perlindungan target non-file.
- Source validation: 345 file; syntax Node 96 file; Apps Script 6 file dan 2 urutan load; CSS 19 file tanpa parse error.
- `npm run zip` default diuji dengan tiga variasi archive lama: ketiganya dihapus setelah hasil baru valid, sedangkan ZIP patch dan file unrelated tetap tersedia.
- `npm ci --ignore-scripts` pada sandbox terblokir karena Node 22.16.0 tidak memenuhi baseline Node 24.x dan registry sandbox tidak menyediakan `vite@7.3.6`. ESLint, Vite build, build budget, dan empat browser journey yang membutuhkan `frontend/dist` wajib dijalankan ulang pada Node 24 dengan dependency lengkap.


## Web Push transport fix 2026-08-06

- Custom DNS lookup HTTPS Agent sekarang mengembalikan array saat Node meminta `options.all=true`, sehingga pengiriman tidak lagi gagal akibat kontrak callback yang salah.
- Failure code aman tersedia untuk DNS, timeout, TLS, jaringan, VAPID authorization, request rejection, endpoint block, dan subscription expiry. Endpoint, key subscription, dan response body provider tidak diekspos ke UI atau audit list.
- `VAPID_SUBJECT` berupa localhost, IP literal, atau hostname internal ditolak. Gunakan `mailto:` valid atau URL HTTPS publik.
- Schema, saldo, transaksi, auth, role, delivery per perangkat, backup, restore, dan Apps Script tidak berubah.


**Last source verification:** 2026-08-08
**Repository:** `vyo15/saldo-bersama`
**Source baseline:** `saldo-bersama-clean(20260808-035320).zip` + login/sidebar/member activity patch 2026-08-08
**Schema:** version 6, migrations `001_initial_schema.sql` sampai `004_notification_deliveries.sql`
**Runtime baseline:** Node 24.x, npm 10+

Dokumen ini adalah snapshot. Source dan test aktual tetap menjadi bukti implementasi utama.


## Lint, build budget, dan browser regression 2026-08-06

- Root metadata patch tidak dimasukkan ke source. `PATCH_MANIFEST.md` dan `DELETED_FILES.txt` tetap dianggap artefak distribusi, bukan file runtime.
- `AccountFinancialCard.jsx` tidak lagi menyimpan `detectedTemplate` yang tidak dipakai. Fallback akun Rekonsiliasi memakai konstanta array stabil agar dependency `useMemo` tidak berubah setiap render.
- CSS `.premium-*` yang tidak memiliki pemilik runtime dihapus dari stylesheet global. Panel rekening mobile dan form transaksi dashboard dipisah menjadi lazy chunk agar route `AccountsPage` dan `DashboardPage` tidak membawa UI modal yang belum dibuka.
- Browser test tidak lagi mengirim fungsi ke helper CDP yang hanya menerima expression string. Helper sekarang menolak expression non-string sebelum memanggil `Runtime.evaluate` dan menyertakan nama metode pada error CDP.
- Journey member memilih rekening pasangan melalui modal Daftar rekening, lalu membuka detail kartu aktif. Breakpoint test memakai selector runtime `.shared-transaction-tools`, bukan selector dashboard legacy.

### Verifikasi patch

- Frontend static/contract: 80/80 lulus.
- Backend/business/security/tooling: 130/130 lulus dengan stub `web-push` sementara hanya untuk module resolution; stub dihapus setelah test.
- Browser helper tanpa build: 5/5 lulus.
- Source validation: 343 file diperiksa; syntax Node 95 file; Apps Script 6 file dan 2 urutan load; CSS 19 file tanpa parse error.
- Build Vite, build budget, lint ESLint, serta tiga authenticated browser journey wajib diulang pada Node 24.x. Sandbox tidak dapat memasang `vite@7.3.6`, sehingga hasil runtime tersebut tidak diklaim.


## Modal mobile, Kategori, dan Pengaturan terpisah 2026-08-06

- Modal canonical menutup `overflow-x`, mempertahankan `overflow-y: auto`, menyembunyikan indikator scrollbar mobile, dan memberi `min-width: 0` pada grid, fieldset, field, serta file input agar child tidak mendorong viewport.
- Filter Transaksi mobile memakai grid dua kolom lalu satu kolom pada layar sempit. Kelompok ikon Kategori membungkus ke baris berikutnya. Horizontal gesture yang tersisa hanya berada pada komponen rekening yang memang berfungsi sebagai carousel/pemilih.
- Kategori memakai label Uang keluar, Uang masuk, dan Pengembalian dana. Sifat pengeluaran hanya muncul untuk Uang keluar. Nilai `savings` lama tetap dapat dibaca, tetapi kategori baru dengan sifat tersebut ditolak backend dan pengguna diarahkan ke Transfer atau Target.
- Pengaturan sekarang memiliki nested route `/pengaturan/notifikasi`, `/integrasi`, `/anggota`, `/export`, `/import`, `/backup`, `/pemulihan`, `/periode`, dan `/audit`. Ringkasan hanya memuat `system.health`; resource anggota, integrasi, arsip, periode, dan audit baru dimuat pada halaman terkait.
- Notifikasi perangkat hanya memiliki satu tile. Aktivasi berasal dari ketukan pengguna, dilanjutkan register backend dan verifikasi otomatis. Tombol uji terpisah dihapus; penonaktifan tetap memakai dialog konfirmasi.
- Google Sheets dan Calendar hanya muncul pada halaman Integrasi. Secret bridge tetap server-side. Anggota hanya melihat status, sedangkan sinkronisasi dan rebuild tetap owner-only serta dilindungi backend.
- Form akses dan daftar pengguna dipisah. Label role/status dilokalkan menjadi Pemilik, Anggota, Aktif, dan Nonaktif tanpa mengubah enum atau allowlist backend.
- Jadwal rutin menjelaskan bahwa Transfer BNI/BCA ke BTN tidak dihitung sebagai pengeluaran, dan saldo BTN baru berkurang ketika pembayaran aktual auto-debit disimpan.

### Verifikasi patch

- Frontend static/contract: 80/80 lulus.
- Backend/business/security/tooling: 130/130 lulus dengan stub `web-push` sementara hanya untuk module resolution; stub dihapus setelah test.
- Source validation: lulus, 341 file diperiksa dan 5/12 Vercel Functions canonical.
- Syntax Node: 95 file lulus. Parser frontend/test: 129 file lulus. Parser CSS: 19 file lulus. Apps Script: 6 file dan 2 urutan load lulus.
- Full dependency install, ESLint, Vite build, build budget, dan authenticated browser runtime tetap harus diulang pada Node 24.x dengan registry npm lengkap.

## Merge dua patch 2026-08-06

- Patch Web Push readiness pada base terbaru dipertahankan seluruhnya, termasuk kontrak `system.health` canonical, live region status, fixture schema v6, browser regression, deployment checklist, dan dokumentasi platform desktop/Android/iOS Home Screen.
- Patch UI/Menu/Anggaran diterapkan tanpa menimpa kesiapan Web Push: route `/anggaran`, Laporan read-only, pengelompokan menu, UI Rekening mobile, kontrol 16px, scrollbar tersembunyi, label rekening, dan restrukturisasi Pengaturan tetap tersedia.
- Konflik overlap diselesaikan melalui ancestor `saldo-bersama-clean(20260806-015600).zip`; source base `023043` terbukti hanya berbeda pada 10 file Web Push readiness.
- Schema tetap version 6. Tidak ada migration, secret, environment, auth, role, saldo, transaksi, backup, restore, atau Apps Script yang diubah.

## Patch kesiapan Web Push dan status backend

- Frontend Web Push, service worker, manifest PWA, register/unregister/test per perangkat, queue, delivery per subscription, retry, audit, dan scheduler tersedia pada source.
- Status backend memakai field `status`, `schemaVersion`, dan `maintenanceMode` dari action `system.health`; field lama `database` dan `schema.ready` tidak digunakan.
- Aktivasi Production tetap membutuhkan schema v6 aktif, pasangan VAPID valid, deployment baru setelah environment berubah, dan satu trigger Apps Script `runScheduledJobs`.
- Status operasional Production harus diverifikasi pada Vercel, Turso, Apps Script, desktop, Android, serta iOS Home Screen.

## UI mobile, Anggaran, dan pengelompokan fungsi 2026-08-06

- Route `/anggaran` menjadi tempat canonical untuk melihat, membuat, mengubah, dan mengarsipkan anggaran. Owner dapat melakukan write pada periode aktif; member dan periode historis tetap read-only. Laporan hanya menampilkan analisis anggaran vs aktual.
- Menu Perencanaan berisi Anggaran, Alokasi, Jadwal rutin, dan Target. Rekening/Kategori berada pada Data keuangan; Rekonsiliasi berada pada Kontrol saldo; Pengaturan berada pada Aplikasi. Route `/tagihan` dipertahankan untuk kompatibilitas.
- Kartu generic memakai warna flat. Ringkasan rekening dan quick action mobile menyatu dengan background halaman. Scrollbar visual disembunyikan tanpa mengunci scroll vertikal.
- Kontrol input/select/textarea memakai 16px secara langsung sehingga perlindungan auto-zoom iOS tidak bergantung pada breakpoint. Zoom manual dan pinch zoom tetap tersedia.
- Dropdown rekening transaksi menampilkan provider/jenis dan nama rekening tanpa suffix shared/personal atau nama pemilik, khusus pada form transaksi.
- Pengaturan dipisah menurut domain dan risiko. Notifikasi perangkat tetap dapat dikelola oleh setiap pengguna, sedangkan sinkronisasi Google, data management, recovery, periode, serta audit owner tetap mengikuti authorization backend.
- Alert anggaran dashboard dan Web Push kini membuka `/anggaran`; payload finansial privat dan kontrak delivery schema v6 tidak berubah.

### Verifikasi patch

- Frontend static/contract: 76/76 lulus.
- Backend/business/security/tooling: 129/129 lulus dengan stub module-resolution `web-push` sementara; stub dihapus setelah test dan tidak masuk source/artifact.
- Source validation: lulus, 325 file diperiksa dan 5/12 Vercel Functions canonical.
- Syntax Node: lulus, 95 file. Syntax frontend JSX/JS: lulus, 97 file. CSS parser: lulus, 18 file. Syntax dan boot Apps Script: lulus, 6 file dan 2 urutan load.
- `npm ci --ignore-scripts` terblokir karena sandbox memakai Node 22.16.0, sedangkan project memerlukan Node 24.x dan registry sandbox tidak menyediakan `vite@7.3.6`.
- Browser test: 3/7 helper test lulus; 4/7 journey terblokir karena `frontend/dist/index.html` belum dapat dibangun. Full ESLint, Vite build, build budget, dan browser runtime wajib diulang pada Node 24.x dengan registry lengkap.

## Full-height viewport dan route surface mobile 2026-08-06

- Root `html/body/#root`, `.app-shell`, `.app-shell__main`, dan `.app-content` sekarang membentuk flex column yang memenuhi viewport dengan fallback `100vh` lalu `100dvh`.
- Route Rekening memasang background mobile canonical pada shell, main, content, dan experience. Ruang aman untuk bottom navigation serta `env(safe-area-inset-bottom)` tetap dipertahankan, tetapi tidak lagi tampil sebagai strip background berbeda.
- Loading dan fatal error di luar shell memenuhi viewport. Loading, fatal error, dan 404 di dalam shell memenuhi sisa area konten tanpa menambah body scroll lock.
- Login mempertahankan `100svh` dengan fallback `100vh`; panel detail rekening memakai `100dvh` dengan fallback `100vh` agar address bar mobile tidak menghasilkan tinggi semu.
- Gesture kartu, tinggi stack, schema, API, authorization, transaksi, saldo, audit, backup, restore, environment, dependency, dan deployment tidak diubah.

### Verifikasi patch full-height

- Frontend static/contract: 74/74 lulus.
- Backend runner: 104 test lulus; 6 file gagal dimuat karena package `web-push` tidak tersedia setelah dependency install terblokir. Tidak ada backend production file yang diubah.
- Source validation: lulus, 322 file diperiksa dan 5/12 Vercel Functions canonical.
- Syntax Node: lulus, 95 file. Syntax dan boot Apps Script: lulus, 6 file dan 2 urutan load.
- Seluruh 17 stylesheet frontend valid melalui parser CSS. Browser contract file juga lulus syntax check.
- `npm ci --ignore-scripts` gagal karena registry sandbox tidak menyediakan `vite@7.3.6`; runtime sandbox Node 22.16.0 juga lebih rendah dari Node 24.x dan kebutuhan React Router 22.22.0. Karena itu lint ESLint, build Vite, build budget, dan 4 browser runtime journey yang membutuhkan `frontend/dist` tetap terblokir. Tiga browser helper test yang tidak membutuhkan build lulus.

## Previous: Koreksi gesture kartu rekening mobile 2026-08-05

- Gesture kartu aktif kembali memakai swipe vertikal agar arah jari selaras dengan geometri circular 3D stack. Swipe ke atas memilih rekening berikutnya dan swipe ke bawah memilih rekening sebelumnya.
- Pointer handler hanya dipasang pada kartu aktif. Area kosong pada stack tetap memakai `touch-action: pan-y pinch-zoom`, sehingga halaman dapat digulir dari luar kartu dan browser zoom tetap tersedia.
- Kartu aktif memakai `touch-action: pan-x pinch-zoom` agar swipe vertikal dapat dikendalikan aplikasi. Gerakan horizontal ditolak, swipe pendek kembali ke posisi semula, dan wheel switching dihapus agar trackpad tidak mengganti rekening tanpa sengaja.
- Keyboard stack memakai Arrow Up dan Arrow Down. Live region tetap hanya mengumumkan nama rekening aktif tanpa membacakan saldo.
- Tidak ada perubahan pada schema, API, authorization, transaksi, saldo, audit, backup, restore, environment, dependency, atau deployment.

### Verifikasi patch gesture

- Frontend static/contract: 73/73 lulus.
- Backend tanpa enam file yang membutuhkan package `web-push`: 104/104 lulus. Enam file penuh terblokir karena dependency tidak tersedia pada registry sandbox, bukan karena perubahan gesture.
- Source validation: lulus, 322 file diperiksa dan 5/12 Vercel Functions canonical.
- Syntax Node: lulus, 95 file. Syntax JSX target dan CSS target juga valid melalui parser TypeScript dan PostCSS.
- Syntax dan boot Apps Script: lulus, 6 file dan 2 urutan load.
- Full lint, build, build budget, serta browser runtime belum dapat dijalankan karena `npm ci` gagal mengambil `vite@7.3.6`; sandbox juga memakai Node 22.16.0, sedangkan project membutuhkan Node 24.x.

## Web Push, delivery per perangkat, dan schema v6 2026-08-05

- Frontend tidak lagi memblokir seluruh mode development. Web Push memakai pemeriksaan capability, secure context, status permission, kebutuhan Home Screen iOS, validitas public VAPID key, subscription browser, dan registrasi backend. Desktop localhost dapat dipakai untuk development; alamat IP LAN HTTP tetap ditolak.
- Status Pengaturan memisahkan belum aktif, izin diblokir, server belum siap, perlu daftar ulang, terdaftar belum diuji, dan terdaftar sudah diterima layanan push. Tombol uji hanya aktif untuk subscription actor yang terdaftar.
- Schema v6 menambah `notification_deliveries` per subscription. Retry hanya mengulang perangkat gagal dan tidak menggandakan perangkat yang sudah sukses. Subscription 404/410 atau endpoint yang berubah melalui DNS menjadi alamat privat dinonaktifkan dan delivery tertunda menjadi expired.
- Perpindahan endpoint aktif maupun nonaktif pada browser yang sama hanya diizinkan bila `p256dh` dan `auth` membuktikan subscription yang sama. Record pemilik lama dipensiunkan dengan ID historis tetap, bukan ditimpa. Rotasi VAPID membersihkan registrasi lama sebelum membuat subscription baru.
- Endpoint push harus HTTPS publik. Host lokal/internal, IP literal, serta hasil DNS private, loopback, link-local, reserved, multicast, atau documentation range ditolak melalui guarded HTTPS agent.
- Payload push tidak membawa judul/body finansial. Service worker memakai teks generik pada lock screen dan hanya membuka path same-origin yang tervalidasi. Pembersihan cache dibatasi ke prefix `saldo-bersama-`.
- Konfigurasi Production kini menyinkronkan grup Google bridge dan Web Push yang lengkap. Grup parsial, format VAPID invalid, atau pasangan public/private yang tidak cocok ditolak sebelum perubahan Vercel. Private key tidak pernah memakai prefix `VITE_`.
- Kegagalan antrean notifikasi atau pengiriman Push diisolasi dari scheduled backup. Timeout, stale lock recovery, attempt limit, dead letter, dan error code tersanitasi tersedia. Integrity check mendeteksi delivery lintas user, subscription aktif milik user nonaktif, dan queue terminal dengan delivery retryable.
- Backup teknis tetap tidak menyimpan push credential dan delivery operasional. Restore schema v6 menerima backup schema v3/v4/v5/v6, menghapus subscription lama, lalu mengharuskan perangkat mendaftar ulang.

### Verifikasi sandbox 2026-08-05

- Frontend static/contract: 73/73 lulus.
- Backend: 129/129 lulus.
- Source validation: lulus, 322 file diperiksa dan 5/12 Vercel Functions canonical.
- Syntax Node: lulus, 95 file.
- Syntax dan boot Apps Script: lulus, 6 file dan 2 urutan load.
- Dependency install tidak selesai karena sandbox memakai Node 22.16.0, sedangkan project membutuhkan Node 24.x dan React Router membutuhkan Node minimal 22.22. Registry sandbox juga tidak menyediakan tarball `vite@7.3.6`. Full lint, build, build budget, browser smoke, serta push nyata Android/iOS/Vercel/Apps Script belum dijalankan.

## Previous: rekening, rekonsiliasi, navigasi, dan accessibility 2026-08-05

- Stack kartu rekening mobile memakai swipe vertikal pada kartu aktif. Area di luar kartu tetap memakai `touch-action: pan-y pinch-zoom`, sedangkan gerakan horizontal tidak mengganti rekening.
- Kontrol `Daftar rekening` membuka daftar rekening aktif; tombol kembali mobile menuju Beranda secara deterministik; navigasi dari rekening ke Transaksi membawa filter rekening melalui navigation state, bukan URL.
- Quick action rekening dipersempit menjadi `Transaksi` dan `Pembayaran keluar`. Aksi `Bayar tagihan`, panel rekonsiliasi tertanam, serta penjelasan rekonsiliasi yang berulang dihapus dari halaman Rekening.
- Route `/rekonsiliasi` menjadi tempat canonical untuk pencocokan saldo. Form hanya tampil untuk rekening dengan `can_reconcile === true`; backend tetap memverifikasi capability, idempotency, dan audit. Selisih tidak membuat adjustment otomatis.
- Formatter label rekening terpusat menampilkan provider, nama rekening, dan pemilik personal bila perlu agar rekening bernama serupa tetap dapat dibedakan.
- Form transaksi tidak lagi mengisi metode pembayaran `transfer` secara tersembunyi. Nilai awal kosong dan pengguna harus memilih bila ingin mencatat metode pembayaran.
- Menu lainnya tidak menduplikasi `Tambah transaksi`; floating quick-add tidak tampil pada Dashboard atau route Transaksi; label aksi dashboard diselaraskan dengan perilaku navigasinya.
- Kontrol form mobile memakai font minimal 16px untuk mengurangi auto-zoom Safari. Geometri modal hanya berasal dari `Modal.module.css`; minimum width body yang berpotensi menyebabkan overflow viewport sempit dihapus.
- Tidak ada perubahan schema, migration, API contract, Firebase Auth, allowlist, role, perhitungan saldo, transfer, soft delete, audit backend, backup/restore, environment, dependency, atau deployment.

### Verifikasi sandbox 2026-08-05

- Frontend static/contract: 73/73 lulus.
- Backend: 118/118 lulus.
- Source validation: lulus, 320 file diperiksa dan 5/12 Vercel Functions canonical.
- Syntax Node: lulus, 94 file.
- Syntax dan boot Apps Script: lulus, 6 file dan 2 urutan load.
- Dependency install gagal karena registry sandbox tidak menyediakan tarball `vite@7.3.6`; runtime sandbox Node 22.16.0 juga lebih rendah dari baseline Node 24.x. Lint dan build kemudian terblokir karena `eslint`/`vite` tidak tersedia, build budget terblokir karena `frontend/dist` belum terbentuk, dan browser suite menghasilkan 3 lulus serta 4 terblokir karena `frontend/dist/index.html` tidak tersedia.

## Arsitektur aktif

- React 19, React Router, dan Vite PWA.
- Shared UI primitive memakai CSS Modules serta design tokens; feature dilarang direct import toolkit.
- Firebase Google Authentication dan signed HttpOnly session.
- Login mobile memakai logo resmi, komposisi glass card, background rupiah bergaya ilustratif CSS, theme toggle, reduced-motion fallback, trust messaging, dan kredit pembuat; host tombol Google canonical serta verifikasi backend tetap tidak berubah.
- Lima Vercel Functions canonical: session, gateway, export, health, jobs.
- Turso/libSQL sebagai satu-satunya source of truth finansial.
- Apps Script hanya integration bridge bertanda tangan untuk Sheets mirror, Calendar, Drive backup, dan scheduler.
- Google Sheets hanya mirror data `shared`; data personal tidak dikirim ke spreadsheet bersama.
- Web Push diproses melalui queue backend dan delivery per subscription pada schema v6.

## Struktur dan quality guard

- Backend planning, reporting, dan maintenance telah dipisah per domain dengan facade kompatibel.
- Metadata read/write, maintenance allowance, external side effect, dan kebutuhan idempotency berada di `api/_lib/actions/policy.js`; handler canonical berada di `api/_lib/actions/registry.js`.
- Frontend API transport, cache, error, dan facade feature telah dipisah; page/form tidak melakukan direct write melalui transport global.
- Dashboard dipisah menjadi orchestration page dan komponen desktop/mobile.
- Test backend dikelompokkan berdasarkan business, database, security, maintenance, integration, tooling, governance, migration, dan performance.
- Artifact policy, safe cleanup, clean ZIP verification, serta build budget tersedia.
- Browser smoke berbasis Chromium/CDP tersedia untuk redirect login, viewport mobile, overflow, target sentuh, landmark, accessible name, dan accessibility tree tanpa dependency browser-test tambahan.
- Integrasi axe penuh dan visual-regression baseline masih belum tersedia karena dependency tersebut belum menjadi bagian lockfile.



## Modal, template rekening, dan navigasi shell 2026-08-04

- Focus trap dialog memakai callback Escape melalui ref stabil. Mengetik pada controlled input tidak lagi memicu cleanup/setup trap, memindahkan fokus ke tombol tutup, atau memaksa pengguna mengklik field setiap karakter.
- Schema v5 menambah `accounts.bank_template` yang divalidasi backend. Template BCA/BNI/BTN/Mandiri/Permata kini disimpan terpisah dari `accounts.name`; mengganti template tidak mengubah nama rekening.
- Migration v5 memetakan suffix bank legacy ke field baru tanpa mengubah nama, saldo, transaksi, ownership, atau authorization. Restore v5 menerima backup v3/v4 dan menormalisasi field yang belum ada sebelum apply.
- Form tambah/edit mengirim template canonical, menyediakan initial focus pada Nama rekening, dan memakai placeholder nama yang netral. Preview kartu membaca template secara eksplisit.
- Sidebar desktop tetap memakai bentuk/mask melengkung Saldo Bersama, tetapi rail dan target sentuh diperbesar. Submenu disederhanakan menjadi daftar satu baris dengan close button aksesibel; menu mobile tidak lagi menduplikasi theme toggle dan logout dipisahkan ke footer.

## Rekening, kategori, authorization read-path, dan responsive parity 2026-08-03

- Route `/rekening` sekarang fokus pada daftar/detail rekening; pengelolaan kategori dipindahkan ke `/kategori` dengan API facade dan state mandiri.
- Panel detail rekening diperbesar hingga kolom 28–32rem, kartu detail maksimum 26.5rem, dan seluruh asset bank tetap rasio 1.586:1. Pada viewport sempit detail menjadi dialog overlay dengan focus trap, Escape, scroll lock, dan focus restoration setelah rekening dipilih. Nomor panjang dipadatkan hanya pada muka kartu; detail/copy tetap memakai nilai lengkap.
- Kedua pengguna aktif dapat membaca seluruh rekening dan ledger pasangan. Response rekening membawa `owner_name`, `is_owned_by_actor`, `can_transact`, `can_reconcile`, `can_manage`, dan `read_only` dari backend.
- Hak operasi tidak diperluas: member hanya dapat memakai shared atau personal miliknya, hanya dapat update/cancel transaksi sendiri pada scope operable, dan tidak dapat merekonsiliasi rekening personal pasangan.
- Transaction form menyaring pilihan write berdasarkan `can_transact`; daftar/filter transaksi, breakdown laporan, riwayat rekonsiliasi, dan alert rekening menampilkan label pemilik agar rekening bernama sama tidak ambigu.
- Total saldo dashboard tetap transparan untuk semua rekening, sedangkan saldo aman, batas harian, dana belum dialokasikan, dan jumlah transaksi belum dialokasikan hanya memakai rekening/scope yang dapat dioperasikan actor.
- Bug mobile `.two-column-grid,` yang menyembunyikan Tagihan, seluruh chart Laporan, serta kolaborasi/admin Pengaturan telah diperbaiki. Override `.settings-card` ≤580px juga dipulihkan.
- Blok responsive global dikonsolidasikan menjadi satu blok per breakpoint dan diurutkan besar-ke-kecil; static/browser regression menjaga selector tidak menggantung dan capability mobile tetap memiliki ukuran nonzero.
- Navigasi memakai ikon semantic, route `/kategori`, dan pemilihan mobile berbasis path alih-alih indeks array.
- Owner dapat menetapkan pemilik rekening personal dari daftar user aktif. Kegagalan refresh user tidak menyebabkan client menebak user ID: create fallback ke actor terverifikasi di backend dan edit mempertahankan ownership existing.
- Route Kategori mendukung kategori refund seperti kontrak backend. Mutation rekening/kategori memakai refresh best-effort setelah respons server sukses; kegagalan reload domain maupun refresh dashboard/bootstrap ditampilkan sebagai refresh warning dan tidak mengubah mutation yang sudah terkonfirmasi menjadi kegagalan semu.

## Financial account-card UI 2026-08-03

- Halaman Rekening memakai workspace list/detail: banyak rekening tetap ringkas di kolom daftar, sedangkan rekening terpilih ditampilkan pada panel detail sticky di desktop dan overlay penuh pada mobile setelah item dipilih.
- Seluruh visual BCA, BNI, BTN, Mandiri, dan Permata memakai kanvas WebP 768×484 serta rasio CSS 1.586:1. Asset Mandiri dinormalisasi agar tidak berbeda tinggi/lebar dari bank lain.
- Kartu tidak dibungkus panel dekoratif tambahan; gambar base, nomor rekening, contactless, dan nama rekening membentuk satu visual proporsional. Saldo dan metadata tetap berada di luar gambar kartu.
- Schema v4 menambah `accounts.account_number` melalui migration `002_account_number.sql`. Nilai dinormalisasi menjadi 6–34 digit di backend; nomor rekening bank wajib pada create dan dapat diperbarui dengan `row_version`.
- Nomor rekening hanya dikirim setelah session serta binding user backend valid, dapat dibaca kedua pengguna terotorisasi dan disalin dari panel detail, tetapi tidak pernah dipakai sebagai nomor kartu debit. PIN, CVV, masa berlaku, dan nomor kartu tetap dilarang.
- Audit account menyimpan bentuk bertopeng `••••1234`, bukan nomor lengkap. Sheets mirror dan export baca tidak menambahkan nomor rekening; backup teknis terjaga tetap mencakup seluruh tabel untuk recovery.
- Form tambah/edit menyediakan field `No rekening`; preview langsung memakai grouping empat digit. Create/update tetap menunggu konfirmasi server dan me-reload master/dashboard.
- Static regression test menjaga layout list/detail, field nomor rekening, clipboard action, font monospace, rasio 1.586:1, ukuran asset 768×484, serta batas asset 160 KB.

## Browser parity stability follow-up 2026-08-02

Verifikasi Node 24 pada Clean 95 membuktikan quality gate unit/build hijau, tetapi browser journey masih 5/7. Dua root cause terpisah ditemukan:

1. Assertion privacy desktop memakai selector test `.desktop-finance-dashboard`, sedangkan class runtime canonical adalah `.dashboard-desktop`. Fitur runtime ada; selector test salah.
2. `useApiResource` memulai status internal `idle`. Beberapa page hanya menahan `loading`, sehingga satu frame konten ber-heading dapat muncul sebelum effect mengubah status menjadi loading. Browser helper dapat menangkap frame transien tersebut lalu heading hilang.

Perbaikan canonical:

- status yang diekspos hook menjadi `loading` ketika resource enabled masih internal `idle`;
- route readiness menolak `main.loading-screen` dan memverifikasi kondisi stabil dua kali;
- selector privacy browser mengikuti class runtime yang benar.

Tidak ada perubahan pada API, authorization, saldo, schema, atau business rule.

## CI browser-smoke hardening 2026-08-02

- Workflow Quality menyediakan public dummy `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY` hanya saat build/check CI.
- Browser smoke memblokir Google Identity Services eksternal dan memakai mock lokal deterministik, sehingga tidak menunggu jaringan/provider.
- Governance test menjaga fixture public CI tetap tersedia dan tidak mengubah environment Production.

## Product-control alignment 2026-08-02

- Dokumen kebutuhan 17 area kini menjadi requirement canonical dengan status Implemented/Partial/Planned.
- `transactions.list` mendukung filter rekening, kategori, dan pencatat serta mengembalikan filter option yang sudah scope-filtered.
- `reports.monthly` menambah tren 3/6/12 bulan, total saldo lintas bulan, breakdown rekening, category nature, dan aktivitas pencatatan.
- Dashboard/laporan menampilkan alert budget, kantong, recurring, target, transaksi belum dialokasikan, serta rekonsiliasi.
- Goal read model menambah sisa target, proyeksi pace, dan kebutuhan setoran bulanan tanpa menyimpan angka turunan.
- Scheduled notification queue menambah budget/kantong threshold, goal behind, dan unallocated expense dengan dedupe key.
- Fitur yang memerlukan schema/authorization baru tidak dipaksakan; enam RFC Proposed mencakup transaction lifecycle/receipt, debt, contribution, hierarchy/stages, privacy, dan partner permission.
- Bootstrap dan sinkronisasi Vercel Development kini membersihkan `VERCEL_OIDC_TOKEN` secara otomatis sebelum memakai env dan setelah `vercel link`, termasuk jalur gagal; `env:push:development` dapat dijalankan ulang tanpa `env:clean` manual.

## Hotfix runtime backend 2026-08-02

- Refactor service sebelumnya meninggalkan import dependency pada reporting, budget, recurring, import, restore, dan integrity recovery. Import tersebut sudah dipulihkan tanpa mengubah schema atau kontrak API.
- `app.initialState` sekarang diuji melalui dispatcher authenticated dan database SQLite in-memory, sehingga error `GATEWAY_ERROR` akibat `ReferenceError` tidak dapat lolos hanya dengan syntax check.
- Backend ESLint `no-undef` dan `no-unused-vars` menjadi bagian `npm run lint`.
- Import/restore/integrity regression test menjalankan jalur apply dan maintenance recovery dengan Google bridge stub lokal.

## Browser route-readiness hotfix 2026-08-02

- Quality gate lokal Node 24, lint backend/frontend, 153 test unit/backend, production build, dan build budget telah lulus.
- Authenticated browser journey awal lulus 5/7; dua kegagalan identik pada `/rekening` berasal dari race test ketika `Page.navigate` sudah mengganti `location.pathname` tetapi DOM lama/loading masih aktif.
- Helper browser sekarang menunggu `document.readyState === "complete"` dan heading route expected sebelum assertion parity dijalankan.
- Tidak ada perubahan runtime UI, route, API, schema, authorization, atau data finansial pada hotfix ini.
- `npm run test:browser` wajib diulang pada Node 24 untuk mengonfirmasi 7/7 hijau.

## Desktop/mobile capability parity 2026-08-02

- Dashboard desktop dan mobile memakai satu view model, state filter, selection, lookup, serta privacy state yang sama.
- Dashboard desktop memakai kartu rekening aktual sebagai pemilih utama. Perubahan kartu hanya memfilter transaksi rekening dan running balance dihitung dari seluruh transaksi terbaru rekening sebelum filter tampilan diterapkan; statistik kategori tetap berlabel semua rekening karena API belum menyediakan breakdown kategori per rekening.
- Mobile menampilkan batas aman harian, dana belum dialokasikan, ringkasan rekening/kategori, seluruh alert melalui progressive disclosure, filter lengkap, dan detail transaksi bottom sheet.
- Desktop memperoleh privacy nominal yang sama; filter jenis transaksi tidak lagi disembunyikan pada layout compact.
- Tombol logout desktop tetap tersedia pada lebar 821–940px sampai navigasi mobile mengambil alih pada 820px.
- Menu `Lainnya` ditandai aktif pada route sekunder dan membawa `aria-current=page`.
- Browser fixture authenticated owner/member dan breakpoint regression ditambahkan tanpa mengubah API, role, schema, atau business logic.
- Full browser execution tetap bergantung pada build Node 24 dan Chromium; static/unit regression sudah menjadi quality guard source.

## Status implementasi dan aktivasi

- Auth, authorization, transaksi, saldo, transfer, idempotency, conflict, audit, planning, report, integration outbox, export XLSX, backup/restore guard, PWA, dan push tersedia pada source.
- Production migration tetap **pending real-data parity**.
- Backup/restore real-resource drill tetap wajib sebelum dinyatakan siap recovery production.
- Google bridge dan Web Push hanya aktif bila grup environment terkait lengkap dan telah diuji pada resource nyata.
- Branch protection, repository ruleset, GitHub Security features, serta Vercel dashboard settings harus diverifikasi di dashboard; source tidak dapat membuktikannya.
- Alerting eksternal dan retensi observability belum lengkap.

## Keputusan dan risiko aktif

1. Runtime lokal dan Vercel Production memakai satu database Turso sesuai keputusan pemilik. Jangan menjalankan data dummy atau operasi destruktif.
2. Vercel Development menjadi source bootstrap `.env.local` untuk komputer tepercaya; Production tetap runtime deployment dan Preview tetap kosong.
3. Environment canonical terdiri dari delapan key core wajib, satu logging opsional, Web Push wajib untuk Development local testing, serta Google bridge opsional yang harus lengkap bila diaktifkan.
4. Rate limit runtime masih best-effort per instance.
5. Backup teknis terkompresi dan ber-checksum; enkripsi aplikasi belum menjadi baseline yang terbukti.
6. Mantine tetap staged dependency dan hanya boleh dipakai melalui wrapper shared.
7. ZIP manual penuh pernah memuat `.env.local`; `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` harus dirotasi sebelum deployment berikutnya.

## Validasi terakhir pada patch desktop/mobile parity

```text
Source validation: 296 file PASS
Frontend unit/static tests: 49/49 PASS
Backend/database/security/tooling/governance tests: 104/104 PASS
Total automated tests: 153/153 PASS
Node syntax: 91 file PASS
Apps Script syntax/boot: 6 file, 2 urutan load PASS
npm ci/lint/build pada sandbox: belum dapat dijalankan karena registry internal tidak menyediakan vite-7.3.6.tgz dan runtime sandbox Node 22.16.0; Node 24 check pada komputer project wajib
browser smoke: belum dijalankan pada sandbox karena build/dependency tidak tersedia
```

## Prioritas berikutnya

1. Jalankan `npm ci`, `npm run check`, dan `npm run test:browser` pada Node 24 setelah menerapkan patch.
2. Uji seluruh route, dashboard filters/detail/privacy, logout breakpoint 820/821/940/941, serta owner/member pada perangkat nyata.
3. Uji filter transaksi, tren laporan, dashboard alert, target projection, dan push queue pada dua akun nyata.
4. Rotasi secret yang pernah ikut ZIP manual dan sinkronkan Development/Production secara guarded.
5. Putuskan RFC-0016 sebelum mengubah hak planning member; RFC schema lain tetap Proposed.
6. Terapkan branch protection/ruleset dan required `Quality` check.
7. Jalankan migration parity serta backup/restore real-resource drill.
8. Lengkapi axe/visual regression dan observability eksternal melalui dependency/RFC yang disetujui.

## Cara melanjutkan

Baca `../AGENTS.md`, dokumen ini, `PROJECT_HANDOFF.md`, dan source/test aktual. Jangan memakai ringkasan chat sebagai source of truth ketika repository tersedia.

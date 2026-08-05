## Current task — Koreksi gesture kartu rekening mobile

**Tanggal:** 2026-08-05
**Source:** `saldo-bersama-clean(7).zip`
**Scope:** mengembalikan gesture kartu rekening seperti perilaku awal yang natural, tanpa mengembalikan blokir scroll pada seluruh panel dan tanpa menyentuh area guarded.

### Keputusan implementasi

1. Swipe kartu aktif kembali vertikal dan memakai `deltaY`, `velocityY`, serta threshold stack yang sama dengan geometri animasi.
2. Pointer handler dipindahkan dari container setinggi stack ke kartu aktif. Area di luar kartu tetap dapat menggulir halaman dan pinch zoom tetap tersedia.
3. Directional lock menolak gesture horizontal. Swipe pendek snap kembali. Satu swipe hanya menyelesaikan satu perpindahan rekening.
4. Wheel switching dihapus agar trackpad tidak mengganti rekening tanpa sengaja. Keyboard memakai Arrow Up dan Arrow Down.
5. Browser contract mencakup swipe vertikal, penolakan gesture horizontal, swipe pendek, touch-action, serta perubahan nama rekening aktif.

### Guarded areas

Tidak ada perubahan schema/migration, Firebase Auth, allowlist, role/action matrix, API contract, Turso query, perhitungan saldo, transfer, soft delete, audit backend, import/export, backup/restore, environment, dependency, GitHub Actions, atau deployment.

### Test aktual di sandbox

- `node --test frontend/test/*.test.js`: PASS, 73/73.
- Backend test yang tidak memerlukan package `web-push`: PASS, 104/104. Enam file test penuh terblokir karena `web-push` tidak tersedia pada registry sandbox.
- `node scripts/validate-source-tree.mjs`: PASS, 322 file; 5/12 Vercel Functions canonical.
- `node scripts/check-node-syntax.mjs`: PASS, 95 file.
- Parser TypeScript untuk `AccountsPage.jsx`: PASS. Parser PostCSS untuk `AccountsPage.module.css`: PASS.
- `node scripts/check-apps-script-syntax.mjs`: PASS, 6 file dan 2 urutan load.
- `node --check test/browser/authenticated-app.test.mjs`: PASS.
- `npm ci --ignore-scripts`: GAGAL karena registry sandbox tidak memiliki `vite@7.3.6`; Node sandbox 22.16.0 juga lebih rendah dari Node 24.x project. Lint ESLint, build Vite, build budget, dan browser runtime masih wajib dijalankan pada environment resmi.

### Wajib sebelum merge/deploy

Jalankan Node 24 dengan registry lengkap: `npm ci`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:budget`, dan `npm run test:browser`. Lakukan smoke manual Safari iPhone dan Android Chrome untuk swipe atas/bawah, gesture horizontal, swipe pendek, scroll dari area kosong stack, pinch zoom, serta tap kartu aktif.

---

## Previous task — Web Push production-safe dan delivery per perangkat

**Tanggal:** 2026-08-05
**Source:** `saldo-bersama-clean(5).zip`
**Scope:** memperbaiki aktivasi notifikasi mobile, sinkronisasi subscription browser/backend, privacy lock screen, SSRF, retry multi-perangkat, environment Production, scheduler isolation, dan schema v6.

### Keputusan implementasi

1. `import.meta.env.DEV` tidak lagi memblokir notifikasi. Secure context, localhost, permission, iOS standalone, VAPID public key, service worker, subscription lokal, dan status backend diperiksa terpisah.
2. Action `notifications.status` dan `notifications.test` ditambahkan untuk verifikasi perangkat. Test hanya menuju endpoint aktif milik actor, rate-limited, idempotent, bertimeout, dan memakai payload generik.
3. `database/migrations/004_notification_deliveries.sql` menaikkan schema ke v6. Satu delivery disimpan untuk setiap notification dan subscription, sehingga retry tidak mengirim ulang ke perangkat sukses.
4. Endpoint HTTPS divalidasi sebelum storage dan saat koneksi. Guarded DNS lookup menolak alamat nonpublik. Perubahan DNS menuju jaringan privat menonaktifkan subscription dan mengakhiri retry tertunda. Transfer endpoint aktif maupun nonaktif antar akun hanya boleh ketika key subscription browser cocok persis. Record lama dipensiunkan tanpa mengubah ownership historis delivery.
5. Push stage di `/api/jobs` mempunyai timeout, stale lock recovery, attempt limit, dead letter, error code tersanitasi, dan tidak dapat menghentikan backup harian. Integrity check menolak ownership delivery dan status queue/subscription yang tidak konsisten.
6. Service worker menampilkan copy privat, membatasi target click ke same-origin, tidak meng-cache local development, dan hanya menghapus cache milik Saldo Bersama.
7. Sinkronisasi environment Production/Development membawa grup Google bridge dan Web Push hanya bila lengkap. VAPID private key ditandai sensitive dan tidak dicetak. Public/private key wajib berasal dari pasangan P-256 yang sama.
8. Restore schema v6 tetap menerima backup v3/v4/v5/v6. Push subscription dan delivery operasional tidak dipulihkan; perangkat wajib mendaftar ulang.

### Guard deployment

Cutover schema v6 harus terkoordinasi karena runtime v5 menolak schema v6 dan runtime v6 menolak schema v5. Buat backup terverifikasi, aktifkan maintenance window singkat, jalankan migration v6 dan integrity check, deploy runtime v6 segera, lalu lakukan smoke owner/member. Jangan menghapus tabel v6 sebagai rollback. Restore backup pra-migration pada database terpisah, verifikasi, lalu repoint environment setelah approval.

### Test aktual di sandbox

- `node --test frontend/test/*.test.js`: PASS, 73/73.
- `node scripts/run-backend-tests.mjs`: PASS, 129/129.
- `npm run validate:source`: PASS, 322 file; 5/12 Vercel Functions canonical.
- `node scripts/check-node-syntax.mjs`: PASS, 95 file.
- `node scripts/check-apps-script-syntax.mjs`: PASS, 6 file dan 2 urutan load.
- `npm ci` gagal karena Node sandbox 22.16.0 lebih rendah dari Node 24.x project dan registry sandbox tidak menyediakan `vite@7.3.6`. Full lint, build, build budget, browser smoke, real VAPID delivery, Vercel Production, serta Apps Script trigger masih wajib diverifikasi di environment resmi.

---

## Previous task — Rekening mobile, route rekonsiliasi, dan data-quality form

**Tanggal:** 2026-08-05
**Source:** `saldo-bersama-clean(4).zip`
**Scope:** memperbaiki scroll/auto-zoom mobile, menghapus aksi duplikat atau berlabel menyesatkan, memusatkan Rekonsiliasi, menyeragamkan identitas rekening, serta mencegah metode pembayaran tersembunyi tanpa mengubah area guarded.

### Keputusan implementasi

1. Implementasi horizontal pada task ini kemudian disupersede oleh patch korektif `saldo-bersama-clean(7).zip`: kartu aktif kembali memakai swipe vertikal, sedangkan area di luar kartu tetap dapat menggulir halaman.
2. Halaman Rekening hanya mempertahankan aksi `Transaksi` dan `Pembayaran keluar`. `Daftar rekening` membuka modal daftar nyata, sementara navigasi Transaksi membawa rekening terpilih melalui router state.
3. Rekonsiliasi dipindahkan ke `/rekonsiliasi`. Page memakai action API existing, `createIdempotencyKey`, capability `can_reconcile` dari backend, reload terjaga, dan tidak membuat transaksi penyesuaian otomatis.
4. Formatter label rekening canonical menampilkan provider, nama, dan pemilik personal bila relevan pada seluruh selector utama.
5. `TransactionForm` memulai `payment_method` sebagai string kosong. Backend/API contract tidak diubah.
6. Menu lainnya tidak lagi memuat `Tambah transaksi`; floating CTA disembunyikan pada Dashboard dan Transaksi. Label shortcut dashboard diubah menjadi label navigasi yang jujur.
7. Kontrol form mobile minimal 16px, body tidak memiliki minimum width 320px, dan aturan geometri modal global yang berkonflik dihapus.

### Guarded areas

Tidak ada perubahan schema/migration, Firebase Auth, allowlist, role/action matrix, API contract, Turso query, perhitungan saldo, transfer, soft delete, audit backend, import/export, backup/restore, environment, dependency, GitHub Actions, atau deployment.

### Test aktual di sandbox

- `node --test frontend/test/*.test.js`: PASS, 73/73.
- `node scripts/run-backend-tests.mjs`: PASS, 118/118.
- `npm run validate:source`: PASS, 320 file; 5/12 Vercel Functions canonical.
- `node scripts/check-node-syntax.mjs`: PASS, 94 file.
- `node scripts/check-apps-script-syntax.mjs`: PASS, 6 file dan 2 urutan load.
- `node --check test/browser/authenticated-app.test.mjs`: PASS.
- `npm ci --ignore-scripts`: GAGAL karena registry sandbox tidak memiliki `vite@7.3.6`; sandbox memakai Node 22.16.0 sedangkan project membutuhkan Node 24.x. `npm run lint` terblokir karena `eslint` tidak tersedia, `npm run build` terblokir karena `vite` tidak tersedia, `npm run build:budget` terblokir karena `frontend/dist/assets` belum terbentuk, dan `npm run test:browser` menghasilkan 3/7 lulus serta 4/7 terblokir karena `frontend/dist/index.html` tidak tersedia.

### Wajib sebelum merge/deploy

Jalankan pada Node 24 dengan registry npm yang lengkap: `npm ci`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:budget`, dan `npm run test:browser`. Lakukan smoke manual Safari iPhone, Android Chrome, tablet, serta desktop untuk scroll dari area kartu, keyboard virtual, fokus form, route Rekonsiliasi owner/member, filter rekening, dan tidak adanya overflow horizontal.

---

## Previous task — Focus modal, template kartu canonical, dan navigasi shell

**Tanggal:** 2026-08-04  
**Source:** `saldo-bersama-clean(131).zip`  
**Scope:** memperbaiki focus trap controlled form, memisahkan template visual bank dari nama rekening melalui schema v5, mempertahankan sidebar mask melengkung sambil memperbesar target sentuh, menyederhanakan submenu, dan menghapus duplikasi theme toggle pada menu mobile.

### Keputusan implementasi

1. `database/migrations/003_account_bank_template.sql` menambah `accounts.bank_template` dengan enum backend/database dan menaikkan schema ke v5. Migration tidak mengubah nama, saldo, transaksi, ownership, atau audit lama.
2. Create/update/list account membawa template canonical. Nama rekening tidak lagi ditambah suffix bank; deteksi suffix hanya fallback visual object legacy.
3. Restore runtime v5 menerima backup v3/v4 dan menormalisasi `account_number`/`bank_template` yang belum ada sebelum apply serta integrity check.
4. `useFocusTrap` menyimpan callback Escape pada ref, sehingga perubahan state form tidak merestart trap dan tidak memindahkan fokus setiap ketikan.
5. Sidebar desktop tetap memakai asset/mask melengkung existing. Rail serta target sentuh diperbesar; submenu menjadi daftar satu tingkat tanpa card-in-card dan memiliki close button aksesibel.
6. Theme toggle dihapus hanya dari dialog “Menu lainnya”; kontrol tema canonical di shell tetap tersedia. Logout berada pada footer terpisah.

### Guard deployment

Production wajib membuat backup terverifikasi lalu menjalankan `npm run db:migrate` sebelum deploy runtime v5. Runtime fail-closed bila schema masih v4. Rollback tidak dilakukan dengan menghapus kolom; gunakan backup pra-migration pada database terpisah, integrity check, lalu repoint environment setelah approval.

---

# Project Handoff

## Current task — Merge patch responsive/transparency dan color tokens

**Updated:** 2026-08-03
**Source:** `saldo-bersama-clean(115).zip` + `saldo-bersama-patch-full-responsive-transparency-111(2).zip` + `saldo-bersama-patch-color-tokens(2).zip`
**Scope:** menggabungkan seluruh perubahan responsive/transparency ke source 115 sambil mempertahankan seluruh token warna light/dark, asset tema, dan kontrak aksesibilitas. Tidak ada migration atau perubahan schema baru.

### Implementasi

0. Patch color-token pada source 115 dipertahankan utuh. Empat file CSS dan satu dokumen yang overlap digabung per hunk agar perbaikan responsive tidak mengembalikan warna lama.
1. `/rekening` hanya memuat rekening; `/kategori` memiliki page, CSS Module, dan API facade sendiri. Modal Rekening/Kategori gabungan dihapus.
2. Detail rekening diperbesar dan seluruh kartu memakai container/rasio identik. Ikon menu serta detail diselaraskan dengan fungsi.
3. Read model rekening/ledger transparan untuk dua pengguna terotorisasi. Rekening personal menampilkan pemilik dan capability backend.
4. Policy operasi tetap menjaga rekening personal pasangan: tidak dapat dipakai transaksi atau rekonsiliasi oleh member. Update/cancel transaksi member juga membutuhkan creator yang sama dan scope operable. Total saldo tetap transparan, tetapi saldo aman/dana belum dialokasikan hanya memakai rekening operable actor.
5. Bug `.two-column-grid,` serta cascade settings ≤580px diperbaiki. Responsive CSS dikonsolidasikan per breakpoint.
6. Browser fixture/test mencakup route kategori, rekening pasangan read-only, Tagihan/Laporan/Pengaturan mobile, dan capability anchor nonzero.
7. Form rekening personal owner dapat memilih pemilik aktif. Jika `users.list` gagal, create tetap fail-safe ke pengguna aktif dan edit mempertahankan pemilik sebelumnya tanpa mengirim tebakan dari client.
8. Kategori refund kini dapat dibuat dari route Kategori sesuai kontrak backend. Reload domain dan refresh tambahan dashboard/bootstrap setelah mutation rekening/kategori berjalan best-effort; kegagalan refresh tidak lagi membuat mutation yang sudah dikonfirmasi server terlihat gagal.
9. Detail rekening mobile memakai focus trap, Escape, scroll lock, focus restoration, dan dialog semantics. Nomor panjang dipadatkan pada visual kartu, sementara panel detail dan clipboard tetap memakai nomor lengkap.
10. Label kepemilikan diteruskan ke filter, breakdown laporan, riwayat rekonsiliasi, dan alert rekening agar seluruh read-path konsisten.

### Guarded areas

Tidak ada perubahan schema/migration, Firebase Auth, allowlist, role action matrix, perhitungan saldo, transfer, idempotency, audit format, backup/restore, environment, dependency, atau deployment. Perubahan authorization hanya pada **read-path rekening dan ledger** yang disetujui; write-path tetap lebih ketat.

### Test wajib sebelum merge

- Frontend static/unit, backend business/security, source validation, Node/Apps Script syntax.
- Lint, production build, build budget, dan authenticated browser test pada Node 24.
- Smoke owner/member nyata pada 390, 580/581, 820/821, 940/941, dan 1440; verifikasi dark/light, keyboard, overflow, read-only pasangan, serta admin owner mobile.

### Test aktual di sandbox

- `node --test frontend/test/*.test.js`: PASS — 62/62.
- `node scripts/run-backend-tests.mjs`: PASS — 108/108.
- `npm run validate:source`: PASS — 312 file; 5/12 Vercel Functions canonical.
- `node scripts/check-node-syntax.mjs`: PASS — 92 file.
- `node scripts/check-apps-script-syntax.mjs`: PASS — 6 file dan 2 urutan load.
- Lint/build belum berjalan di sandbox: `npm ci` gagal karena registry internal tidak memiliki tarball `vite@7.3.6`, registry npm resmi timeout, dan runtime sandbox Node 22.16.0 lebih rendah dari baseline Node 24. Build budget serta authenticated browser journey tetap harus dijalankan setelah dependency tersedia.

---

## Previous task — Rekening list/detail proporsional dan nomor rekening

**Updated:** 2026-08-03
**Source:** `saldo-bersama-clean(109).zip`
**Scope:** layout daftar/detail rekening, konsistensi lima asset kartu, field nomor rekening, schema v4, audit/backup compatibility, dan responsive behavior.

### Implementasi

1. Halaman rekening memakai daftar ringkas dan satu panel detail terpilih. Desktop mempertahankan panel sticky; mobile baru membuka detail setelah rekening diklik.
2. Seluruh kartu memakai rasio 1.586:1. Asset Mandiri dinormalisasi menjadi 768×484 agar ukurannya sama dengan BCA, BNI, BTN, dan Permata.
3. Migration `002_account_number.sql` menambah `accounts.account_number` dan menaikkan schema ke v4. Data legacy memperoleh default kosong.
4. Create rekening bank mewajibkan 6–34 digit. Backend menormalisasi spasi/tanda hubung; edit tetap memakai `row_version` dan conflict guard.
5. Nomor rekening mengisi baris angka pada kartu dan dapat disalin dari detail. Audit hanya menyimpan `••••` + empat digit terakhir; Sheets mirror serta export baca tetap tidak menyertakannya.
6. Backup v4 memuat kolom baru dan restore tetap menerima backup v3. Restore v3 mengandalkan default kosong lalu menormalisasi `system_config.schema_version` ke v4 sebelum integrity check selesai.

### Guarded areas

Perubahan schema telah disetujui pada task ini dan dibatasi pada satu migration additive. Tidak ada perubahan Firebase Auth, role/authorization matrix, perhitungan saldo, transfer, soft cancel, idempotency semantics, environment, dependency, atau deployment. Production wajib backup dan migration eksplisit sebelum deploy runtime v4.

### Test wajib sebelum merge

- Frontend unit/static account UI dan seluruh frontend suite.
- Database migration/constraint, account service validation, masked audit, backup v3/v4 restore compatibility, dan full backend suite.
- `npm run validate:source`, syntax checks, lint/build/build budget pada Node 24.
- Browser owner/member pada 360, 390, 820/821, 940/941, dan 1440; verifikasi ukuran lima kartu sama, detail mobile dapat ditutup, clipboard, focus, overflow, dark/light.

---

## Previous task — Integrasi base asset kartu bank

**Updated:** 2026-08-03
**Source:** `saldo-bersama-clean(103).zip`
**Scope:** base visual BNI/BCA/BTN/Permata dan penghilangan elemen kartu yang terduplikasi.

### Implementasi

1. Asset `bni.webp`, `bca.webp`, `btn.webp`, dan `permata.webp` diganti dengan base visual rasio 1.586:1, logo di kanan, chip menyatu pada gambar, dan tanpa data pengguna.
2. Mandiri tidak diubah karena asset canonical sudah memiliki logo kanan dan chip yang sesuai.
3. `AccountFinancialCard` tidak lagi merender wordmark serta chip HTML di atas gambar; hanya contactless, placeholder bertopeng, dan nama rekening yang menjadi overlay.
4. Filter gelap menyeluruh dihapus. Gradient bawah yang terbatas menjaga keterbacaan placeholder/nama tanpa menutupi identitas asset.
5. Saldo, saldo awal, timestamp, status, dan action tetap berada di panel terpisah.

### Files changed

```text
frontend/src/assets/bank-cards/bca.webp
frontend/src/assets/bank-cards/bni.webp
frontend/src/assets/bank-cards/btn.webp
frontend/src/assets/bank-cards/permata.webp
frontend/src/features/accounts/components/AccountFinancialCard.jsx
frontend/src/features/accounts/components/AccountFinancialCard.module.css
frontend/test/accounts-ui.test.js
docs/UI_DESIGN_SYSTEM.md
docs/PROJECT_STATUS.md
docs/PROJECT_HANDOFF.md
docs/TEST_PLAN.md
CHANGELOG.md
```

### Guarded areas

Tidak ada perubahan schema/migration Turso, API contract, Firebase Auth, role/authorization, saldo/transfer, audit, idempotency, row version, environment, backup/restore, dependency, atau deployment. Tidak ada nomor kartu/rekening nyata, PIN, CVV, atau masa berlaku yang ditambahkan.

### Test aktual

- `node --test frontend/test/accounts-ui.test.js`: PASS — 4/4.
- `npm run test --workspace saldo-bersama-frontend`: PASS — 55/55.
- `npm run validate:source`: PASS — 306 file; 5/12 Vercel Functions canonical.
- `node scripts/check-node-syntax.mjs`: PASS — 91 file.
- `node scripts/check-apps-script-syntax.mjs`: PASS — 6 file dan 2 urutan load.
- Asset BNI/BCA/BTN/Permata: 768×484 WebP dan masing-masing di bawah 17 KB; guard repository tetap membatasi maksimal 160 KB.
- `npm ci`: GAGAL di sandbox karena registry internal tidak menyediakan `vite-7.3.6.tgz`; runtime sandbox Node 22.16.0 juga lebih rendah dari Node 24.x project. Karena dependency tidak terpasang, lint, build, build budget, dan browser journey belum dijalankan pada patch ini.

### Next safe step

Jalankan `npm ci && npm run check && npm run test:browser` pada Node 24, lalu smoke visual dark/light untuk lima bank pada viewport 360, 390, 820/821, 940/941, dan 1440.

---

## Previous task — Financial account-card UI and unified master creation

**Updated:** 2026-08-03
**Source:** `saldo-bersama-clean(98).zip`
**Scope:** halaman Rekening & kategori, asset visual bank, responsive owner action, category listing, dan refresh setelah mutation.

### Implementasi

1. Lima asset kartu transparan BCA, BNI, BTN, Mandiri, dan Permata dioptimasi ke WebP dan disimpan di `frontend/src/assets/bank-cards/`.
2. `AccountFinancialCard` menampilkan rekening seperti kartu finansial pada web/mobile, memakai overlay teks aksesibel dan fallback untuk tunai/e-wallet/bank lain.
3. Form inline desktop dihapus. Satu tombol `Tambah` owner membuka dialog/bottom sheet dengan tab Rekening dan Kategori.
4. Pemilihan template bank menambahkan suffix nama bank secara deterministik agar template tetap dapat dideteksi tanpa perubahan schema.
5. Kategori ditampilkan list-first untuk owner/member; mutation master tetap owner-only.
6. Rekonsiliasi menyegarkan `dashboard.overview` dan initial state sehingga alert tidak tertinggal.
7. Selector CSS global `account-card`/`account-grid` lama dibersihkan; feature baru memakai CSS Modules.

### Files changed

```text
frontend/src/assets/bank-cards/{bca,bni,btn,mandiri,permata}.webp
frontend/src/features/accounts/AccountsPage.jsx
frontend/src/features/accounts/AccountsPage.module.css
frontend/src/features/accounts/accountPresentation.js
frontend/src/features/accounts/components/AccountFinancialCard.jsx
frontend/src/features/accounts/components/AccountFinancialCard.module.css
frontend/src/styles/pages.css
frontend/src/styles/responsive.css
frontend/test/accounts-ui.test.js
frontend/test/ui-foundation.test.js
test/browser/authenticated-app.test.mjs
docs/UI_DESIGN_SYSTEM.md
docs/IMPLEMENTATION_MATRIX.md
docs/PROJECT_STATUS.md
docs/PROJECT_HANDOFF.md
docs/TEST_PLAN.md
CHANGELOG.md
```

### Guarded areas

Tidak ada perubahan schema/migration Turso, API action/contract, role/authorization, saldo/transfer, audit, idempotency, row version, auth, environment, backup/restore, dependency, atau deployment.

### Test aktual

- `npm run validate:source`: PASS — 306 file.
- Frontend unit/static test: PASS — 54/54.
- Backend/database/security/governance test: PASS — 104/104.
- Total automated test: PASS — 158/158.
- `npm ci`: GAGAL di sandbox karena registry internal tidak menyediakan `vite-7.3.6.tgz`; runtime sandbox Node 22.16.0, project menetapkan Node 24.x.
- Lint, build, build budget, dan browser journey final wajib diulang pada komputer project Node 24.

### Next safe step

```bash
npm ci
npm run check
npm run test:browser
npm run zip
```

Lakukan smoke visual owner/member pada mobile dan desktop. Verifikasi kartu BCA/BNI/BTN/Mandiri/Permata, fallback rekening non-bank, dialog tab, keyboard/focus, dark/light, dan tidak ada horizontal overflow.

---

## Previous task — Browser parity stability follow-up

**Source:** `saldo-bersama-clean(95).zip`
**Scope:** browser test reliability and initial resource loading state only.

### Evidence from Node 24

- `npm ci`: PASS, 0 vulnerability.
- `npm run check`: PASS.
- frontend: 49/49.
- backend/governance: 104/104.
- build and build budget: PASS.
- browser: 5/7; failures were privacy selector desktop and transient `/laporan` heading.

### Root cause and patch

1. Browser assertion referenced nonexistent `.desktop-finance-dashboard`; runtime component uses `.dashboard-desktop`.
2. `useApiResource` exposed `idle` on its first enabled render. Reports and several list pages only gate `loading`, allowing a transient content frame before the request effect starts.
3. Route readiness now rejects `main.loading-screen`, waits the canonical heading, pauses briefly, and verifies the same state again.

### Files changed

```text
frontend/src/hooks/useApiResource.js
frontend/test/api-client.test.js
test/browser/authenticated-app.test.mjs
test/browser/helpers/app-runtime.mjs
CHANGELOG.md
docs/PROJECT_STATUS.md
docs/PROJECT_HANDOFF.md
docs/TEST_PLAN.md
```

### Guarded areas

No schema, migration, balance, transfer, auth, role, API contract, environment, backup, restore, or dependency changes.

### Next verification

Run on Node 24:

```bash
npm ci
npm run check
npm run test:browser
npm run zip
```

Expected browser result: `7 pass, 0 fail`.

---

**Updated:** 2026-08-02
**Task:** Desktop/mobile capability parity — browser route-readiness hotfix
**Status:** Quality gate lokal lulus; authenticated browser journey menemukan race test `/rekening` dan hotfix sudah diterapkan. Browser journey perlu diulang pada Node 24.

## Source yang divalidasi

- Arsip: `saldo-bersama-clean(93).zip`
- Root: `saldo-bersama/`
- Stack terkait: React 19, React Router, Vite PWA, CSS Modules, Turso schema v3.
- Path utama yang diperiksa: `AppShell`, konfigurasi/navigation desktop-mobile, Dashboard orchestration/presentations, responsive/page CSS, frontend static tests, browser CDP helpers, workflow Quality, UI/test/status docs.

## Implementasi

1. Menutup gap logout viewport 821–940px; header logout tetap terlihat sampai bottom navigation aktif pada 820px.
2. Menu mobile `Lainnya` mengenali route sekunder, menampilkan state aktif, dan membawa `aria-current="page"`.
3. Dashboard memakai satu shared view model untuk account/category lookup, filtering, transaction selection, insight, envelope, dan sync metadata.
4. Mobile mendapat capability yang sebelumnya hanya tersedia di desktop: batas aman harian, dana belum dialokasikan, rincian rekening/kategori, semua alert melalui progressive disclosure, filter rekening/kategori/jenis/search, serta detail transaksi bottom sheet.
5. Desktop mendapat privacy toggle nominal; filter jenis transaksi tidak lagi disembunyikan pada compact desktop.
6. Business form tetap satu `TransactionForm`; tidak ada handler/API/write path khusus mobile.
7. Browser fixture authenticated owner/member dan breakpoint 820/821/940/941 ditambahkan untuk seluruh route tanpa memakai service eksternal.

## Temuan dari verifikasi Node 24

Perintah pengguna menghasilkan:

```text
npm ci: PASS — 0 vulnerability
npm run check: PASS
frontend test: 49/49
backend/governance test: 104/104
production build: PASS
build budget: PASS — main JS 94.844 B gzip; global CSS 15.669 B gzip
npm run test:browser: 5/7 PASS
```

Dua kegagalan owner/member sama-sama berhenti pada heading `/rekening`. Source `AccountsPage.jsx` sudah memiliki `PageHeader` canonical `Rekening & kategori`; root cause berada pada helper test yang menganggap route siap hanya berdasarkan pathname dan keberadaan heading apa pun. Saat full navigation, pathname baru dapat terlihat sementara DOM lama atau loading state masih aktif.

Hotfix:

1. `waitForAppRoute` menunggu dokumen selesai.
2. Bila heading expected diberikan, helper menunggu heading tersebut secara tepat.
3. Seluruh authenticated route assertion mengirim heading canonical masing-masing.
4. Runtime aplikasi tidak diubah.

## File utama berubah

```text
frontend/src/config/navigation.js
frontend/src/components/navigation/MobileNavigation.jsx
frontend/src/features/dashboard/DashboardPage.jsx
frontend/src/features/dashboard/components/DesktopFinanceDashboard.jsx
frontend/src/features/dashboard/components/MobileFinanceDashboard.jsx
frontend/src/features/dashboard/components/MobileDashboardFilters.jsx
frontend/src/features/dashboard/components/MobileTransactionDetail.jsx
frontend/src/styles/pages.css
frontend/src/styles/responsive.css
frontend/test/navigation-layout.test.js
frontend/test/financial-insights.test.js
frontend/test/ui-foundation.test.js
test/browser/helpers/app-runtime.mjs
test/browser/helpers/authenticated-fixture.mjs
test/browser/authenticated-app.test.mjs
docs/UI_DESIGN_SYSTEM.md
docs/IMPLEMENTATION_MATRIX.md
docs/TEST_PLAN.md
docs/PROJECT_STATUS.md
docs/PROJECT_HANDOFF.md
CHANGELOG.md
```

## Guarded area

Tidak ada perubahan pada schema/migration Turso, saldo, transfer, soft cancel, idempotency, row version, Firebase Auth, role/authorization, API action/contract, environment, backup/restore, dependency, atau deployment.

## Test yang dijalankan

Bukti aktual dari komputer project Node 24 sebelum hotfix browser:

```text
npm ci: PASS — 183 package; 0 vulnerability
npm run validate:source: PASS — 296 file
npm run lint: PASS
frontend test: PASS — 49/49
backend/database/governance test: PASS — 104/104
Total unit/backend: PASS — 153/153
npm run build: PASS — 181 module
npm run build:budget: PASS
npm run test:browser: 5/7 PASS — dua false failure heading `/rekening`
npm run zip: PASS — 296 file canonical
```

Setelah hotfix, syntax/source checks dapat dijalankan pada patch, tetapi hasil browser final harus dibuktikan ulang melalui `npm run test:browser` pada Node 24.

## Risiko dan verifikasi lanjutan

- Jalankan `npm ci && npm run check && npm run test:browser` pada Node 24 di komputer project.
- Lakukan smoke nyata owner/member pada iPhone PWA, Android/Chrome, tablet 820/821/940/941, dan desktop.
- Browser fixture membuktikan route/capability source, bukan integrasi resource Production.
- axe penuh, Firefox/Safari automation, dan visual regression masih belum menjadi dependency project.

## Next safe step

1. Verifikasi full quality gate Node 24 dan browser journey.
2. Deploy preview/Production hanya setelah hasil hijau.
3. Uji seluruh route owner/member pada perangkat nyata dan periksa keyboard, focus, safe area, modal/bottom sheet, serta logout.
4. Lanjutkan RFC fitur schema hanya setelah approval terpisah; parity patch ini tidak memberi izin perubahan guarded.

# Test Plan

## Otomatis

```bash
npm run validate:source
- Archive target, aturan rutin, dan anggaran memakai action eksplisit owner-only dengan alasan + `row_version`; generic update tidak dapat dipakai sebagai jalan pintas ke status `archived`.
npm run lint
npm run lint:backend
npm run test
npm run test:guard
npm run build
npm run build:budget
npm run check
npm run test:browser
npm run zip
```

### Backend coverage gate

`npm run check` juga menjalankan `npm run test:coverage:backend` dengan Node built-in test coverage. Minimum canonical saat ini: **80% lines, 55% branches, 78% functions**. Coverage adalah blocking quality gate; jscpd tetap report-only/non-blocking dan tidak menggantikan behavioral test.

Cakupan wajib:

- schema STRICT, FK, integer Rupiah, ownership, bentuk transaksi, cancellation metadata, dan saldo awal negatif;
- backend `no-undef` dan `no-unused-vars` untuk mencegah import dependency hilang saat service dipecah;
- transport session login/logout wajib menunggu objek `Response`, mempertahankan `credentials: include` dan payload action, serta meneruskan API error terstruktur tanpa raw parser `TypeError`;
- authenticated `app.initialState`, budget, recurring create/update/pay/reverse, import apply, restore apply, dan integrity maintenance recovery dijalankan pada SQLite in-memory;
- income/expense/transfer/refund/adjustment;
- saldo historis per urutan transaksi, termasuk saldo minus sementara pada hari yang sama dan edit yang mempertahankan `created_at`;
- row-version conflict dan idempotency replay;
- guarded mutation: double-submit/coalescing, same-intent retry dengan idempotency key yang sama, `OUTCOME_UNKNOWN`, malformed successful response, private-memory intent tanpa `localStorage`/`sessionStorage`, synchronous confirmation/browser-side lock, serta concurrent external reservation sebelum side effect;
- browser human-error journey pada network lambat: double-click create target harus menghasilkan satu request mutation;
- linked worktree release check: `.git` berbentuk file tidak gagal source validator; `npm run test:browser` membangun fixture public sendiri tanpa `.env.local`;
- personal/shared authorization dan IDOR;
- recurring, envelope, budget, goal, reconciliation, close/reopen period; archive/restore envelope rule dan reverse reallocation; restore Target/Jadwal rutin/Anggaran arsip; negative actual reconciliation hanya untuk account `allow_negative`;
- recurring occurrence skip/restore: hanya owner, reason + row_version + idempotency, tidak mengubah ledger/saldo, status cancelled persisted, pay ditolak sampai dipulihkan, archive/restore rule tidak menghapus skip;
- notification preferences: tujuh tipe default aktif, actor-only, stale version conflict, mute per user, scheduled queue filter, backup/restore schema v8;
- feedback global: `aria-live`, dedupe, mobile safe-area, reduced motion, tanpa generic hard rollback/undo;
- read snapshot consistency, maintenance recheck, outbox coalescing, stale worker lock ownership, scheduler replay guard, Calendar ScriptLock, dan duplicate managed-event self-healing;
- formula injection dan valid XLSX;
- backup checksum, preview expiry, safety backup, rollback restore, identity conflict, current allowlist precedence, push credential exclusion, serta preservation reservation `restore.apply` agar retry key yang sama mereplay hasil dan tidak menjalankan restore kedua;
- service worker tanpa API cache dan tanpa offline write queue;
- Web Push: secure context, localhost development, iOS Home Screen requirement, permission denied, VAPID invalid/partial/key-pair mismatch/localhost subject, endpoint SSRF guard pada hostname, port, IPv4-mapped IPv6, NAT64/transition range, dan hasil DNS, terminal disable untuk resolusi private, transfer akun hanya dengan key subscription cocok, status backend, immediate test rate limit, payload lock-screen privat, recurring shortage H-2 + completion notification tanpa detail finansial, 404/410 expiry, custom DNS lookup all/single callback, request timeout, stale lock, dan delivery per perangkat tanpa duplicate retry, serta integrity guard ownership/status queue;
- artifact cleanup/archive tidak menghapus protected path atau memuat secret/generated output; penggantian archive bersifat atomik, variasi clean lama dibersihkan dengan allowlist, dan ZIP patch/unrelated tidak disentuh;
- browser smoke unauthenticated redirect, mobile overflow, target sentuh 44px untuk kontrol aplikasi, host 44px serta minimum 24px untuk widget provider-managed, accessible name, landmark, dan accessibility tree;
- browser smoke mendeteksi Chrome, Edge, Brave, atau Chromium; kegagalan startup wajib menutup server test tanpa proses menggantung;
- halaman Rekening mobile wajib memakai swipe vertikal hanya pada kartu aktif, membiarkan scroll vertikal dari area kosong stack, menolak gesture horizontal, mengembalikan swipe pendek, mempertahankan pinch zoom, dan menjaga kontrol form minimal 16px;
- root, shell, main, dan content wajib memenuhi `100dvh` dengan fallback `100vh`; route Rekening harus mempertahankan background yang sama pada reserved navigation gap tanpa menghapus safe-area;
- browser journey Rekening pada 351×590 wajib memverifikasi tinggi shell, kontinuitas background content/experience, ruang aman sebelum navigasi, dan keterbacaan foreground; route 404 wajib memenuhi sisa area konten;
- loading dan fatal error di luar shell harus memenuhi viewport, sedangkan loading/fatal error/404 di dalam shell harus memenuhi area yang tersisa tanpa body scroll lock permanen;
- menu `Lainnya` tidak boleh menduplikasi `Tambah transaksi`; route `/rekonsiliasi` harus tersedia di kelompok Kontrol saldo dan form hanya muncul berdasarkan capability backend;
- default metode pembayaran transaksi harus kosong, bukan nilai `transfer` tersembunyi; selector rekening utama harus memakai formatter provider/nama/pemilik yang konsisten;
- browser smoke memblokir script Google Identity Services eksternal sebelum navigasi dan memakai mock lokal deterministik, sehingga quality gate tidak bergantung pada jaringan provider;
- login desktop wajib memilih artwork approved light/dark berdasarkan theme, mempertahankan rasio 1672×941, dan hanya memakai satu host `.google-login-button` runtime tanpa mengganti flow Google Identity Services/Firebase; login mobile ≤820px wajib memiliki tepat tiga slide total (dua onboarding + login), artwork 941×1672, hotspot `Lanjut` minimum 44px, swipe/ArrowLeft/ArrowRight, creator link aman, theme toggle DOM asli pada slide login, serta `prefers-reduced-motion` untuk transisi carousel;
- authenticated route journey wajib menunggu `document.readyState` selesai dan heading canonical route yang tepat; pathname saja tidak boleh dianggap bukti render karena DOM lama/loading dapat masih aktif saat full navigation;
- route readiness wajib menolak `main.loading-screen` dan memverifikasi heading canonical secara stabil dua kali. Heading bukan bukti bahwa lazy capability sudah siap; journey yang langsung menguji capability wajib memberi selector readiness yang visible/nonzero sebelum assertion;
- resource enabled pada initial `idle` wajib dipresentasikan sebagai loading agar page tidak berkedip dari konten kosong ke loading screen;
- workflow CI membangun frontend browser smoke dengan nilai public dummy untuk `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY`; nilai ini bukan secret dan hanya mencegah guard konfigurasi menghentikan render mock login;
- gzip bundle dan source archive tetap di bawah budget.

## Definition of Done human-error guard

Perubahan write baru belum boleh dianggap selesai bila belum membuktikan:

1. satu intent logis menghasilkan satu idempotency key sampai hasil definitif;
2. double-click/Enter berulang tidak membuat mutation kedua;
3. network putus setelah request dikirim menghasilkan `OUTCOME_UNKNOWN`, bukan pesan “gagal menyimpan” yang mendorong intent baru;
4. retry payload + `rowVersion` yang sama memakai key yang sama;
5. same-key concurrent external action tidak menjalankan side effect dua kali; `restore.apply` tetap memiliki reservation setelah snapshot mengembalikan tabel idempotency;
6. refresh read-model yang gagal setelah server success hanya menjadi refresh warning;
7. destructive action memiliki local reentrancy lock + backend idempotency;
8. human error dipulihkan melalui cancel/archive/restore/reverse, termasuk Kantong/Target/Jadwal rutin/Anggaran, bukan hard delete atau SQL manual;
9. role/ownership/row-version/audit tetap diperiksa backend;
10. test browser, unit/service, source validation, build budget, dan clean archive tetap hijau.

## Manual

Uji dua browser/perangkat dengan owner dan member:

1. Login/logout dan redirect route; uji dari sesi bersih, pastikan login/logout berhasil tanpa reload dan tidak muncul error parser seperti `i.json is not a function`.
2. Edit record yang sama untuk memastikan 409 conflict jelas.
3. Ulangi smoke manusia: double-click/Enter spam/retry pada koneksi lambat dan pastikan hasil sama dengan automated guard suite (satu intent/satu mutation).
4. Putus jaringan sebelum write; UI harus menolak tanpa menyatakan sukses.
5. Install PWA iPhone/Android dan update app shell. Aktifkan Push pada HTTPS, pastikan verifikasi otomatis muncul, lalu periksa panel sistem. Uji dua perangkat saat satu delivery gagal sementara dan pastikan perangkat sukses tidak menerima duplikat. Pada Safari iPhone pastikan aplikasi dibuka dari Home Screen, fokus input tidak memicu auto-zoom, modal tidak bergeser horizontal, dan scroll vertikal tetap bekerja.
6. Sinkronisasi Sheets dan Calendar, termasuk failure/retry.
7. Export Excel dan periksa formula-like input.
8. Backup/restore drill pada salinan terisolasi sementara; jangan gunakan database aktif.
9. Responsive, keyboard, focus, contrast, loading/empty/error/unauthorized/maintenance. Audit seluruh CSS untuk custom property yang tidak terdefinisi, native control di bawah 16px, duplicate media query dalam file yang sama, dan endpoint gradient yang gagal kontras.
10. Full axe scan, authenticated browser journey, visual regression, dan Chrome/Firefox/Safari device coverage.

Tidak boleh mengklaim production-ready hanya berdasarkan unit test; real resource integration dan migration parity wajib lulus.


## Browser smoke cleanup guard

Browser smoke wajib menutup process tree Chromium dan koneksi Chrome DevTools Protocol pada semua jalur sukses maupun gagal. Workflow memberi batas waktu dua menit pada langkah browser agar runner tidak menggantung bila executable browser atau proses turunannya bermasalah.

## Product-control alignment

Perubahan sistem pengendali uang bersama wajib mencakup skenario berikut:

- filter transaksi berdasarkan rekening, kategori, dan pencatat tetap mengikuti projection personal/shared backend;
- regression saldo wajib membandingkan aggregate SQL `visibleAccounts()` dengan `accountBalanceAsOf()` pada fixture income, expense, refund, transfer, adjustment, inactive transaction, initial-balance date, dan beberapa cutoff date; perubahan semantik `transactionImpact()` wajib menjaga parity ini;
- laporan tren 3, 6, dan 12 bulan tidak menghitung transfer sebagai pemasukan atau pengeluaran;
- `/anggaran` mengelola create/update/archive dengan idempotency dan `row_version`; `/laporan` hanya menampilkan analisis anggaran vs aktual tanpa mutation;
- member dan periode historis melihat Anggaran secara read-only, sedangkan owner hanya dapat mengelola periode aktif;
- breakdown per pencatat diberi label aktivitas pencatatan, bukan kontribusi finansial;
- breakdown rekening, kategori, dan nature hanya memakai transaksi aktif yang terlihat oleh actor;
- peringatan budget dan kantong muncul pada threshold, tidak menggandakan notifikasi, dan tidak membocorkan scope personal;
- target dengan tanggal selesai menghitung sisa, kebutuhan setoran bulanan, dan status pace secara deterministik;
- rekonsiliasi berbeda atau terlalu lama menghasilkan peringatan tanpa membuat adjustment otomatis;
- notification queue memakai dedupe key stabil, delivery dicatat per subscription, dan retry hanya mengulang perangkat yang gagal;
- setiap `REQ-*` dalam product requirements tercatat pada implementation matrix;
- setiap gap yang membutuhkan schema baru memiliki RFC `Proposed` sebelum migration atau API baru dibuat.

Fitur planned seperti receipt, utang/piutang, contribution split, category hierarchy, goal stages, privacy granular, dan Partner role tidak boleh dianggap implemented hanya karena RFC tersedia.

## Authenticated desktop/mobile capability parity

Browser test authenticated wajib memakai fixture owner dan member yang deterministik, tanpa koneksi Firebase, Turso, Google Identity, atau provider eksternal. Cakupan minimum:

- seluruh route `/`, `/transaksi`, `/anggaran`, `/alokasi`, `/tagihan`, `/target`, `/laporan`, `/rekening`, `/rekonsiliasi`, `/kategori`, `/pengaturan`, dan nested route Pengaturan dapat dirender pada mobile;
- heading utama, navigation landmark, route aktif, dan error state tetap benar;
- dashboard mobile membawa batas aman harian, dana belum dialokasikan, rincian rekening/kategori, seluruh peringatan melalui progressive disclosure, filter lengkap, privacy nominal, serta detail transaksi;
- dashboard desktop menampilkan kartu rekening aktual yang dapat dipilih, transaksi rekening terpilih, filter kategori/jenis/pencarian, privacy nominal, statistik global yang tidak salah diklaim sebagai statistik rekening, KPI arus kas, anggaran, tagihan, target, dan insight;
- menu `Lainnya` aktif dengan `aria-current="page"` pada route sekunder;
- menu `Lainnya` tidak memuat quick-add duplikat dan menampilkan link Rekonsiliasi pada kelompok Kontrol saldo;
- grup mobile harus berurutan Perencanaan, Data keuangan, Kontrol saldo, dan Aplikasi; route `/tagihan` menampilkan heading `Jadwal rutin`;
- owner dan member memakai route yang sama, sementara kontrol write tetap mengikuti authorization data/API;
- viewport tidak overflow horizontal dan business form tidak diduplikasi per perangkat.

Viewport regression minimum:

```text
360×800
390×844
412×915
768×1024
820×1180
821×1180
900×1000
940×1000
941×1000
1024×768
1440×900
```

Batas 820/821 dan 940/941 wajib dijaga karena merupakan transisi navigasi mobile serta kontrol sesi desktop. Pada setiap ukuran, setidaknya satu jalur logout harus tersedia melalui header desktop atau menu mobile.

## Rekening, rekonsiliasi, dan kategori — responsive financial card

- Owner mobile dan desktop melihat aksi `Tambah rekening` pada route Rekening dan `Tambah kategori` pada route Kategori.
- Browser journey `/rekening` wajib menunggu stack mobile visible sebelum memeriksa `Tambah rekening`, label `Pribadi · <pemilik>`, gesture, atau capability lain; ini mencegah false failure akibat nested lazy render setelah heading route stabil.
- Member dapat melihat rekening/kategori tetapi tidak memperoleh aksi create/edit/archive owner.
- Dialog rekening dan kategori terpisah serta memakai form domain yang sama pada desktop/mobile tanpa tab lintas domain.
- Stack kartu mobile memakai swipe vertikal pada kartu aktif. Container memakai `touch-action: pan-y pinch-zoom`, kartu aktif memakai `touch-action: pan-x pinch-zoom`, gesture horizontal tidak mengganti rekening, dan area kosong stack tetap menggulir halaman.
- Tombol `Daftar rekening` harus membuka daftar rekening aktif. Rekening mobile memakai quick action `Transfer` yang membuka form transfer canonical; `Riwayat` dan `Grafik` tetap menjadi tab informasi, sedangkan Jadwal rutin dan Rekonsiliasi berada pada route masing-masing.
- Kartu generic harus flat tanpa gradient; ringkasan rekening dan quick action tidak boleh membentuk card/panel tambahan.
- Scrollbar visual mobile boleh disembunyikan, tetapi `overflow-y` tidak boleh dikunci dan konten paling bawah harus tetap dapat dicapai.
- Kontrol form memakai font 16px tanpa menonaktifkan zoom viewport.
- Route `/rekonsiliasi` menampilkan form hanya untuk rekening `can_reconcile`, mengirim idempotency key, mencatat selisih tanpa adjustment otomatis, dan tetap mengandalkan authorization backend.
- Template BCA, BNI, BTN, Mandiri, dan Permata berasal dari `accounts.bank_template`; mengganti template tidak boleh mengubah nama rekening. Object legacy tanpa field boleh memakai suffix nama hanya sebagai fallback visual.
- Asset base bank memuat logo dan chip hanya satu kali; komponen tidak merender wordmark atau chip HTML yang menumpuk di atas asset.
- Nomor rekening bank 6–34 digit divalidasi backend, ditampilkan hanya pada rekening yang lolos scope authorization, dapat disalin dari detail, dan audit hanya menyimpan empat digit terakhir. Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap tidak boleh berada pada asset/DOM.
- Create bank tanpa nomor, karakter non-digit yang tidak diizinkan, account number terlalu pendek/panjang, dan constraint database harus ditolak.
- Asset BCA/BNI/BTN/Mandiri/Permata, ShopeePay/DANA/GoPay/OVO/LinkAja, Tunai, dan Tabungan harus tepat 768×484, maksimal 160 KB, dan memakai rasio CSS 1.586:1 pada list, detail, preview, desktop, serta mobile.
- Provider E-wallet canonical berasal dari `accounts.ewallet_template` (`generic`, `shopeepay`, `dana`, `gopay`, `ovo`, `linkaja`). Deteksi nama hanya boleh dipakai untuk object/backup legacy tanpa field tersebut; nilai `generic` yang tersimpan tidak boleh dioverride oleh inferensi nama. Provider tidak boleh memengaruhi authorization/business logic dan E-wallet lain wajib tetap aman pada fallback generic.
- `accounts.update` wajib menolak perubahan `account_type` walaupun dikirim langsung oleh client; jenis hanya ditentukan saat create, sehingga template/provider tidak dapat dipakai untuk menyamarkan perubahan jenis rekening setelah rekening memiliki histori.
- Setelah create/update/archive rekening atau kategori, daftar aktif dan dashboard diperbarui tanpa refresh manual.
- Setelah rekonsiliasi, riwayat dan alert/dashboard diperbarui.
- Viewport 360, 390, 820/821, 940/941, dan 1440 tidak overflow horizontal.
- Controlled input pada Modal harus dapat menerima beberapa karakter berurutan tanpa fokus berpindah ke tombol tutup; Escape, Tab/Shift+Tab, body scroll lock, dan focus restoration tetap diuji.
- Migration v5 menerima enum template bank valid, migration v6 menambah delivery Web Push per subscription, migration v7 menambah notification preference actor-scoped, dan migration v8 menambah `ewallet_template` additive. Restore runtime v8 tetap menerima backup schema v3-v7; field provider/template yang belum ada dinormalisasi secara aman dan preference default aktif dipertahankan untuk backup lama.
- Sidebar melengkung harus tetap terlihat, target sentuh minimal 44px, submenu minimal dapat ditutup, dan menu mobile tidak menduplikasi theme toggle.

## Regression rekening transparan dan capability mobile

- Member harus menerima seluruh rekening shared/personal beserta `owner_name`; rekening personal pasangan wajib `read_only=true`, `can_transact=false`, dan `can_reconcile=false`.
- Member harus dapat membaca transaksi pasangan untuk menelusuri saldo, tetapi update/cancel hanya boleh untuk transaksi sendiri pada scope operable; transaksi legacy pada rekening personal pasangan tetap harus ditolak.
- `totalBalance` harus mencakup semua rekening readable, sedangkan `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` hanya boleh memakai rekening/scope operable actor.
- Label pemilik wajib konsisten pada filter transaksi, account breakdown, reconciliation history, dan reconciliation alert.
- `reconciliations.list` bersifat readable; `reconciliations.create` tetap operable. Negative authorization test wajib memakai request langsung ke service, bukan hanya tombol tersembunyi.
- Form transaksi hanya menawarkan rekening dengan `can_transact !== false`; backend tetap mengulang guard ownership.
- Form rekening personal owner dapat memilih user aktif. Saat `users.list` gagal, create harus fallback ke actor backend dan edit harus mempertahankan `owner_user_id` existing tanpa field required kosong.
- Route `/kategori` harus menyediakan tipe refund sesuai `CATEGORY_TYPES` backend. Mutation master yang sudah sukses tidak boleh dilaporkan gagal karena reload domain atau refresh dashboard/bootstrap sesudahnya gagal; UI harus mempertahankan status sukses server dan mengekspos refresh warning.
- Browser mobile 390×844 wajib memeriksa capability anchor dengan computed style dan bounding rect: dua panel `/tagihan`, minimal tujuh panel chart `/laporan`, nested route `/pengaturan` sesuai role, detail read-only pasangan `/rekening`, dan route `/kategori`. Modal transaksi serta kategori wajib bebas overflow horizontal; detail rekening wajib lulus focus trap Tab/Shift+Tab, Escape close, body scroll lock, dan focus restoration.
- Nomor rekening panjang wajib dipadatkan pada visual kartu tanpa mengubah nilai lengkap pada detail/copy.
- Boundary responsive wajib mencakup 580/581, 820/821, dan 940/941. Static test menolak dangling selector serta `.two-column-grid { display:none }`.

## Human-error protection dan data lifecycle

Regression wajib membuktikan:

- member ditolak untuk preview/apply lifecycle owner;
- rekening aktif dengan saldo awal Rp0, saldo saat ini Rp0, tanpa transaksi/dependency/reconciliation dapat dihapus owner setelah alasan, acknowledgement, exact phrase, `row_version`, dan idempotency lulus;
- transaksi cancelled tetap dianggap histori dan memblokir hard delete rekening;
- rekening dengan saldo, transaksi, kantong, recurring, goal, atau rekonsiliasi tidak dapat hard delete;
- retry dengan idempotency key sama tidak menggandakan audit;
- audit delete-unused tetap ada dan nomor rekening penuh tidak dicatat;
- rekening/kategori arsip dapat dipulihkan bila duplicate/ownership/version guard lulus;
- transaksi cancelled hanya dapat dipulihkan owner pada periode terbuka, unlinked, dan dengan proyeksi saldo valid;
- user inactive hanya dapat aktif melalui `users.reactivate` dan allowlist terbaru;
- tutup periode membutuhkan preview dan exact confirmation, lalu memvalidasi ulang integrity/unallocated transaction;
- ConfirmationModal memerlukan alasan/typed phrase/acknowledgement/countdown sesuai tingkat risiko dan mencegah submit Enter tidak sengaja;
- destructive UI tidak menghilangkan data sebelum server sukses dan menampilkan conflict secara jelas;
- generic purge tidak ada pada action registry, permission, API, atau UI.


## Maintainability, artifact hygiene, dan duplicate-report policy

- `npm-audit-YYYYMMDD.json` adalah diagnostic lokal: boleh berada sementara di working directory, wajib di-ignore Git/source validator, dan **tidak boleh** masuk clean ZIP. Validator dan packager memakai policy local-only yang sama.
- `cache.js` dan `client.js` wajib memakai serializer canonical yang sama agar query key dan mutation fingerprint tidak drift ketika urutan property payload berubah.
- Helper versioning hanya mengekstrak stamp `row_version`/`updated_at`/`updated_by` yang benar-benar identik; ownership guard, optimistic `WHERE row_version=?`, reversal metadata, dan business transition tetap eksplisit di service domain.
- `npm run check:duplicates` memakai jscpd pinned dan **report-only/non-blocking**. Prioritas refactor adalah clone JavaScript/JSX yang berisiko drift; migration SQL dan CSS module deklaratif tidak dikejar hanya demi persentase.
- Feedback transient success/info/warning memakai `FeedbackProvider`; error mutation, conflict, maintenance/read-only, backup/restore/import, dan status integrasi yang perlu tetap terlihat memakai notice persisten. Generic hard undo/rollback tidak tersedia; reversal finansial tetap action domain audited.
- Recurring occurrence mutation wajib enqueue Calendar dengan `recurring_occurrence:<occurrence_id>` dan mirror recurring melalui `<recurring_rule_id>`; pay/reverse/skip/restore harus memakai identitas sinkronisasi yang sama.

## Modal, Kategori, dan route Pengaturan

- Ukur `scrollWidth <= clientWidth + 1` pada dialog dan `.modal__body` untuk Tambah Transaksi, Tambah/Edit Kategori, Rekening, Import, Restore, serta konfirmasi periode pada 320, 360, 390, 414, dan 430px.
- Pastikan `.modal__body` memakai `overflow-x: hidden`, `overflow-y: auto`, dan indikator scrollbar mobile tersembunyi tanpa body scroll lock permanen.
- Filter Transaksi memakai grid dua kolom lalu satu kolom; kelompok ikon Kategori memakai wrap. Tidak ada nested horizontal scroll selain pemilih rekening yang disengaja.
- `categories.create` menormalkan non-pengeluaran tanpa nature eksplisit menjadi `other`, menolak nature pengeluaran pada income/refund, serta menolak kategori expense baru dengan nature `savings`.
- Data legacy `savings` tetap dapat dibaca dan diubah menuju klasifikasi baru tanpa migration diam-diam.
- `/pengaturan` hanya memuat `system.health`; setiap nested route memuat resource sendiri dan menampilkan result/error dekat tindakan.
- Owner-only deep link tetap menampilkan guard frontend dan wajib ditolak backend bila request dipaksakan oleh member.

## Web Push desktop dan mobile

- `system.health` pada Pengaturan wajib memakai `status`, `schemaVersion`, dan `maintenanceMode`; test menolak akses `database` serta `schema.ready` pada response action tersebut.
- Schema Production harus versi 8 dan `npm run db:integrity` harus lulus sebelum register subscription.
- `npm run env:check` wajib memvalidasi pasangan `VITE_VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` serta format `VAPID_SUBJECT`.
- Bootstrap Development interaktif wajib menarik ulang Vercel Development walaupun `.env.local` lama terlihat lengkap; hasil pull mengganti file hanya setelah delapan core + Web Push lolos validasi.
- Mode non-interaktif tidak membuka login/network bootstrap dan hanya menerima `.env.local` yang sudah valid.
- `env:push:development:settings` wajib menyinkronkan Web Push dan Google bridge yang aktif tanpa menyentuh core environment.
- Setelah `npm run env:push:production`, deployment Production baru wajib dibuat. Bundle lama tidak boleh dianggap menggunakan key baru.
- Desktop Chrome/Edge dan Android Chrome: Aktifkan, izin granted, register server, verifikasi otomatis, click membuka `/pengaturan/notifikasi`, Nonaktifkan, dan register ulang.
- iPhone/iPad: tab Safari harus menampilkan instruksi Home Screen; aplikasi standalone iOS/iPadOS yang mendukung harus dapat meminta izin melalui ketukan tile dan menerima verifikasi otomatis.
- Dua perangkat pada akun yang sama harus memiliki subscription terpisah. Retry perangkat gagal tidak boleh mengirim ulang ke perangkat yang sudah sukses.
- Subscription 404/410 harus dinonaktifkan. Endpoint lokal/private harus ditolak. Payload lock screen tidak boleh membawa nominal, saldo, nama rekening, kategori, atau detail transaksi.
- Apps Script hanya memiliki satu trigger `runScheduledJobs`, secret scheduler sama dengan Vercel, dan `/api/jobs` berhasil memproses queue tanpa menggagalkan backup ketika Push gagal.

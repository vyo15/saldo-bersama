# Test Plan

## Otomatis

```bash
npm run validate:source
npm run lint
npm run lint:backend
npm run test
npm run build
npm run build:budget
npm run check
npm run test:browser
npm run zip
```

Cakupan wajib:

- schema STRICT, FK, integer Rupiah, ownership, bentuk transaksi, cancellation metadata, dan saldo awal negatif;
- backend `no-undef` dan `no-unused-vars` untuk mencegah import dependency hilang saat service dipecah;
- transport session login/logout wajib menunggu objek `Response`, mempertahankan `credentials: include` dan payload action, serta meneruskan API error terstruktur tanpa raw parser `TypeError`;
- authenticated `app.initialState`, budget, recurring create/update/pay/reverse, import apply, restore apply, dan integrity maintenance recovery dijalankan pada SQLite in-memory;
- income/expense/transfer/refund/adjustment;
- saldo historis per urutan transaksi, termasuk saldo minus sementara pada hari yang sama dan edit yang mempertahankan `created_at`;
- row-version conflict dan idempotency replay;
- personal/shared authorization dan IDOR;
- recurring, envelope, budget, goal, reconciliation, close/reopen period;
- read snapshot consistency, maintenance recheck, outbox coalescing, stale worker lock ownership, scheduler replay guard, dan duplicate Calendar prevention;
- formula injection dan valid XLSX;
- backup checksum, preview expiry, safety backup, rollback restore, identity conflict, current allowlist precedence, dan push credential exclusion;
- service worker tanpa API cache dan tanpa offline write queue;
- artifact cleanup/archive tidak menghapus protected path atau memuat secret/generated output;
- browser smoke unauthenticated redirect, mobile overflow, target sentuh 44px untuk kontrol aplikasi, host 44px serta minimum 24px untuk widget provider-managed, accessible name, landmark, dan accessibility tree;
- browser smoke mendeteksi Chrome, Edge, Brave, atau Chromium; kegagalan startup wajib menutup server test tanpa proses menggantung;
- halaman Rekening mobile wajib membiarkan scroll vertikal dari area stack (`touch-action: pan-y`), memakai swipe horizontal untuk ganti rekening, dan menjaga kontrol form minimal 16px tanpa mematikan browser zoom;
- menu `Lainnya` tidak boleh menduplikasi `Tambah transaksi`; route `/rekonsiliasi` harus tersedia di kelompok Kelola keuangan dan form hanya muncul berdasarkan capability backend;
- default metode pembayaran transaksi harus kosong, bukan nilai `transfer` tersembunyi; selector rekening utama harus memakai formatter provider/nama/pemilik yang konsisten;
- browser smoke memblokir script Google Identity Services eksternal sebelum navigasi dan memakai mock lokal deterministik, sehingga quality gate tidak bergantung pada jaringan provider;
- login mobile wajib memakai logo resmi, tepat satu host `.google-login-button`, background rupiah dekoratif `aria-hidden`, target sentuh minimum, dark/light theme, serta `prefers-reduced-motion` tanpa mengganti flow Google Identity Services/Firebase;
- authenticated route journey wajib menunggu `document.readyState` selesai dan heading canonical route yang tepat; pathname saja tidak boleh dianggap bukti render karena DOM lama/loading dapat masih aktif saat full navigation;
- route readiness wajib menolak `main.loading-screen`, memverifikasi heading canonical secara stabil dua kali, dan selector browser harus menunjuk class runtime aktual;
- resource enabled pada initial `idle` wajib dipresentasikan sebagai loading agar page tidak berkedip dari konten kosong ke loading screen;
- workflow CI membangun frontend browser smoke dengan nilai public dummy untuk `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY`; nilai ini bukan secret dan hanya mencegah guard konfigurasi menghentikan render mock login;
- gzip bundle dan source archive tetap di bawah budget.

## Manual

Uji dua browser/perangkat dengan owner dan member:

1. Login/logout dan redirect route; uji dari sesi bersih, pastikan login/logout berhasil tanpa reload dan tidak muncul error parser seperti `i.json is not a function`.
2. Edit record yang sama untuk memastikan 409 conflict jelas.
3. Double-click/retry menggunakan idempotency yang sama.
4. Putus jaringan sebelum write; UI harus menolak tanpa menyatakan sukses.
5. Install PWA iPhone/Android, update app shell, push notification; pada Safari iPhone pastikan fokus input tidak memicu auto-zoom dan scroll dapat dimulai dari area kartu rekening.
6. Sinkronisasi Sheets dan Calendar, termasuk failure/retry.
7. Export Excel dan periksa formula-like input.
8. Backup/restore drill pada salinan terisolasi sementara; jangan gunakan database aktif.
9. Responsive, keyboard, focus, contrast, loading/empty/error/unauthorized/maintenance.
10. Full axe scan, authenticated browser journey, visual regression, dan Chrome/Firefox/Safari device coverage.

Tidak boleh mengklaim production-ready hanya berdasarkan unit test; real resource integration dan migration parity wajib lulus.


## Browser smoke cleanup guard

Browser smoke wajib menutup process tree Chromium dan koneksi Chrome DevTools Protocol pada semua jalur sukses maupun gagal. Workflow memberi batas waktu dua menit pada langkah browser agar runner tidak menggantung bila executable browser atau proses turunannya bermasalah.

## Product-control alignment

Perubahan sistem pengendali uang bersama wajib mencakup skenario berikut:

- filter transaksi berdasarkan rekening, kategori, dan pencatat tetap mengikuti projection personal/shared backend;
- laporan tren 3, 6, dan 12 bulan tidak menghitung transfer sebagai pemasukan atau pengeluaran;
- breakdown per pencatat diberi label aktivitas pencatatan, bukan kontribusi finansial;
- breakdown rekening, kategori, dan nature hanya memakai transaksi aktif yang terlihat oleh actor;
- peringatan budget dan kantong muncul pada threshold, tidak menggandakan notifikasi, dan tidak membocorkan scope personal;
- target dengan tanggal selesai menghitung sisa, kebutuhan setoran bulanan, dan status pace secara deterministik;
- rekonsiliasi berbeda atau terlalu lama menghasilkan peringatan tanpa membuat adjustment otomatis;
- notification queue memakai dedupe key stabil dan retry tidak menghasilkan push ganda;
- setiap `REQ-*` dalam product requirements tercatat pada implementation matrix;
- setiap gap yang membutuhkan schema baru memiliki RFC `Proposed` sebelum migration atau API baru dibuat.

Fitur planned seperti receipt, utang/piutang, contribution split, category hierarchy, goal stages, privacy granular, dan Partner role tidak boleh dianggap implemented hanya karena RFC tersedia.

## Authenticated desktop/mobile capability parity

Browser test authenticated wajib memakai fixture owner dan member yang deterministik, tanpa koneksi Firebase, Turso, Google Identity, atau provider eksternal. Cakupan minimum:

- seluruh route `/`, `/transaksi`, `/alokasi`, `/tagihan`, `/target`, `/laporan`, `/rekening`, `/rekonsiliasi`, `/kategori`, dan `/pengaturan` dapat dirender pada mobile;
- heading utama, navigation landmark, route aktif, dan error state tetap benar;
- dashboard mobile membawa batas aman harian, dana belum dialokasikan, rincian rekening/kategori, seluruh peringatan melalui progressive disclosure, filter lengkap, privacy nominal, serta detail transaksi;
- dashboard desktop menampilkan kartu rekening aktual yang dapat dipilih, transaksi rekening terpilih, filter kategori/jenis/pencarian, privacy nominal, statistik global yang tidak salah diklaim sebagai statistik rekening, KPI arus kas, anggaran, tagihan, target, dan insight;
- menu `Lainnya` aktif dengan `aria-current="page"` pada route sekunder;
- menu `Lainnya` tidak memuat quick-add duplikat dan menampilkan link Rekonsiliasi pada kelompok Kelola keuangan;
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
- Member dapat melihat rekening/kategori tetapi tidak memperoleh aksi create/edit/archive owner.
- Dialog rekening dan kategori terpisah serta memakai form domain yang sama pada desktop/mobile tanpa tab lintas domain.
- Stack kartu mobile memakai swipe horizontal dan `touch-action: pan-y`; gesture vertikal tidak boleh dibajak dari scroll halaman.
- Tombol `Daftar rekening` harus membuka daftar rekening aktif. Quick action rekening hanya memuat navigasi Transaksi dan Pembayaran keluar; Tagihan dan Rekonsiliasi berada pada route masing-masing.
- Route `/rekonsiliasi` menampilkan form hanya untuk rekening `can_reconcile`, mengirim idempotency key, mencatat selisih tanpa adjustment otomatis, dan tetap mengandalkan authorization backend.
- Template BCA, BNI, BTN, Mandiri, dan Permata berasal dari `accounts.bank_template`; mengganti template tidak boleh mengubah nama rekening. Object legacy tanpa field boleh memakai suffix nama hanya sebagai fallback visual.
- Asset base bank memuat logo dan chip hanya satu kali; komponen tidak merender wordmark atau chip HTML yang menumpuk di atas asset.
- Nomor rekening bank 6–34 digit divalidasi backend, ditampilkan hanya pada rekening yang lolos scope authorization, dapat disalin dari detail, dan audit hanya menyimpan empat digit terakhir. Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap tidak boleh berada pada asset/DOM.
- Create bank tanpa nomor, karakter non-digit yang tidak diizinkan, account number terlalu pendek/panjang, dan constraint database harus ditolak.
- Lima asset BCA/BNI/BTN/Mandiri/Permata harus tepat 768×484, maksimal 160 KB, dan memakai rasio CSS 1.586:1 pada list, detail, preview, desktop, serta mobile.
- Setelah create/update/archive rekening atau kategori, daftar aktif dan dashboard diperbarui tanpa refresh manual.
- Setelah rekonsiliasi, riwayat dan alert/dashboard diperbarui.
- Viewport 360, 390, 820/821, 940/941, dan 1440 tidak overflow horizontal.
- Controlled input pada Modal harus dapat menerima beberapa karakter berurutan tanpa fokus berpindah ke tombol tutup; Escape, Tab/Shift+Tab, body scroll lock, dan focus restoration tetap diuji.
- Migration v5 menerima enum template valid, menolak template invalid/non-bank, menjaga nama legacy tetap sama, serta restore backup v3/v4 menormalisasi field ke schema v5.
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
- Browser mobile 390×844 wajib memeriksa capability anchor dengan computed style dan bounding rect: dua panel `/tagihan`, minimal tujuh panel chart `/laporan`, kolaborasi serta admin owner `/pengaturan`, detail read-only pasangan `/rekening`, dan route `/kategori`. Detail rekening wajib lulus focus trap Tab/Shift+Tab, Escape close, body scroll lock, dan focus restoration.
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

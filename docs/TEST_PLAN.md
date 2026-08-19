# Test Plan

## Kontrak test

Gunakan dua lapis bukti otomatis:

1. **Behavior/domain test** untuk rule, helper, service, mutation, saldo, authorization, data integrity, dan kontrak UI yang dapat diuji deterministik tanpa browser.
2. **Static/source contract test** hanya untuk invariant yang memang literal seperti route, dependency boundary, forbidden API, required export, security guard, dan struktur deployment. Jangan mengunci nama variabel lokal atau bentuk JSX internal untuk membuktikan behavior.

UI/responsive/focus/navigation yang membutuhkan rendering browser diverifikasi melalui **manual device QA** sesuai scope. Automated `test:browser` telah dipensiunkan dari quality gate dan tidak boleh ditambahkan kembali tanpa approval perubahan tooling.

Setiap bug/regression harus memiliki regression test yang gagal terhadap behavior lama bila praktis dan PASS setelah fix. Setelah test/source/docs final, `npm run verify` wajib dijalankan lagi dari tree yang sama. PASS dari tree sebelum edit terakhir tidak berlaku.

## Otomatis

```bash
npm run validate:source
npm run lint
npm run lint:backend
npm run test
npm run test:guard
npm run build
npm run build:budget
npm run check
npm run zip
```

`npm run zip` adalah local release guard: perintah ini memastikan pre-push Auto Quality Guard tersedia lalu menjalankan full `npm run verify` sebelum packaging. Jika salah satu lint/test/build/guard gagal, ZIP tidak dibuat. `npm ci` dan `npm run dev` juga memastikan pre-push Auto Quality Guard lokal tersedia; `git push` akan dibatalkan bila full verification gagal. Di CI, langkah archive memanggil packager langsung karena check/guard sudah dijalankan pada step sebelumnya, sehingga full verification tidak diduplikasi.



### Hardening regression tambahan

Patch hardening wajib mempertahankan regression berikut:

- semantic danger foreground pada `negative-soft` memenuhi kontras AA untuk teks normal;
- kontrol interaktif history transaksi mobile memakai effective target minimal 44×44px;
- laporan mobile tidak memakai micro-text 9/10px untuk metrik/label finansial;
- preferensi notifikasi menampilkan deskripsi dan switch mengacu ke deskripsi melalui `aria-describedby`;
- CSP production tidak mempertahankan allowance Google GSI yang sudah dipensiunkan;
- business integrity gagal bila `system_config.timezone` bukan `Asia/Jakarta` atau `currency` bukan `IDR`.

Manual QA untuk perubahan ini: 360×800, 390×844, 768×1024, 1366×768, light/dark, keyboard focus, 200% zoom, serta real device untuk Push. Browser automation tetap bukan gate canonical.

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
- guarded mutation: double-submit/coalescing, same-intent retry dengan idempotency key yang sama, `OUTCOME_UNKNOWN`, malformed successful response, private-memory intent tanpa `localStorage`/`sessionStorage` untuk mutation biasa, payload berbeda pada action yang sama diblok selama outcome lama belum definitif, dengan satu pengecualian reset berupa opaque recovery idempotency key pada `sessionStorage` tab, synchronous confirmation/browser-side lock, serta concurrent external reservation sebelum side effect;
- human-error guard memastikan double-submit/coalescing tidak menghasilkan mutation intent ganda;
- linked worktree release check: `.git` berbentuk file tidak gagal source validator dan clean archive tetap tidak bergantung pada `.env.local`;
- personal/shared authorization dan IDOR;
- recurring, envelope, budget, goal, reconciliation, close/reopen period; archive/restore envelope rule dan reverse reallocation; restore Target/Jadwal rutin/Anggaran arsip; negative actual reconciliation hanya untuk account `allow_negative`;
- account-bound allocation: Kantong baru wajib satu `source_account_id`; `balance` fisik tidak berubah saat alokasi dibuat; `allocated_remaining` dan `available_balance` harus membentuk pembagian saldo tanpa double counting; expense berkantong mengurangi saldo + sisa Kantong tetapi menjaga dana bebas untuk bagian yang ter-cover; expense tanpa Kantong/Transfer mengurangi dana bebas dan ditolak jika mengambil dana Kantong; expense Kantong beda rekening ditolak; realokasi baru lintas rekening ditolak dan reversal movement legacy tetap dapat dipakai untuk recovery;
- lifecycle allocation integrity: future-dated expense Kantong tidak membebaskan dana sebelum cutoff fisik, restore rule memeriksa dana tersedia terbaru, rule legacy tanpa sumber fail-closed, update/cancel/restore transaksi tidak boleh membuat `balance < allocated_remaining`, serta integrity mendeteksi source invalid, transaction source mismatch, active cross-account reallocation, dan `ALLOCATED_FUNDS_EXCEED_BALANCE`;
- recurring occurrence skip/restore: hanya owner, reason + row_version + idempotency, tidak mengubah ledger/saldo, status cancelled persisted, pay ditolak sampai dipulihkan, archive/restore rule tidak menghapus skip;
- notification preferences: tujuh tipe default aktif, actor-only, stale version conflict, mute per user, scheduled queue filter, backup/restore schema v11;
- Manual reminder: create/get/update/cancel pada Jadwal Rutin, Anggaran, Alokasi, dan Target; waktu Asia/Jakarta future maksimal 366 hari; satu reminder `scheduled` per actor+entity; stale `row_version` dan create concurrent ditolak; actor tidak boleh membuat reminder untuk personal/assignee milik user lain; scheduler queue sekali dengan dedupe stabil; `reminders.get` mengembalikan `lastDispatch`; dispatch `pending/processing/failed/missing` menolak reminder baru dengan `REMINDER_DELIVERY_PENDING` sedangkan `sent/dead_letter` terminal; archive/delete/complete/close/cancel membatalkan reminder `scheduled` secara atomik; integrity mendeteksi user/entity/queue reminder yang drift; reset/backup/restore schema v11 mencakup tabel reminder dan tetap menerima snapshot lama secara additive.
- feedback global: `aria-live`, dedupe, mobile safe-area, reduced motion, tanpa generic hard rollback/undo;
- read snapshot consistency, maintenance recheck, outbox coalescing, stale worker lock ownership, scheduler replay guard, Calendar ScriptLock, dan duplicate managed-event self-healing;
- formula injection dan valid XLSX;
- backup checksum, preview expiry, safety backup, rollback restore, identity conflict, current allowlist precedence, push credential exclusion, reason + acknowledgement + exact restore phrase, serta preservation reservation `restore.apply` agar retry key yang sama mereplay hasil dan tidak menjalankan restore kedua;
- import all-or-nothing: mixed valid/invalid wajib ditolak tanpa partial apply, `confirm_duplicate` dari file diabaikan, duplicate antarbaris serta saldo/kantong diuji kumulatif saat preview, apply stale wajib rollback seluruh record, dan success wajib safety backup + integrity verification + audit;
- service worker tanpa API cache, hanya menyimpan response navigation HTML sebagai app shell, tanpa offline write queue, dan memakai stale-while-revalidate untuk image URL stabil agar asset publik tidak tertahan versi lama setelah deploy; production OAuth desktop/mobile berjalan melalui `/api/auth/google/*` sehingga otomatis mengikuti network-only `/api/*`;
- Web Push: secure context, localhost development, iOS Home Screen requirement, permission denied, VAPID invalid/partial/key-pair mismatch/localhost subject, endpoint SSRF guard pada hostname, port, IPv4-mapped IPv6, NAT64/transition range, dan hasil DNS, terminal disable untuk resolusi private, transfer akun hanya dengan key subscription cocok, status backend, immediate test rate limit, queue detail server-generated tetapi transport lock-screen hanya `notificationType`/`targetPath`/`notificationId`, recurring shortage H-2 + completion notification dengan copy generic privacy-safe, 404/410 expiry, custom DNS lookup all/single callback, request timeout, stale lock, dan delivery per perangkat tanpa duplicate retry, serta integrity guard ownership/status queue;
- artifact cleanup/archive tidak menghapus protected path atau memuat secret/generated output; penggantian archive bersifat atomik, variasi clean lama dibersihkan dengan allowlist, dan ZIP patch/unrelated tidak disentuh;
- summary visual Target/Alokasi/Jadwal rutin/Anggota wajib memakai aset existing yang benar, bersifat dekoratif (`alt` kosong/`aria-hidden`), tidak mengubah data source/domain contract, dan tidak ikut diterapkan ke Dashboard/Transaksi/Laporan hanya sebagai hiasan;
- manual device QA summary-art pada 320/360/390/430px dan desktop wajib memeriksa overlap nominal/progress, light/dark mode, reduced motion, serta memastikan artwork tidak menangkap pointer atau menggeser action utama;
- halaman Rekening mobile wajib memakai swipe vertikal hanya pada kartu aktif, membiarkan scroll vertikal dari area kosong stack, menolak gesture horizontal, mengembalikan swipe pendek, mempertahankan pinch zoom, dan menjaga kontrol form minimal 16px;
- root, shell, main, dan content wajib memenuhi `100dvh` dengan fallback `100vh`; route Rekening harus mempertahankan background yang sama pada reserved navigation gap tanpa menghapus safe-area;
- manual device QA Rekening pada viewport kecil wajib memverifikasi tinggi shell, kontinuitas background content/experience, ruang aman sebelum navigasi, keterbacaan foreground, dan route 404 yang memenuhi sisa area konten;
- loading dan fatal error di luar shell harus memenuhi viewport, sedangkan loading/fatal error/404 di dalam shell harus memenuhi area yang tersisa tanpa body scroll lock permanen;
- menu `Lainnya` tidak boleh menduplikasi `Tambah transaksi`; route `/rekonsiliasi` harus tersedia di kelompok Kontrol saldo dan form hanya muncul berdasarkan capability backend;
- default metode pembayaran transaksi harus kosong, bukan nilai `transfer` tersembunyi; selector rekening utama harus memakai formatter provider/nama/pemilik yang konsisten;
- login desktop wajib memilih artwork approved light/dark berdasarkan theme dan mempertahankan rasio 1672×941; panel auth desktop mengikuti visual login mobile dengan logo Saldo Bersama, copy ringkas, security hints, serta tombol HTML branded Google yang sama. Login mobile ≤820px wajib memiliki tepat empat halaman (tiga onboarding + login khusus), tiga onboarding memakai hero card clean dengan aset transparan terpisah, tanpa pill fitur di bawah deskripsi, tidak meniban area copy, serta muat satu layar tanpa scroll vertikal internal pada viewport mobile yang didukung. Desktop dan halaman login mobile tidak merender tombol/iframe Google Identity Services. Module auth Google wajib dipreload sebelum tombol aktif; production canonical menavigasi ke server Google OAuth `/api/auth/google/start` dan localhost/device emulation memakai Firebase popup fallback tanpa mengubah kontrak session/allowlist. Manual device QA memeriksa tombol branded tunggal, target sentuh minimum 44px, desktop alignment, satu-layar pada viewport mobile relevan, swipe/keyboard, creator link, theme toggle, reduced motion, dan round-trip auth pada perangkat nyata;
- resource enabled pada initial `idle` wajib dipresentasikan sebagai loading agar page tidak berkedip dari konten kosong ke loading screen;
- gzip bundle dan source archive tetap di bawah budget.

## Definition of Done human-error guard

Perubahan write baru belum boleh dianggap selesai bila belum membuktikan:

1. satu intent logis menghasilkan satu idempotency key sampai hasil definitif;
2. double-click/Enter berulang tidak membuat mutation kedua;
3. network putus setelah request dikirim menghasilkan `OUTCOME_UNKNOWN`, bukan pesan “gagal menyimpan” yang mendorong intent baru;
4. retry payload + `rowVersion` yang sama memakai key yang sama;
5. selama outcome belum definitif, payload berbeda untuk action yang sama tidak boleh dikirim sebagai intent baru secara diam-diam; form kritis mengunci field dan menawarkan retry data yang sama;
6. same-key concurrent external action tidak menjalankan side effect dua kali; `restore.apply` tetap memiliki reservation setelah snapshot mengembalikan tabel idempotency;
7. refresh read-model yang gagal setelah server success hanya menjadi refresh warning;
8. destructive action memiliki local reentrancy lock + backend idempotency;
9. human error dipulihkan melalui cancel/archive/restore/reverse, termasuk Kantong/Target/Jadwal rutin/Anggaran, bukan hard delete atau SQL manual;
10. role/ownership/row-version/audit tetap diperiksa backend;
11. unit/service, guard regression, source validation, build budget, dan clean archive tetap hijau.

## Manual

Uji dua browser/perangkat dengan Administrator dan Member:

1. Login/logout dan redirect route; uji dari sesi bersih, pastikan login/logout berhasil tanpa reload dan tidak muncul error parser seperti `i.json is not a function`.
2. Edit record yang sama untuk memastikan 409 conflict jelas.
3. Ulangi smoke manusia: double-click/Enter spam/retry pada koneksi lambat dan pastikan hasil sama dengan automated guard suite (satu intent/satu mutation).
4. Putus jaringan sebelum write; UI harus menolak tanpa menyatakan sukses.
5. Install PWA iPhone/Android dan update app shell. Aktifkan Push pada HTTPS, pastikan verifikasi otomatis muncul, lalu periksa panel sistem. Uji dua perangkat saat satu delivery gagal sementara dan pastikan perangkat sukses tidak menerima duplikat. Pada Safari iPhone pastikan aplikasi dibuka dari Home Screen, fokus input tidak memicu auto-zoom, modal tidak bergeser horizontal, dan scroll vertikal tetap bekerja.
6. Sinkronisasi Sheets dan Calendar, termasuk failure/retry.
7. Export Excel dan periksa formula-like input.
8. Backup/restore drill pada salinan terisolasi sementara; jangan gunakan database aktif. Untuk fase pra-go-live satu database, uji **Reset data testing** hanya ketika seluruh data pada preview memang trial/error: uji preset aktivitas dan preset aktivitas + nolkan saldo; pastikan `initial_balance` menjadi 0, `initial_balance_date` canonical, `row_version` naik, dan stale account state membatalkan apply. Selain itu, pastikan financial + operational count tampil, queue rebuild sistem tidak salah dihitung/dihapus, stale fingerprint ditolak, Google Drive preflight dan safety backup terverifikasi, master/audit tetap ada, rebuild integrasi terantre, outcome unknown dapat direkonsiliasi lewat `reset.status` setelah reload, dan maintenance hanya dapat dibuka kembali setelah integrity check lulus + audit `maintenance.recover`.
9. Verifikasi scheduled housekeeping menghapus `idempotency_keys`, `import_previews`, dan `restore_previews` yang expired, tetapi mempertahankan preview berstatus `applying`, ledger, audit, backup, dan master.
10. Responsive, keyboard, focus, contrast, loading/empty/error/unauthorized/maintenance. Audit seluruh CSS untuk custom property yang tidak terdefinisi, native control di bawah 16px, duplicate media query dalam file yang sama, dan endpoint gradient yang gagal kontras.
11. Full axe scan, visual comparison, dan Chrome/Firefox/Safari device coverage dilakukan manual untuk perubahan UI yang relevan.

Tidak boleh mengklaim production-ready hanya berdasarkan unit test; real resource integration dan migration parity wajib lulus.



## Product-control alignment

Perubahan sistem pengendali uang bersama wajib mencakup skenario berikut:

- filter transaksi berdasarkan rekening, kategori, dan pencatat tetap mengikuti projection personal/shared backend;
- regression saldo wajib membandingkan aggregate SQL `visibleAccounts()` dengan `accountBalanceAsOf()` pada fixture income, expense, refund, transfer, adjustment, inactive transaction, initial-balance date, dan beberapa cutoff date; perubahan semantik `transactionImpact()` wajib menjaga parity ini;
- laporan tren 3, 6, dan 12 bulan tidak menghitung transfer sebagai pemasukan atau pengeluaran;
- `/perencanaan/kantong` mengelola Kantong dan Batas Pengeluaran nested dengan idempotency serta `row_version`; batas yang terhubung Kantong hanya menghitung transaksi dari `envelope_rule_id` yang sama; `/laporan` hanya menampilkan analisis batas vs aktual tanpa mutation;
- member dan periode historis melihat Batas Pengeluaran secara read-only, sedangkan owner hanya dapat mengelola periode aktif;
- breakdown per pencatat diberi label aktivitas pencatatan, bukan kontribusi finansial;
- breakdown rekening, kategori, dan nature hanya memakai transaksi aktif yang terlihat oleh actor;
- peringatan budget dan kantong muncul pada threshold, tidak menggandakan notifikasi, dan tidak membocorkan scope personal;
- target dengan tanggal selesai menghitung sisa, kebutuhan setoran bulanan, dan status pace secara deterministik;
- rekonsiliasi berbeda atau terlalu lama menghasilkan peringatan tanpa membuat adjustment otomatis;
- notification queue memakai dedupe key stabil, delivery dicatat per subscription, dan retry hanya mengulang perangkat yang gagal;
- setiap `REQ-*` dalam product requirements tercatat pada implementation matrix;
- setiap gap yang membutuhkan schema baru memiliki RFC `Proposed` sebelum migration atau API baru dibuat.

Fitur yang masih planned seperti receipt terhubung, utang/piutang, category hierarchy, goal stages, privacy granular lanjutan, payer/beneficiary/settlement, dan kontribusi aktual tidak boleh dianggap implemented hanya karena RFC tersedia. Pembagian beban biaya expense shared serta hak Member untuk planning `shared` sudah memiliki implementasi MVP dan harus diuji sesuai kontrak runtime, bukan lagi diperlakukan sebagai RFC-only.

## Authenticated desktop/mobile capability parity

Manual capability QA memakai akun/fixture aman Administrator dan Member pada environment testing. Cakupan minimum:

- seluruh route `/`, `/transaksi`, `/perencanaan/kantong`, `/perencanaan/jadwal`, `/target`, `/laporan`, `/rekening`, `/rekonsiliasi`, `/kategori`, `/pengaturan`, dan nested route Pengaturan dapat dirender pada mobile; route legacy `/anggaran`, `/alokasi`, `/tagihan` harus redirect ke workspace Perencanaan tanpa error;
- heading utama, navigation landmark, route aktif, dan error state tetap benar;
- dashboard mobile membawa batas aman harian, dana belum dialokasikan, rekening, arus kas, ringkasan alokasi agregat, seluruh peringatan melalui progressive disclosure, privacy nominal, lima transaksi terbaru, serta detail transaksi; shortcut utama harus tetap `Pemasukan`, `Pengeluaran`, dan `Transfer`, `Perlu perhatian` harus berada sebelum rekening ketika alert tersedia, transfer baru pada viewport mobile harus memakai `TransactionForm` canonical dengan presentasi `mobile-transfer`, dan filter/search lengkap tetap canonical di `/transaksi` karena `dashboard.overview` hanya membawa recent slice;
- dashboard desktop menampilkan kartu rekening aktual yang dapat dipilih, transaksi rekening terpilih, filter kategori/jenis/pencarian, privacy nominal, statistik global yang tidak salah diklaim sebagai statistik rekening, KPI arus kas, anggaran, tagihan, target, dan insight;
- `/laporan` mobile ≤820px menampilkan mode `Ringkasan` dan `Per kategori`, navigasi periode, pilihan tren 3/6/12 bulan, chart pengeluaran, KPI arus kas/total saldo/saldo aman, perbandingan bulan sebelumnya, kategori terbesar, alert actionable, anggaran vs aktual, serta rincian rekening/nature/pencatat tanpa mutation;
- perubahan periode mobile tidak boleh maju melewati bulan berjalan; kategori memakai ikon katalog canonical dan seluruh nominal berasal dari `reports.monthly` atau derivasi deterministik `trend.items`, bukan dari page slice;
- menu `Lainnya` aktif dengan `aria-current="page"` pada route sekunder;
- menu `Lainnya` tidak memuat quick-add duplikat dan menampilkan link Rekonsiliasi pada kelompok Kontrol saldo;
- grup mobile harus berurutan Perencanaan, Data keuangan, Kontrol saldo, dan Aplikasi; hanya satu item `Perencanaan` tampil di navigation dan workspace mempunyai tab `Kantong Dana` serta `Jadwal Rutin`;
- Administrator dan Member memakai route yang sama, sementara kontrol write tetap mengikuti authorization data/API;
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
Untuk modal/bottom sheet yang mendukung gesture, regression tambahan wajib mencakup 767, 768, 769, 820, dan 821 CSS pixel: gesture mobile tetap aktif sampai 820 dan nonaktif mulai 821.

## Rekening, rekonsiliasi, dan kategori — responsive financial card

- Administrator mobile dan desktop melihat aksi `Tambah rekening` pada route Rekening dan `Tambah kategori` pada route Kategori.
- Manual QA `/rekening` memeriksa stack mobile setelah konten lazy terlihat sebelum menilai `Tambah rekening`, label `Pribadi · <pemilik>`, gesture, atau capability lain.
- Member dapat melihat rekening/kategori tetapi tidak memperoleh aksi create/edit/archive Administrator.
- Dialog rekening dan kategori terpisah serta memakai form domain yang sama pada desktop/mobile tanpa tab lintas domain.
- Stack kartu mobile memakai swipe vertikal pada kartu aktif. Container memakai `touch-action: pan-y pinch-zoom`, kartu aktif memakai `touch-action: pan-x pinch-zoom`, gesture horizontal tidak mengganti rekening, dan area kosong stack tetap menggulir halaman.
- Tombol `Daftar rekening` harus membuka daftar rekening aktif. Rekening mobile memakai quick action `Transfer` yang membuka form transfer canonical; `Riwayat` dan `Grafik` tetap menjadi tab informasi, sedangkan Jadwal rutin dan Rekonsiliasi berada pada route masing-masing.
- Kartu generic harus flat tanpa gradient; ringkasan rekening dan quick action tidak boleh membentuk card/panel tambahan.
- Scrollbar visual mobile boleh disembunyikan, tetapi `overflow-y` tidak boleh dikunci dan konten paling bawah harus tetap dapat dicapai.
- Kontrol form memakai font 16px tanpa menonaktifkan zoom viewport.
- Route `/rekonsiliasi` menampilkan form hanya untuk rekening `can_reconcile`, mengirim idempotency key, mencatat selisih tanpa adjustment otomatis, dan tetap mengandalkan authorization backend.
- Rekening desktop/mobile/detail dan selector finansial relevan wajib membedakan saldo fisik, dana dalam Kantong, dan dana tersedia; Kantong tidak boleh dipresentasikan sebagai uang tambahan di atas saldo rekening.
- Template BCA, BNI, BTN, Mandiri, dan Permata berasal dari `accounts.bank_template`; mengganti template tidak boleh mengubah nama rekening. Object legacy tanpa field boleh memakai suffix nama hanya sebagai fallback visual.
- Asset base bank memuat logo dan chip hanya satu kali; komponen tidak merender wordmark atau chip HTML yang menumpuk di atas asset.
- Nomor rekening bank 6–34 digit divalidasi backend, ditampilkan hanya pada rekening yang lolos scope authorization, dapat disalin dari detail, dan audit hanya menyimpan empat digit terakhir. Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap tidak boleh berada pada asset/DOM.
- Create bank tanpa nomor, karakter non-digit yang tidak diizinkan, account number terlalu pendek/panjang, dan constraint database harus ditolak.
- Asset BCA/BNI/BTN/Mandiri/Permata, ShopeePay/DANA/GoPay/OVO/LinkAja, Tunai, dan Tabungan harus tepat 768×484, maksimal 160 KB, dan memakai rasio CSS 1.586:1 pada list, detail, preview, desktop, serta mobile.
- Provider E-wallet canonical berasal dari `accounts.ewallet_template` (`generic`, `shopeepay`, `dana`, `gopay`, `ovo`, `linkaja`). Deteksi nama hanya boleh dipakai untuk object/backup legacy tanpa field tersebut; nilai `generic` yang tersimpan tidak boleh dioverride oleh inferensi nama. Provider tidak boleh memengaruhi authorization/business logic dan E-wallet lain wajib tetap aman pada fallback generic.
- `accounts.update` wajib menolak perubahan `account_type` walaupun dikirim langsung oleh client; jenis hanya ditentukan saat create, sehingga template/provider tidak dapat dipakai untuk menyamarkan perubahan jenis rekening setelah rekening memiliki histori.
- Setelah create/update/archive rekening atau kategori, daftar aktif dan dashboard diperbarui tanpa refresh manual.
- Setelah rekonsiliasi, riwayat dan alert/dashboard diperbarui.
- Submit rekonsiliasi wajib mengunci input selama write, menampilkan progress lokal `simpan ke server -> perbarui tampilan`, tidak menduplikasi GlobalProcessIndicator/toast untuk `reconciliations.create`, dan baru menampilkan result overlay setelah server mengonfirmasi write. Matched memakai celebration satu-shot; difference memakai hasil warning tanpa money rain.
- Result overlay rekonsiliasi wajib focus-trap, dapat ditutup dengan Escape/tombol, mengembalikan fokus, menjaga safe-area mobile, dan menghormati `prefers-reduced-motion`. Refresh read-model yang gagal setelah write success tidak boleh mengubah outcome write menjadi gagal; UI harus menyatakan bahwa server sudah menyimpan tetapi tampilan mungkin perlu dimuat ulang.
- Viewport 360, 390, 820/821, 940/941, dan 1440 tidak overflow horizontal.
- Controlled input pada Modal harus dapat menerima beberapa karakter berurutan tanpa fokus berpindah ke tombol tutup; Escape, Tab/Shift+Tab, body scroll lock, dan focus restoration tetap diuji.
- Saat Modal mutation kritis memakai `dismissible=false`, tombol X harus disabled, Escape/backdrop/swipe tidak menutup dialog, tetapi Tab/Shift+Tab dan focus trap tetap berfungsi.
- Loading di dalam shell tidak boleh merender nested `main`; loading panel/inline tidak boleh mengambil tinggi satu viewport. Empty/error inline harus tetap compact pada mobile.
- Migration v5 menerima enum template bank valid, migration v6 menambah delivery Web Push per subscription, migration v7 menambah notification preference actor-scoped, dan migration v8 menambah `ewallet_template` additive. Migration v9 menambah `envelope_rules.assignee_user_id` additive, migration v10 menambah `manual_reminders`, dan migration v11 menambah `transactions.cost_share_mode` + `cost_share_json`; restore runtime v11 tetap menerima backup schema v3-v10; field provider/template yang belum ada dinormalisasi secara aman dan preference default aktif dipertahankan untuk backup lama.
- Alokasi assigned harus memisahkan `assignee_user_id` dari ownership ledger: Member hanya dapat memakai/memindahkan Jatah Bersama atau jatah sendiri, rekening personal mengunci penerima ke pemilik rekening, notifikasi assigned hanya menuju penerima, dan penonaktifan user diblok bila masih ada jatah aktif.
- Budget personal harus dihitung hanya dari transaksi personal user terkait, tidak boleh dipakai sebagai substitusi jatah per orang dari rekening Bersama, dan user dengan Budget personal aktif tidak dapat dinonaktifkan.
- Sidebar melengkung harus tetap terlihat, target sentuh minimal 44px, submenu minimal dapat ditutup, dan menu mobile tidak menduplikasi theme toggle.

## Regression rekening transparan dan capability mobile

- Member harus menerima seluruh rekening shared/personal beserta `owner_name`; rekening personal pasangan wajib `read_only=true`, `can_transact=false`, dan `can_reconcile=false`.
- Member harus dapat membaca transaksi pasangan untuk menelusuri saldo, tetapi update/cancel hanya boleh untuk transaksi sendiri pada scope operable; transaksi legacy pada rekening personal pasangan tetap harus ditolak.
- `totalBalance` harus mencakup semua rekening readable, sedangkan `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` hanya boleh memakai rekening/scope operable actor.
- Lifecycle finansial end-to-end backend harus menguji income → dana tersedia → tambah alokasi Kantong existing → expense berkantong → budget → release sisa → setor Target → rekonsiliasi, termasuk bukti bahwa adjust alokasi tidak mengubah saldo ledger.
- Shared planning Member harus diuji positif untuk Kantong/adjustment/Batas/Target/Jadwal shared dan negatif untuk scope personal serta lifecycle destruktif.
- Cost sharing schema v11 harus menguji `unspecified`, `equal`, `percentage`, total 100%, rounding integer deterministik, edit nominal, report aggregation, audit, integrity, backup/restore, dan bahwa split tidak mengubah saldo di luar expense canonical. Regression juga wajib membuktikan participant/basis snapshot transaksi lama tetap stabil ketika roster user berubah dan pembayaran occurrence Jadwal Rutin shared memakai kontrak split yang sama.
- Dashboard wajib membedakan `unallocatedFunds` dari `unallocatedExpenseAmount`/`unallocatedCount`; free funds harus tetap tampil walau jumlah expense tanpa Kantong nol.
- Label pemilik wajib konsisten pada filter transaksi, account breakdown, reconciliation history, dan reconciliation alert.
- `reconciliations.list` bersifat readable; `reconciliations.create` tetap operable. Negative authorization test wajib memakai request langsung ke service, bukan hanya tombol tersembunyi.
- Form transaksi hanya menawarkan rekening dengan `can_transact !== false`; backend tetap mengulang guard ownership.
- Form rekening personal Administrator dapat memilih user aktif. Saat `users.list` gagal, create harus fallback ke actor backend dan edit harus mempertahankan `owner_user_id` existing tanpa field required kosong.
- Route `/kategori` harus menyediakan tipe refund sesuai `CATEGORY_TYPES` backend. Mutation master yang sudah sukses tidak boleh dilaporkan gagal karena reload domain atau refresh dashboard/bootstrap sesudahnya gagal; UI harus mempertahankan status sukses server dan mengekspos refresh warning.
- Manual mobile QA pada viewport representatif memeriksa dua tab `/perencanaan` termasuk drill-down detail Kantong dan konfirmasi Jadwal Rutin, kedua mode mobile `/laporan` beserta pergantian periode/rentang tren dan chart tanpa overflow, nested route `/pengaturan` sesuai role, detail read-only pasangan `/rekening`, route `/kategori`, overflow horizontal modal, focus trap, Escape close, body scroll lock, dan focus restoration.
- Regression dependency UI memverifikasi setiap named import `react-icons/fi` pada `frontend/src` benar-benar tersedia pada package. `npm run build` tetap blocking karena route lazy seperti `/laporan` dapat lolos source-text/unit test tetapi gagal dimuat bila bundler menemukan named export invalid.
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


## Build budget dan route isolation

- Jangan menaikkan limit build budget hanya untuk membuat QA hijau. Cari import sinkron, CSS global, asset legacy, atau dependency besar yang seharusnya lazy-loaded.
- Dependency provider yang hanya dibutuhkan pada aksi tertentu, seperti Firebase Google redirect mobile, harus berada pada lazy chunk terpisah dan tidak membengkakkan `LoginPage` route chunk.
- CSS shell terautentikasi tidak boleh dimuat pada route login bila tidak dibutuhkan. Shared brand/loading style tetap berada pada global primitive.
- Asset publik yang sudah tidak direferensikan source, test, manifest, atau docs wajib dihapus setelah usage scan.
- Build budget harus dijalankan setelah production build dan tetap menjadi blocking quality gate.
- Asset main JS, global CSS, atau route yang mencapai 90% batas menghasilkan warning headroom. Warning adalah trigger review static import/lazy boundary sebelum feature berikutnya, bukan alasan menaikkan threshold.
- Regression statis menjaga presentation/dialog besar Transaksi serta dialog Kantong/Batas Pengeluaran/Jadwal Rutin tetap berada di lazy boundary yang sengaja dibuat untuk headroom.

## Maintainability, artifact hygiene, dan duplicate-report policy

- `npm-audit-YYYYMMDD.json` adalah diagnostic lokal: boleh berada sementara di working directory, wajib di-ignore Git/source validator, dan **tidak boleh** masuk clean ZIP. Validator dan packager memakai policy local-only yang sama.
- `cache.js` dan `client.js` wajib memakai serializer canonical yang sama agar query key dan mutation fingerprint tidak drift ketika urutan property payload berubah.
- Helper versioning mengekstrak stamp update (`row_version`/`updated_at`/`updated_by`) dan create (`row_version`/`created_*`/`updated_*`) yang benar-benar identik; ownership (`scope`, `owner_user_id`, `owner_scope`), optimistic `WHERE row_version=?`, reversal metadata, dan business transition tetap eksplisit di service domain.
- `npm run check:duplicates` memakai jscpd pinned dan **report-only/non-blocking**. Prioritas refactor adalah clone JavaScript/JSX yang berisiko drift; migration SQL dan CSS module deklaratif tidak dikejar hanya demi persentase.
- Feedback transient success/info/warning memakai `FeedbackProvider`; error mutation, conflict, maintenance/read-only, backup/restore/import, dan status integrasi yang perlu tetap terlihat memakai notice persisten. Generic hard undo/rollback tidak tersedia; reversal finansial tetap action domain audited.
- Recurring occurrence mutation wajib enqueue Calendar dengan `recurring_occurrence:<occurrence_id>` dan mirror recurring melalui `<recurring_rule_id>`; pay/reverse/skip/restore harus memakai identitas sinkronisasi yang sama.

## Modal, Kategori, dan route Pengaturan

- Ukur `scrollWidth <= clientWidth + 1` pada dialog dan `.modal__body` untuk Tambah Transaksi, Tambah/Edit Kategori, Rekening, Import, Restore, serta konfirmasi periode pada 320, 360, 390, 414, dan 430px.
- Pastikan `.modal__body` memakai `overflow-x: hidden`, `overflow-y: auto`, dan indikator scrollbar mobile tersembunyi tanpa body scroll lock permanen.
- Transaksi mobile memakai history-first: periode + grafik ringkas di atas, type chips horizontal yang terkendali, Search/Filter sebagai icon control, dan advanced filter menjadi grid dua kolom lalu satu kolom. Tidak ada nested horizontal scroll pada content; horizontal scroll hanya untuk chip filter cepat yang memang bounded.
- Verifikasi `/transaksi` mobile pada 320/360/390/414/430px: heading route tidak diduplikasi di body; bulan previous/next bekerja sampai bulan berjalan; report-summary failure tidak memblokir ledger; filter common + advanced mempertahankan query canonical; cancelled/managed/unallocated badge tidak menggeser nominal keluar viewport; detail modal tetap scrollable dan lifecycle action tetap capability-driven.
- `categories.create` menormalkan non-pengeluaran tanpa nature eksplisit menjadi `other`, menolak nature pengeluaran pada income/refund, serta menolak kategori expense baru dengan nature `savings`.
- Data legacy `savings` tetap dapat dibaca dan diubah menuju klasifikasi baru tanpa migration diam-diam.
- `/pengaturan` hanya memuat `system.health`; setiap nested route memuat resource sendiri dan menampilkan result/error dekat tindakan.
- Administrator-only deep link tetap menampilkan guard frontend dan wajib ditolak backend bila request dipaksakan oleh member.

## Web Push desktop dan mobile

- `system.health` pada Pengaturan wajib memakai `status`, `schemaVersion`, dan `maintenanceMode`; test menolak akses `database` serta `schema.ready` pada response action tersebut.
- Schema Production harus versi 11 dan `npm run db:integrity` harus lulus sebelum register subscription.
- `npm run env:check` wajib memvalidasi pasangan `VITE_VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` serta format `VAPID_SUBJECT`.
- Bootstrap Development interaktif wajib menarik ulang Vercel Development walaupun `.env.local` lama terlihat lengkap; hasil pull mengganti file hanya setelah sembilan core + Web Push lolos validasi.
- Mode non-interaktif tidak membuka login/network bootstrap dan hanya menerima `.env.local` yang sudah valid.
- `env:push:development:settings` wajib menyinkronkan Web Push dan Google bridge yang aktif tanpa menyentuh core environment.
- Setelah `npm run env:push:production`, deployment Production baru wajib dibuat. Bundle lama tidak boleh dianggap menggunakan key baru.
- Desktop Chrome/Edge dan Android Chrome: Aktifkan, izin granted, register server, verifikasi otomatis, click membuka `/pengaturan/notifikasi`, Nonaktifkan, dan register ulang.
- iPhone/iPad: tab Safari harus menampilkan instruksi Home Screen; aplikasi standalone iOS/iPadOS yang mendukung harus dapat meminta izin melalui ketukan tile dan menerima verifikasi otomatis.
- Dua perangkat pada akun yang sama harus memiliki subscription terpisah. Retry perangkat gagal tidak boleh mengirim ulang ke perangkat yang sudah sukses.
- Subscription 404/410 harus dinonaktifkan. Endpoint lokal/private harus ditolak. Queue server boleh menyimpan copy server-generated, tetapi payload Web Push normal hanya boleh membawa `notificationType`, `targetPath`, dan `notificationId`; nominal, nama rekening, merchant, serta nama objek finansial tidak boleh keluar ke lock screen. Test Push tetap generik. QA perangkat nyata wajib memverifikasi copy generik pada Android/iOS/desktop.
- Apps Script hanya memiliki satu trigger `runScheduledJobs`, secret scheduler sama dengan Vercel, dan `/api/jobs` berhasil memproses queue tanpa menggagalkan backup ketika Push gagal.

## Full reset

Full reset harus diuji pada database terisolasi: preview mencakup accounts/categories/ledger/operational state; users/audit/backups/integrity/idempotency/nonce anti-replay/config/schema tetap; safety backup berisi data sebelum purge; stale preview ditolak; queue rebuild canonical tidak membuat preview sesudah reset terlihat kotor; outcome unknown direkonsiliasi lewat `fullReset.status`; member ditolak; dan integrity/audit/maintenance failure menyebabkan rollback/fail-closed.

## Login Google mobile

- Desktop dan mobile memakai satu tombol HTML branded Google milik Saldo Bersama dan tidak memakai `google.accounts.id.renderButton()`. Pada production canonical, tombol menavigasi ke `/api/auth/google/start`; server membuat signed OAuth transaction state/nonce berumur singkat, Google kembali ke `/api/auth/google/callback`, server menukar authorization code ke Google ID token lalu ke Firebase ID token melalui Identity Toolkit, dan verifier Firebase + allowlist/role existing membuat server session. Localhost/device emulation memakai `signInWithPopup` + in-memory persistence sebagai fallback development. Backend session tetap menjadi authority.
- Tombol disabled selama auth/session diproses, mencegah double-submit, dan menampilkan error ramah tanpa raw provider error. Production tidak memakai Firebase browser redirect state. Server callback wajib memverifikasi signed `state`, `nonce`, audience/issuer/expiry binding, tidak menyimpan Google access/refresh token, menolak open redirect, dan hanya membuat session setelah Firebase ID token diverifikasi serta allowlist/role backend lolos. `VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com` tetap public config untuk popup development/compatibility; OAuth redirect URI production wajib `https://saldo-bersama.vercel.app/api/auth/google/callback` dan `GOOGLE_OAUTH_CLIENT_SECRET` wajib Production Sensitive.
- Network, unauthorized-domain, web-storage, provider error, dan redirect-result-missing tetap kembali ke halaman login dengan copy aman dan dapat dicoba ulang. Progress bar, counter langkah, serta tombol back visual tidak tampil pada seluruh flow mobile.
- Desktop dan mobile memakai tombol HTML branded yang sama. Production memakai server OAuth callback, localhost/device emulation memakai Firebase popup. Backend allowlist, role, dan verifikasi Firebase ID token tetap source of truth.
- Production manual QA wajib memastikan `saldo-bersama.vercel.app` ada di Firebase Authorized Domains, Google provider aktif, OAuth Web Client memuat `https://saldo-bersama.vercel.app/api/auth/google/callback`, dan `GOOGLE_OAUTH_CLIENT_SECRET` tersedia pada Vercel Production Sensitive, lalu menguji round-trip pada Android Chrome dan iPhone Safari/Home Screen bila tersedia. Responsive emulation desktop tidak dianggap bukti real-device karena localhost tetap menggunakan popup fallback. Evidence Vercel yang diharapkan: `session.oauth.start` → callback `session.login` dengan `flow=google-oauth-server` status 200 → `GET /api/session` 200; production desktop/mobile tidak lagi mengandalkan client `POST /api/session`.

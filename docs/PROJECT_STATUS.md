# Project Status

Dokumen ini adalah snapshot kondisi project sekarang, bukan jurnal perubahan.

## Runtime canonical

- **Frontend:** React 19 + Vite 7 PWA.
- **Backend:** Vercel Functions.
- **Database/source of truth:** Turso/SQLite HTTP pipeline.
- **Auth desktop dan mobile:** tombol Google branded Saldo Bersama memakai contract UI yang sama, tetapi transport production dan development dipisah pada loading boundary. Pada production canonical `saldo-bersama.vercel.app`, tombol siap melalui module server-OAuth ringan tanpa mengunduh Firebase browser Auth, lalu browser memulai Google OAuth Authorization Code flow ke `/api/auth/google/start`; callback server memverifikasi signed `state`/`nonce` + PKCE S256, menukar code menjadi Google ID token, menukarnya lagi melalui Firebase Identity Toolkit menjadi Firebase ID token, lalu memakai verifier Firebase + registry `users` canonical sebelum membuat registered HttpOnly server session. Localhost/device emulation lazy-load Firebase popup sebagai fallback development. Mobile menyimpan hanya flag presentasional bahwa onboarding pernah dilihat agar returning device langsung ke login; flag tidak menjadi authority dan onboarding dapat dibuka ulang. Tidak ada Firebase browser redirect state pada production.
- **Session/authorization authority:** signed HttpOnly session v2 membawa credential opaque; `user_sessions` + status/role/binding Firebase UID pada `users` adalah authority runtime. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama. User dapat melihat/revoke session perangkat miliknya; role change/deactivation mencabut session aktif.
- **Google integration:** Apps Script bridge; Sheets mirror satu arah, Calendar reminder bersama, Drive backup teknis.
- **Abuse/operational health:** process-local limiter tetap lapisan murah, sedangkan bucket Turso v13 menjadi counter lintas instance untuk gateway/export/login/OAuth. Public health tetap minim data dan kini ikut degraded untuk dead-letter integrasi aktif, notification queue dead-letter yang masih actionable, per-device Push dead-letter yang belum pulih, backup terbaru gagal, atau integrity run terbaru gagal; partial Push delivery juga mendegradasi scheduler heartbeat. External alert delivery tetap belum dipilih/diimplementasikan.
- **Active schema contract:** v13.
- Source v13 mempertahankan guard `DATABASE_ENVIRONMENT`/session v12 dan menambah `rate_limit_buckets` durable untuk throttle lintas instance; binding database tetap fail-closed. **Live separation Development/Production belum boleh dianggap selesai tanpa evidence Vercel/Turso**; bila satu database lama masih dipakai, binding hanya dapat cocok untuk satu environment dan environment lain akan gagal sampai database/token dipisahkan. exit criteria ADR-0007 tetap memerlukan bukti operasional.

## Workflow saat ini

- Source terbaru + test aktual adalah sumber kebenaran.
- Tidak ada task card/Task ID/branch automation sebagai workflow wajib.
- Quality gate lokal canonical: `npm run verify`; `npm run zip` menjalankannya otomatis sebelum packaging dan pre-push guard menjalankannya lagi sebelum push. Handoff patch hanya berstatus final setelah gate tree final PASS pada Node 24.18.1; environment non-canonical wajib menyebut artifact candidate/unverified. Setelah setiap verification PASS maupun gagal, generated build/test artifact dan cache Vite generated dibersihkan tanpa menghapus dependency, `.env.local`, `.vercel`, atau Git metadata.
- Delivery rutin: commit pada `main` lalu `git push origin main`; pre-push memverifikasi ref/SHA aktual, clean working tree, fast-forward, dan full `npm run verify` sebelum ref dikirim. Quality GitHub tetap berjalan server-side.
- `npm run zip` tetap menjalankan full verification. Jika PASS, ia membuat `saldo-bersama-clean.zip`. Jika verification gagal tetapi source masih canonical, ia tetap exit non-zero dan membuat `saldo-bersama-UNVERIFIED.zip` khusus diagnosis dengan `docs/UNVERIFIED_BUILD_REPORT.md` staging-only; archive UNVERIFIED bukan release/deployment artifact dan tidak menggantikan clean ZIP verified terakhir.
- Guarded/high-risk tetap membutuhkan approval eksplisit sebelum coding/operation.

## UI foundation / maintainability saat ini

- Contract maintainability canonical sekarang berada di `docs/CODE_MAINTAINABILITY.md`: code menjelaskan WHAT, comment menjelaskan WHY/invariant, extraction mengikuti responsibility bukan line count, dan public facade service tetap stabil. Backend notifications, master data, reporting dashboard, recurring, goals, envelopes, serta pure read-model reset/full-reset sudah dipisah ke child module satu arah; governance menolak child yang mengimpor facade induk dan menolak circular dependency relatif backend.
- Guarded authority tetap terkonsentrasi: finance/saldo, auth/session, idempotency, destructive maintenance, dan hard DELETE allowlisted tidak dipindahkan menjadi presentation/helper authority. Frontend form/page besar memisahkan presentation sementara submit/idempotency/recovery/auth orchestration tetap pada parent canonical.
- Shared primitive canonical memakai CSS Modules. Global compatibility class tetap tersedia untuk direct `button`/`Link` legacy, tetapi state disabled dan control height sekarang mengikuti token/semantics yang sama dengan `Button.module.css`; duplicate override `min-height` sudah dihapus.
- Empat stylesheet feature masih transitional sesuai ADR-0009 dan dilacak eksplisit di `UI_DESIGN_SYSTEM.md`: Dashboard, Login, Transactions, dan FinancialAlertList. Migrasinya dilakukan serial, bukan mass-refactor.
- Token `--account-*` tetap global karena perlu theme-level contract, tetapi diberi ownership Accounts-only. `components/finance/` tetap target opsional dan belum dibuat sampai ada reusable consumer lintas feature nyata.
- Named import `react-icons/fi` kini memiliki regression contract yang memverifikasi symbol benar-benar diekspor package, sehingga typo/ikon yang tidak tersedia gagal pada test sebelum mencapai build.
- Route Transaksi dan workspace Perencanaan memakai lazy boundary untuk presentation/dialog berat. Perencanaan memiliki dua tab canonical: Alokasi Dana dan Jadwal Rutin; Kebutuhan dikelola di detail Alokasi Dana, sedangkan Anggaran menjadi overview read-only lintas Kebutuhan. Build budget tetap memberi warning mulai 90% batas agar headroom rendah terlihat sebelum patch berikutnya menjadi failure.
- Mobile `<=820px` memakai Manrope Variable dengan body 14px, body-sm 13px, sm 12.5px, xs 12px, serta bobot semantic semibold/bold 550/650. Native input/select/textarea memakai token 16px terpisah untuk mencegah auto-zoom Safari; meaningful financial/status metadata dijaga sekitar 12px+, dan target sentuh efektif minimum 44×44px. Outer gutter/section/card normal memakai 16px dengan fallback 12/14px hanya pada `<=340px`. Generic topbar serta route full-bleed memasukkan safe-area top sesuai ownership layout.
- Bottom navigation mobile mempertahankan geometri 72px/24px/12px dengan FAB 52px dan lima slot sama lebar; tab non-FAB memakai seluruh 72px sebagai hit area dan active state memiliki indikator bentuk selain warna. Primary tab Beranda/Transaksi/Laporan mempertahankan posisi scroll masing-masing, secondary route baru dimulai dari atas, dan browser Back/Forward memulihkan posisi entry history sebelumnya bila sudah direkam. Perubahan ini presentation-only dan tidak mengubah saldo, ledger, authorization, atau mutation contract.
- Feedback sukses finansial sekarang memakai primitive canonical `FinancialSuccessOverlay`: Pengeluaran, Pemasukan, Transfer, Refund, dan rekonsiliasi matched berbagi logo aplikasi + badge ceklis animasi, nominal utama, ringkasan kontekstual, MoneyRain staggered, safe-area mobile, focus trap, serta reduced-motion fallback. `transactions.create` dan `reconciliations.create` disupresi dari global mutation pill agar tidak menghasilkan feedback ganda; rekonsiliasi difference tetap memakai warning terpisah tanpa celebration.
- Alert `Perlu perhatian` mobile sudah diringkas: instruksi tidak lagi memakai card bersarang “Yang perlu dilakukan”, sementara CTA, severity, target route, dan dashboard state tetap sama. CSS rekonsiliasi legacy yang tidak memiliki consumer serta kolom desktop kosong dari guide panel lama sudah dibersihkan.

## Transaksi mobile saat ini

- `/transaksi` pada viewport ≤820px memakai presentation history-first terpisah dari table/filter desktop. Page tidak mengulang heading body; periode menjadi anchor utama, diikuti grafik arus kas 6 bulan dari `reports.monthly`, metadata pemasukan/pengeluaran, lalu daftar ledger berkelompok tanggal.
- Filter cepat hanya mengekspos jenis umum, Search, dan Filter. Dialog lanjutan sekarang memakai type selector compact serta baris native-select untuk Alokasi Dana, rekening, kategori, dan pencatat; Pengembalian dan Penyesuaian tetap tersedia. Semua query tetap memakai `transactions.list` canonical dan pagination backend existing.
- Row memakai fallback judul informatif tanpa `Tanpa keterangan`, lalu metadata sekunder yang menghindari duplikasi dan dapat menampilkan merchant, rekening, kategori, serta nama pencatat lengkap. Badge tetap hanya untuk exception penting (managed recurring/goal, belum dialokasikan, cancelled). Detail transaksi memuat jenis, kategori, rekening, alokasi, pencatat, tanggal Asia/Jakarta, sumber, status, dan action capability existing.
- Mobile presentation sudah dipisah ke CSS Module `MobileTransactionHistory.module.css`; `TransactionsPage.css` masih transitional untuk desktop table/filter dan detail modal. Backend finance, schema, saldo, authorization, audit, idempotency, serta login tidak berubah oleh redesign ini.


## Beranda mobile dan mutation safety saat ini

- Beranda mobile memakai data canonical `dashboard.overview` untuk saldo, batas aman harian, rekening aktif, arus kas, alert, lima transaksi terbaru, serta ringkasan Alokasi agregat. Hierarchy presentasi mengikuti status → perhatian → tindakan → aktivitas → detail: hero saldo tetap pertama, `Perlu perhatian` muncul sebelum quick actions saat blok alert dirender, transaksi terbaru berada sebelum ringkasan informasional yang lebih pasif, lalu Alokasi/arus kas/rekening/insight. Shortcut utama tetap fokus pada aksi harian `Pemasukan`, `Pengeluaran`, dan `Transfer`. Filter/search lengkap sengaja tetap berada di `/transaksi`; recent slice Dashboard tidak dipresentasikan seolah-olah mewakili seluruh ledger. Transfer baru pada viewport mobile memakai presentasi `mobile-transfer` dari `TransactionForm` canonical, bukan form terpisah.
- Ringkasan Alokasi Dana menjumlahkan nominal `used_amount + reserved_amount` sebagai **terpakai + dipesan** dan tidak lagi memilih alokasi pertama berdasarkan urutan nama. Perhitungan saldo/ledger tidak berubah.
- Mutation biasa yang berakhir `OUTCOME_UNKNOWN` mempertahankan metadata idempotency intent aman lintas reload (action, fingerprint hash, key, timestamp; tanpa payload finansial) di storage browser yang di-namespace per session/user. Payload berbeda untuk action yang sama diblok sampai intent lama mendapat hasil definitif; form transaksi mengunci field dan menyediakan retry data yang sama. Reset/full reset tetap memakai recovery/status workflow khusus.
- **Reset data testing** sekarang fail-closed di backend: `reset.preview` dan `reset.apply` hanya tersedia bila database terikat tepat sebagai `development`, sehingga Production/unbound ditolak sebelum safety backup, maintenance lock, atau purge. `reset.status` tetap dapat dibaca untuk reconciliation/recovery intent lama; route frontend reset juga tidak tersedia pada build non-Development.
- Close/reopen periode serta perubahan anggota menginvalidasi projection yang bergantung, termasuk transaksi/dashboard, agar capability dan label tidak tertahan cache lama.
- Service Worker v10 tetap network-only untuk `/api/*`; stable image memakai stale-while-revalidate sehingga asset publik dapat diperbarui setelah deployment tanpa menunggu cache lama habis.

## Workspace Perencanaan saat ini

- Navigation menampilkan grup `Perencanaan` dengan `Perencanaan`, `Anggaran`, dan `Target`. Workspace Perencanaan memakai dua tab canonical: `Alokasi Dana` (`/perencanaan/kantong`) dan `Jadwal Rutin` (`/perencanaan/jadwal`). `/anggaran` adalah overview read-only Kebutuhan. Route `/alokasi` dan `/tagihan` dipertahankan sebagai compatibility redirect.
- Alokasi Dana tidak meminta kategori. Klik item Alokasi Dana membuka detail dana, Kebutuhan kategori, dan Jadwal Rutin terkait. Kebutuhan tetap memakai record `budgets` dan relasi `budgets.envelope_rule_id` existing. Kategori yang sama dapat dipakai pada beberapa Alokasi Dana karena pencocokan Kebutuhan juga memasukkan `envelope_rule_id`; budget lama tanpa relasi dapat dihubungkan saat kategori tersebut pertama kali dipakai di detail Alokasi Dana. Pemakaian hanya menghitung transaksi kategori yang benar-benar memakai Alokasi Dana tersebut. Tidak ada migration/schema baru.
- Penutupan periode Alokasi Dana sekarang selalu menyiapkan periode aktif berikutnya agar rule aktif tidak menjadi state tanpa periode. Policy `unallocated` memulai periode berikutnya pada Rp0 dan mengembalikan sisa ke dana tersedia; policy `carry` hanya membawa sisa aktual dan tetap membuat periode berikutnya bila sisa Rp0. User dapat memilih `Pakai lagi kebutuhan di periode berikutnya`; pilihan ini hanya menyalin kategori dan nominal rencana Kebutuhan yang belum ada di periode tujuan, tidak menyalin transaksi, saldo, atau dana, dan tidak menimpa rencana yang sudah dibuat user.
- Jadwal Rutin tidak lagi mengekspos penanda Auto-debit. Occurrence yang jatuh tempo menunggu konfirmasi transaksi aktual; ledger/saldo tidak berubah sebelum transaksi aktual berhasil disimpan. Bila kategori Kebutuhan memiliki relasi Alokasi Dana yang tidak ambigu, Jadwal dapat menyarankan rekening sumber dan konfirmasi aktual menyarankan Alokasi Dana terkait tanpa mempercayai data client untuk authorization.
- Target, Alokasi Dana, Jadwal Rutin, dan Anggota tetap memakai artwork existing secara dekoratif. Nominal, status, capability, authorization, saldo, serta ledger tetap berasal dari read model/service canonical.
- Alokasi Dana tetap account-bound: item baru wajib satu rekening sumber, read model rekening menyediakan saldo fisik, dana dialokasikan, dan dana tersedia; transaksi beralokasi wajib memakai rekening yang sama, transaksi bebas/Transfer tidak boleh mengambil dana yang sudah dialokasikan, dan realokasi baru lintas rekening ditolak.
- Dana tersedia kini dapat ditambahkan ke Alokasi Dana existing atau dilepas kembali melalui `envelopes.adjustAllocation` tanpa membuat ledger transaction. Member dapat mengelola planning shared sesuai RFC-0016; khusus Kebutuhan, Member juga dapat membuat/mengubah Kebutuhan personal miliknya sendiri. Lifecycle destruktif/recovery tetap Administrator-only.
- Dashboard memisahkan dana tersedia yang belum dibagi dari pengeluaran tanpa Alokasi Dana dan menyediakan CTA berbeda. First-run checklist mengarahkan Rekening → Kategori → Alokasi Dana → Target berdasarkan capability actor. Target memberi warning bila belum ada rekening sumber lain yang kompatibel untuk setoran.
- Transfer canonical mendukung boundary **shared ↔ personal** bila actor memang dapat mengoperasikan kedua rekening; transaksi mengikuti satu owner personal agar ledger/privacy representable, sedangkan personal milik dua user berbeda tetap ditolak. Target bersama dapat menerima setoran dari rekening shared atau rekening personal actor yang kompatibel dengan aturan representability yang sama; Member tetap tidak memperoleh akses ke rekening personal pasangan. Transfer dan mutasi Target tetap netral terhadap income/expense.
- Dashboard, Transaksi, Laporan, Rekening, Kategori, dan Pengaturan sengaja tidak diberi artwork hero tambahan karena masing-masing sudah memiliki chart, kartu domain, icon taxonomy, atau utility hierarchy sebagai fokus utama.
- Empat ilustrasi reuse path login existing (`piggy-bank`, `wallet`, `finance-checklist`, `house`) dengan semantic dekoratif kosong agar login yang sudah stabil tidak memerlukan perpindahan asset.

## Pembagian beban biaya saat ini

- Schema v11 menambah `transactions.cost_share_mode` dan `cost_share_json` untuk expense shared. Mode MVP `equal` dan `percentage` menghasilkan snapshot integer Rupiah deterministik; histori lama tetap `unspecified`.
- Split bersifat analitis dan tidak mengubah ledger atau saldo. `created_by` tetap aktivitas pencatatan. `reports.monthly` menampilkan breakdown “Pembagian beban biaya” terpisah dan tidak menyebutnya kontribusi aktual.
- Payer, beneficiary, settlement, template split lanjutan, serta hubungan refund ke expense asli tetap deferred sesuai RFC-0013.

## Laporan mobile saat ini

- `/laporan` pada viewport ≤820px memakai hierarchy analitik compact yang terpisah dari workspace desktop, tetapi tetap membaca action canonical `reports.monthly`.
- Mode `Ringkasan` menampilkan tren pengeluaran 3/6/12 bulan, arus kas bersih, total saldo, saldo aman, perbandingan dengan bulan sebelumnya, kategori pengeluaran terbesar, serta seluruh alert actionable.
- Mode `Per kategori` menampilkan distribusi kategori memakai ikon kategori canonical, analisis Kebutuhan vs aktual read-only, dan progressive disclosure untuk breakdown rekening, nature, serta aktivitas pencatatan.
- Navigasi periode mendukung bulan sebelumnya/berikutnya sampai bulan berjalan dan picker bulan native. Perbandingan dihitung dari `trend.items` yang sama, sehingga tidak menambah request, schema, mutation, atau business rule baru.
- Desktop `/laporan` tetap memakai panel analitik existing. Backend, auth, saldo, ledger, authorization, dan contract API tidak berubah oleh redesign mobile ini.
- Route `/laporan` kembali buildable setelah import ikon `FiWallet` yang tidak tersedia pada `react-icons/fi` diganti dengan export Feather yang valid. Regression import-symbol dan production build menjadi guard agar route lazy tidak kembali gagal dibuka karena named export invalid.

## Rekening mobile saat ini

- `MobileAccountsExperience` tetap lazy untuk menjaga route-chunk budget. Capability mobile/desktop divalidasi oleh frontend regression dan pemeriksaan manual pada viewport relevan; browser automation tidak menjadi gate canonical.
- Transfer adalah quick action, bukan tab. Form tetap memakai `TransactionForm` canonical dan sukses hanya ditampilkan setelah server mengonfirmasi write.
- `Riwayat` dan `Grafik` adalah dua tab informasi. Transfer tetap tidak dihitung sebagai pemasukan/pengeluaran.
- Form Tambah rekening mobile memakai selector jenis 2 kolom dengan label utuh. Tunai, Dana darurat, dan E-wallet memakai nama canonical/default agar user tidak dipaksa mengisi nama yang tidak diperlukan; backend `name` dan duplicate guard tetap dipertahankan. Kepemilikan memakai label ringkas `Bersama`, `Saya`, atau nama depan pasangan.
- Kartu rekening memakai asset WebP 1024×645 untuk bank, Tunai, Tabungan, serta provider E-wallet ShopeePay, DANA, GoPay, OVO, dan LinkAja; ukuran raster dijaga maksimal 100 KB per asset dan komponen mendeklarasikan dimensi intrinsik agar layout stabil. Provider E-wallet disimpan canonical pada `accounts.ewallet_template` schema v8; nama rekening hanya dipakai sebagai fallback untuk object/backup legacy yang belum memiliki field tersebut. Provider `generic` tetap aman untuk E-wallet lain.


## Notifikasi dan pengingat saat ini

- Tujuh pengingat otomatis existing tetap dijadwalkan server dan memakai dedupe canonical.
- Pengingat manual one-shot tersedia langsung pada Kebutuhan periode aktif, Alokasi Dana aktif, occurrence Jadwal Rutin yang belum selesai, dan Target aktif. Pengingat hanya milik actor, disimpan server-side, memakai `row_version`, idempotency, audit, dan diproses scheduler.
- Push produk memakai privacy-safe lock-screen: copy detail boleh tetap ada di queue server, tetapi transport Web Push hanya membawa tipe/id/target dan Service Worker menampilkan copy generik tanpa nominal, rekening, merchant, atau nama objek finansial. Logo aplikasi tetap dipakai sebagai `icon` dan badge monokrom khusus Android.
- Reminder manual menampilkan `lastDispatch` dari queue, menolak jadwal baru selama dispatch lama masih nonterminal, dan dibatalkan atomik saat entity selesai/ditutup/diarsipkan/dihapus; integrity check memeriksa drift user/entity/queue. UI memberi warning bila Web Push perangkat belum siap tanpa menganggap penyimpanan reminder gagal.
- Real-device Android/iOS/desktop tetap memerlukan QA operasional karena browser/OS menentukan bentuk final notification card dan lock-screen privacy.

- Tooling environment memisahkan dua profile yang wajib ada pada setiap workstation tepercaya: `.env.local` Development-only dan `.env.production.local` Production-only. `npm run dev` auto-refresh Development + membuat template Production sekali bila belum ada; `npm run prod` memvalidasi isolasi profile, Turso Production read-only, lalu Vercel Production aktual agar keberhasilan Development tidak dianggap bukti Production.
- Tooling environment juga menyediakan `npm run env:pull:development` dan `npm run env:status` untuk bootstrap/troubleshooting lintas-PC tanpa menyalin secret manual. Checker Production menjaga public Firebase/Google config tetap selaras dan menolak database/token/session/VAPID yang dibagi lintas Dev/Prod; fingerprint Web Push yang ditampilkan bersifat public-only.

## Open operational risks

1. GitHub `main` harus memblok force push/delete dan menjalankan workflow `Quality` pada push. Direct push normal dipertahankan untuk workflow private sederhana; jangan gunakan `--no-verify`.
2. Source sudah memblokir cross-environment database; live Development/Production separation tetap memerlukan evidence dua database/token berbeda sebelum ADR-0007 dapat ditutup.
3. Production schema/runtime parity dan resource Google nyata harus diverifikasi melalui runbook.
4. Real-device Web Push dan restore drill memerlukan evidence operasional bila belum dilakukan.
5. Secret rotation/revocation mengikuti runbook; source tidak dapat membuktikan credential lama sudah dicabut.
6. External operational alerting belum tersedia; health/backup/dead-letter masih memerlukan monitoring operator.
7. Session v2/device revoke sudah tersedia di source; real-device smoke, forced legacy re-login, dan operational revoke drill tetap memerlukan evidence deployment.
8. Retention `notification_queue`, `notification_deliveries`, `integration_outbox`, `backup_runs`, dan `integrity_runs` belum memiliki jadwal purge otomatis; audit/ledger tetap tidak boleh dipurge oleh housekeeping biasa.

# Project Status

Dokumen ini adalah snapshot kondisi project sekarang, bukan jurnal perubahan.

## Runtime canonical

- **Frontend:** React 19 + Vite 7 PWA.
- **Backend:** Vercel Functions.
- **Database/source of truth:** Turso/SQLite HTTP pipeline.
- **Auth desktop dan mobile:** tombol Google branded Saldo Bersama memakai transport yang sama. Pada production canonical `saldo-bersama.vercel.app`, browser memulai Google OAuth Authorization Code flow ke `/api/auth/google/start`; callback server memverifikasi signed `state`/`nonce`, menukar code menjadi Google ID token, menukarnya lagi melalui Firebase Identity Toolkit menjadi Firebase ID token, lalu memakai verifier Firebase + allowlist/role existing sebelum membuat signed HttpOnly server session. Localhost/device emulation mempertahankan Firebase popup sebagai fallback development. Tidak ada Firebase browser redirect state pada production.
- **Session/authorization authority:** signed HttpOnly server session + backend allowlist/role.
- **Google integration:** Apps Script bridge; Sheets mirror satu arah, Calendar reminder bersama, Drive backup teknis.
- **Active schema contract:** v11.
- Runtime lokal dan Vercel Production **masih** memakai database Turso bersama sampai exit criteria ADR-0007 dibuktikan. Target hardening yang disetujui adalah database/token/session secret Development dan Production yang terpisah; source tidak boleh mengklaim cutover selesai tanpa evidence environment.

## Workflow saat ini

- Source terbaru + test aktual adalah sumber kebenaran.
- Tidak ada task card/Task ID/branch automation sebagai workflow wajib.
- Quality gate lokal canonical: `npm run verify`; `npm run zip` menjalankannya otomatis sebelum packaging dan pre-push guard menjalankannya lagi sebelum push. Handoff patch hanya berstatus final setelah gate tree final PASS pada Node 24.18.1; environment non-canonical wajib menyebut artifact candidate/unverified. Setelah setiap verification PASS maupun gagal, generated build/test artifact dan cache Vite generated dibersihkan tanpa menghapus dependency, `.env.local`, `.vercel`, atau Git metadata.
- Setelah PASS: commit pada branch, push branch, buka Pull Request, tunggu workflow **Quality** lulus, lalu merge ke `main`. Ruleset GitHub tetap memerlukan verifikasi operasional.
- `npm run zip` membuat clean source canonical fail-closed.
- Guarded/high-risk tetap membutuhkan approval eksplisit sebelum coding/operation.

## UI foundation / maintainability saat ini

- Shared primitive canonical memakai CSS Modules. Global compatibility class tetap tersedia untuk direct `button`/`Link` legacy, tetapi state disabled dan control height sekarang mengikuti token/semantics yang sama dengan `Button.module.css`; duplicate override `min-height` sudah dihapus.
- Empat stylesheet feature masih transitional sesuai ADR-0009 dan dilacak eksplisit di `UI_DESIGN_SYSTEM.md`: Dashboard, Login, Transactions, dan FinancialAlertList. Migrasinya dilakukan serial, bukan mass-refactor.
- Token `--account-*` tetap global karena perlu theme-level contract, tetapi diberi ownership Accounts-only. `components/finance/` tetap target opsional dan belum dibuat sampai ada reusable consumer lintas feature nyata.
- Named import `react-icons/fi` kini memiliki regression contract yang memverifikasi symbol benar-benar diekspor package, sehingga typo/ikon yang tidak tersedia gagal pada test sebelum mencapai build.
- Route Transaksi dan workspace Perencanaan memakai lazy boundary untuk presentation/dialog berat. Perencanaan memiliki dua tab canonical: Alokasi Dana dan Jadwal Rutin; Kebutuhan dikelola di detail Alokasi Dana, sedangkan Anggaran menjadi overview read-only lintas Kebutuhan. Build budget tetap memberi warning mulai 90% batas agar headroom rendah terlihat sebelum patch berikutnya menjadi failure.
- Tipografi mobile `<=820px` tetap memakai Manrope Variable tetapi dengan density yang lebih ringan: body 14px dan bobot semantic semibold/bold 550/650. Token desktop tetap 16px dan 600/700; perubahan ini presentation-only dan tidak memengaruhi data, saldo, atau accessibility target sentuh.
- Cocokkan Saldo sekarang memiliki feedback lokal canonical: input dikunci selama submit, fase `submitting` dan `syncing` dibedakan, global mutation pill/toast untuk `reconciliations.create` disupresi agar tidak ganda, dan server-success ditampilkan sebagai result overlay. Matched memakai one-shot staggered MoneyRain dengan reduced-motion fallback; difference tidak dirayakan dan tetap menyisakan warning untuk pemeriksaan transaksi.
- Alert `Perlu perhatian` mobile sudah diringkas: instruksi tidak lagi memakai card bersarang “Yang perlu dilakukan”, sementara CTA, severity, target route, dan dashboard state tetap sama. CSS rekonsiliasi legacy yang tidak memiliki consumer serta kolom desktop kosong dari guide panel lama sudah dibersihkan.

## Transaksi mobile saat ini

- `/transaksi` pada viewport ≤820px memakai presentation history-first terpisah dari table/filter desktop. Page tidak mengulang heading body; periode menjadi anchor utama, diikuti grafik arus kas 6 bulan dari `reports.monthly`, metadata pemasukan/pengeluaran, lalu daftar ledger berkelompok tanggal.
- Filter cepat hanya mengekspos jenis umum, Search, dan Filter. Rekening, kategori, pencatat, alokasi, Refund, dan Penyesuaian dipindahkan ke dialog lanjutan. Semua query tetap memakai `transactions.list` canonical dan pagination backend existing.
- Row hanya menampilkan badge exception penting (managed recurring/goal, belum dialokasikan, cancelled). Detail transaksi memuat jenis, kategori, rekening, alokasi, pencatat, tanggal Asia/Jakarta, sumber, status, dan action capability existing.
- Mobile presentation sudah dipisah ke CSS Module `MobileTransactionHistory.module.css`; `TransactionsPage.css` masih transitional untuk desktop table/filter dan detail modal. Backend finance, schema, saldo, authorization, audit, idempotency, serta login tidak berubah oleh redesign ini.


## Beranda mobile dan mutation safety saat ini

- Beranda mobile memakai data canonical `dashboard.overview` untuk saldo, batas aman harian, rekening aktif, arus kas, alert, lima transaksi terbaru, serta ringkasan Alokasi agregat. Shortcut utama tetap fokus pada aksi harian `Pemasukan`, `Pengeluaran`, dan `Transfer`; saat alert tersedia, `Perlu perhatian` diprioritaskan sebelum daftar rekening. Filter/search lengkap sengaja tetap berada di `/transaksi`; recent slice Dashboard tidak dipresentasikan seolah-olah mewakili seluruh ledger. Transfer baru pada viewport mobile memakai presentasi `mobile-transfer` dari `TransactionForm` canonical, bukan form terpisah.
- Ringkasan Alokasi Dana menjumlahkan nominal `used_amount + reserved_amount` sebagai **terpakai + dipesan** dan tidak lagi memilih alokasi pertama berdasarkan urutan nama. Perhitungan saldo/ledger tidak berubah.
- Mutation biasa yang berakhir `OUTCOME_UNKNOWN` mempertahankan idempotency intent di private-memory. Payload berbeda untuk action yang sama diblok sampai intent lama mendapat hasil definitif; form transaksi mengunci field dan menyediakan retry data yang sama. Reset/full reset tetap memakai recovery/status workflow khusus.
- Close/reopen periode serta perubahan anggota menginvalidasi projection yang bergantung, termasuk transaksi/dashboard, agar capability dan label tidak tertahan cache lama.
- Service Worker v10 tetap network-only untuk `/api/*`; stable image memakai stale-while-revalidate sehingga asset publik dapat diperbarui setelah deployment tanpa menunggu cache lama habis.

## Workspace Perencanaan saat ini

- Navigation menampilkan grup `Perencanaan` dengan `Perencanaan`, `Anggaran`, dan `Target`. Workspace Perencanaan memakai dua tab canonical: `Alokasi Dana` (`/perencanaan/kantong`) dan `Jadwal Rutin` (`/perencanaan/jadwal`). `/anggaran` adalah overview read-only Kebutuhan. Route `/alokasi` dan `/tagihan` dipertahankan sebagai compatibility redirect.
- Alokasi Dana tidak meminta kategori. Klik item Alokasi Dana membuka detail dana, Kebutuhan kategori, dan Jadwal Rutin terkait. Kebutuhan tetap memakai record `budgets` dan relasi `budgets.envelope_rule_id` existing. Kategori yang sama dapat dipakai pada beberapa Alokasi Dana karena pencocokan Kebutuhan juga memasukkan `envelope_rule_id`; budget lama tanpa relasi dapat dihubungkan saat kategori tersebut pertama kali dipakai di detail Alokasi Dana. Pemakaian hanya menghitung transaksi kategori yang benar-benar memakai Alokasi Dana tersebut. Tidak ada migration/schema baru.
- Jadwal Rutin tidak lagi mengekspos penanda Auto-debit. Occurrence yang jatuh tempo menunggu konfirmasi transaksi aktual; ledger/saldo tidak berubah sebelum transaksi aktual berhasil disimpan. Bila kategori Kebutuhan memiliki relasi Alokasi Dana yang tidak ambigu, Jadwal dapat menyarankan rekening sumber dan konfirmasi aktual menyarankan Alokasi Dana terkait tanpa mempercayai data client untuk authorization.
- Target, Alokasi Dana, Jadwal Rutin, dan Anggota tetap memakai artwork existing secara dekoratif. Nominal, status, capability, authorization, saldo, serta ledger tetap berasal dari read model/service canonical.
- Alokasi Dana tetap account-bound: item baru wajib satu rekening sumber, read model rekening menyediakan saldo fisik, dana dialokasikan, dan dana tersedia; transaksi beralokasi wajib memakai rekening yang sama, transaksi bebas/Transfer tidak boleh mengambil dana yang sudah dialokasikan, dan realokasi baru lintas rekening ditolak.
- Dana tersedia kini dapat ditambahkan ke Alokasi Dana existing atau dilepas kembali melalui `envelopes.adjustAllocation` tanpa membuat ledger transaction. Member dapat mengelola planning shared sesuai RFC-0016, sedangkan lifecycle destruktif/recovery tetap Administrator-only.
- Dashboard memisahkan dana tersedia yang belum dibagi dari pengeluaran tanpa Alokasi Dana dan menyediakan CTA berbeda. First-run checklist mengarahkan Rekening → Kategori → Alokasi Dana → Target berdasarkan capability actor. Target memberi warning bila belum ada rekening sumber lain yang kompatibel untuk setoran.
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
- Kartu rekening memakai asset WebP 768×484 untuk bank, Tunai, Tabungan, serta provider E-wallet ShopeePay, DANA, GoPay, OVO, dan LinkAja. Provider E-wallet disimpan canonical pada `accounts.ewallet_template` schema v8; nama rekening hanya dipakai sebagai fallback untuk object/backup legacy yang belum memiliki field tersebut. Provider `generic` tetap aman untuk E-wallet lain.


## Notifikasi dan pengingat saat ini

- Tujuh pengingat otomatis existing tetap dijadwalkan server dan memakai dedupe canonical.
- Pengingat manual one-shot tersedia langsung pada Kebutuhan periode aktif, Alokasi Dana aktif, occurrence Jadwal Rutin yang belum selesai, dan Target aktif. Pengingat hanya milik actor, disimpan server-side, memakai `row_version`, idempotency, audit, dan diproses scheduler.
- Push produk memakai privacy-safe lock-screen: copy detail boleh tetap ada di queue server, tetapi transport Web Push hanya membawa tipe/id/target dan Service Worker menampilkan copy generik tanpa nominal, rekening, merchant, atau nama objek finansial. Logo aplikasi tetap dipakai sebagai `icon` dan badge monokrom khusus Android.
- Reminder manual menampilkan `lastDispatch` dari queue, menolak jadwal baru selama dispatch lama masih nonterminal, dan dibatalkan atomik saat entity selesai/ditutup/diarsipkan/dihapus; integrity check memeriksa drift user/entity/queue. UI memberi warning bila Web Push perangkat belum siap tanpa menganggap penyimpanan reminder gagal.
- Real-device Android/iOS/desktop tetap memerlukan QA operasional karena browser/OS menentukan bentuk final notification card dan lock-screen privacy.

## Open operational risks

1. GitHub `main` harus diverifikasi benar-benar memblok direct push dan mewajibkan `Quality`; source/hook lokal saja bukan enforcement server-side.
2. Development/Production Turso masih berbagi database sampai cutover ADR-0007 selesai; jangan mulai data nyata sebelum isolation atau risk acceptance baru.
3. Production schema/runtime parity dan resource Google nyata harus diverifikasi melalui runbook.
4. Real-device Web Push dan restore drill memerlukan evidence operasional bila belum dilakukan.
5. Secret rotation/revocation mengikuti runbook; source tidak dapat membuktikan credential lama sudah dicabut.
6. External operational alerting belum tersedia; health/backup/dead-letter masih memerlukan monitoring operator.
7. Session aplikasi berumur terbatas dan signed, tetapi belum memiliki daftar/revoke session per perangkat; kehilangan perangkat masih ditangani melalui expiry, user deactivation, atau secret rotation sesuai incident severity.
8. Retention `notification_queue`, `notification_deliveries`, `integration_outbox`, `backup_runs`, dan `integrity_runs` belum memiliki jadwal purge otomatis; audit/ledger tetap tidak boleh dipurge oleh housekeeping biasa.

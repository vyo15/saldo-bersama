# Project Status

Dokumen ini adalah snapshot kondisi project sekarang, bukan jurnal perubahan.

## Runtime canonical

- **Frontend:** React 19 + Vite 7 PWA.
- **Backend:** Vercel Functions.
- **Database/source of truth:** Turso/SQLite HTTP pipeline.
- **Auth desktop dan mobile:** tombol Google branded Saldo Bersama memakai transport yang sama. Pada production canonical `saldo-bersama.vercel.app`, browser memulai Google OAuth Authorization Code flow ke `/api/auth/google/start`; callback server memverifikasi signed `state`/`nonce`, menukar code menjadi Google ID token, menukarnya lagi melalui Firebase Identity Toolkit menjadi Firebase ID token, lalu memakai verifier Firebase + allowlist/role existing sebelum membuat signed HttpOnly server session. Localhost/device emulation mempertahankan Firebase popup sebagai fallback development. Tidak ada Firebase browser redirect state pada production.
- **Session/authorization authority:** signed HttpOnly server session + backend allowlist/role.
- **Google integration:** Apps Script bridge; Sheets mirror satu arah, Calendar reminder bersama, Drive backup teknis.
- **Active schema contract:** v10.
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
- Route Transaksi, Alokasi, Anggaran, dan presentation Jadwal Rutin memakai lazy boundary untuk presentation/dialog berat. Build budget kini memberi warning mulai 90% batas agar headroom rendah terlihat sebelum patch berikutnya menjadi failure.

## Transaksi mobile saat ini

- `/transaksi` pada viewport ≤820px memakai presentation history-first terpisah dari table/filter desktop. Page tidak mengulang heading body; periode menjadi anchor utama, diikuti grafik arus kas 6 bulan dari `reports.monthly`, metadata pemasukan/pengeluaran, lalu daftar ledger berkelompok tanggal.
- Filter cepat hanya mengekspos jenis umum, Search, dan Filter. Rekening, kategori, pencatat, alokasi, Refund, dan Penyesuaian dipindahkan ke dialog lanjutan. Semua query tetap memakai `transactions.list` canonical dan pagination backend existing.
- Row hanya menampilkan badge exception penting (managed recurring/goal, belum dialokasikan, cancelled). Detail transaksi memuat jenis, kategori, rekening, alokasi, pencatat, tanggal Asia/Jakarta, sumber, status, dan action capability existing.
- Mobile presentation sudah dipisah ke CSS Module `MobileTransactionHistory.module.css`; `TransactionsPage.css` masih transitional untuk desktop table/filter dan detail modal. Backend finance, schema, saldo, authorization, audit, idempotency, serta login tidak berubah oleh redesign ini.


## Visual summary planning saat ini

- Target, Alokasi, Jadwal rutin, dan Anggota memakai summary hero responsif dengan artwork existing agar kualitas visual konsisten dengan Anggaran tanpa menambah route, request, mutation, atau schema baru.
- Target mengagregasi target aktif dari `goals.list`; Alokasi tetap memakai data `envelopes.list`; Jadwal rutin tetap memakai summary occurrence existing; Anggota hanya merangkum `users.list`. Artwork tidak ikut menentukan nominal, status, capability, atau authorization.
- Dashboard, Transaksi, Laporan, Rekening, Kategori, dan Pengaturan sengaja tidak diberi artwork hero tambahan karena masing-masing sudah memiliki chart, kartu domain, icon taxonomy, atau utility hierarchy sebagai fokus utama.
- Empat ilustrasi reuse path login existing (`piggy-bank`, `wallet`, `finance-checklist`, `house`) dengan semantic dekoratif kosong agar login yang sudah stabil tidak memerlukan perpindahan asset.

## Laporan mobile saat ini

- `/laporan` pada viewport ≤820px memakai hierarchy analitik compact yang terpisah dari workspace desktop, tetapi tetap membaca action canonical `reports.monthly`.
- Mode `Ringkasan` menampilkan tren pengeluaran 3/6/12 bulan, arus kas bersih, total saldo, saldo aman, perbandingan dengan bulan sebelumnya, kategori pengeluaran terbesar, serta seluruh alert actionable.
- Mode `Per kategori` menampilkan distribusi kategori memakai ikon kategori canonical, analisis anggaran vs aktual read-only, dan progressive disclosure untuk breakdown rekening, nature, serta aktivitas pencatatan.
- Navigasi periode mendukung bulan sebelumnya/berikutnya sampai bulan berjalan dan picker bulan native. Perbandingan dihitung dari `trend.items` yang sama, sehingga tidak menambah request, schema, mutation, atau business rule baru.
- Desktop `/laporan` tetap memakai panel analitik existing. Backend, auth, saldo, ledger, authorization, dan contract API tidak berubah oleh redesign mobile ini.
- Route `/laporan` kembali buildable setelah import ikon `FiWallet` yang tidak tersedia pada `react-icons/fi` diganti dengan export Feather yang valid. Regression import-symbol dan production build menjadi guard agar route lazy tidak kembali gagal dibuka karena named export invalid.

## Rekening mobile saat ini

- `MobileAccountsExperience` tetap lazy untuk menjaga route-chunk budget. Capability mobile/desktop divalidasi oleh frontend regression dan pemeriksaan manual pada viewport relevan; browser automation tidak menjadi gate canonical.
- Transfer adalah quick action, bukan tab. Form tetap memakai `TransactionForm` canonical dan sukses hanya ditampilkan setelah server mengonfirmasi write.
- `Riwayat` dan `Grafik` adalah dua tab informasi. Transfer tetap tidak dihitung sebagai pemasukan/pengeluaran.
- Kartu rekening memakai asset WebP 768×484 untuk bank, Tunai, Tabungan, serta provider E-wallet ShopeePay, DANA, GoPay, OVO, dan LinkAja. Provider E-wallet disimpan canonical pada `accounts.ewallet_template` schema v8; nama rekening hanya dipakai sebagai fallback untuk object/backup legacy yang belum memiliki field tersebut. Provider `generic` tetap aman untuk E-wallet lain.


## Notifikasi dan pengingat saat ini

- Tujuh pengingat otomatis existing tetap dijadwalkan server dan memakai dedupe canonical.
- Pengingat manual one-shot tersedia langsung pada Anggaran periode aktif, Kantong/Alokasi aktif, occurrence Jadwal Rutin yang belum selesai, dan Target aktif. Pengingat hanya milik actor, disimpan server-side, memakai `row_version`, idempotency, audit, dan diproses scheduler.
- Push produk memakai mode detail yang disetujui: copy server dapat memuat nama objek dan nominal relevan. Service Worker memakai logo aplikasi sebagai `icon` dan badge monokrom khusus Android. Test Push tetap generik.
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

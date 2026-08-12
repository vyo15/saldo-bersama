# QA Checklist

- [x] Baseline source terbaru untuk patch schema v9 berasal dari clean source setelah asset rekening; patch ini menambah migration canonical dan seluruh perubahan schema/API/frontend/docs diuji sebagai satu unit.
- [ ] Node/npm sesuai engines.
- [ ] `npm run clean:dry-run` ditinjau; tidak ada secret, dump, `.env`, backup, token, dependency, atau generated output dalam clean ZIP.
- [x] Baseline operator 9 Agustus 2026 sebelum patch browser-readiness: `npm run check` PASS, frontend 95/95, backend/tooling 212/212, coverage PASS, build/budget PASS; `npm run test:browser` 9/11 karena dua assertion Rekening berjalan sebelum capability mobile selesai dimuat.
- Archive target, aturan rutin, dan anggaran memakai action eksplisit Administrator-only dengan alasan + `row_version`; generic update tidak dapat dipakai sebagai jalan pintas ke status `archived`.
- [x] Administrator/Member/unauthorized diuji melalui authenticated journey dan private-route browser smoke.
- [ ] Seluruh nominal integer dan timezone Asia/Jakarta.
- [x] Transfer tidak masuk income/expense.
- [x] Soft cancel, audit, idempotency, dan row-version conflict lulus.
- [x] Guarded mutation coordinator meng-coalesce request identik, mempertahankan same-intent idempotency key saat outcome network tidak pasti hanya di private-memory, tidak memakai `localStorage`/`sessionStorage`, dan ConfirmationModal memiliki synchronous submit lock.
- [x] External action mereservasi idempotency sebelum side effect; concurrent same-key, payload conflict, outcome unknown non-resumable, durable same-key resume, dan preservation reservation `restore.apply` memiliki regression test.
- [x] `import.preview`/`restore.preview` tidak lagi diklasifikasikan sebagai pure read; frontend/backend read-action map dikunci agar tidak drift.
- [x] Rekening personal pasangan mengikuti transparency policy: readable dengan label pemilik, tetapi write capability/edit/arsip/transaksi/rekonsiliasi yang tidak diizinkan tetap ditolak frontend dan backend.
- [x] Sheets canonical tetap satu arah `Turso -> Sheets`; full sync nyata sudah `completed` dan tab mirror dedicated terbentuk. Verifikasi final sesudah hardening tetap perlu untuk metadata/Sheet1.
- [ ] Calendar resource nyata diverifikasi hanya data shared. Source/test sudah mengunci recurring shared, ScriptLock, dan self-heal duplicate managed event.
- [x] Excel netral terhadap formula injection.
- [ ] Backup checksum dan restore drill pada salinan terisolasi sementara lulus.
- [x] Offline write ditolak.
- [ ] PWA iOS/Android, push, safe area, focus, contrast, tap target diuji.
- [x] Route 404 mobile mengisi inner content box setelah padding/safe-area canonical; regression tidak menghitung reserved `--mobile-navigation-content-gap` sebagai gap layout yang salah.
- [x] Status backend Pengaturan memakai kontrak `system.health` aktual dan tidak menampilkan `Degraded` palsu.
- [ ] Schema v9, backup pra-migration, integrity check, pasangan VAPID, redeploy Production, serta satu Apps Script trigger diverifikasi.
- [ ] Desktop dan Android lulus Aktifkan → verifikasi otomatis → Nonaktifkan; iPhone/iPad diuji dari aplikasi Home Screen.
- [x] Monitoring health/integration queue tidak membocorkan secret.
- [x] `npm run env:check` dan regression environment menolak Development local testing bila Web Push hilang, parsial, invalid, atau pasangan key tidak cocok.
- [x] `npm run env:push:development:settings` hanya menyentuh Web Push dan Google bridge yang aktif; Turso, allowlist, Firebase, dan session tidak ikut berubah.
- [ ] Setelah settings disinkronkan ke Vercel Development, laptop/PC tepercaya lain cukup menjalankan `npm run dev` dan menerima konfigurasi terbaru tanpa copy/edit `.env.local`.
- [x] Google bridge tetap fail-closed/opsional terhadap fitur Turso; bila bridge tidak tersedia, Integrasi/backup/restore external belum siap tanpa memblokir read/write Turso yang tidak bergantung bridge.
- [x] `/pengaturan/integrasi` tidak menampilkan `Siap` hanya karena env/property tersedia; signed `integration.health` memverifikasi akses nyata Spreadsheet/Calendar/Drive, konfigurasi Jobs, dan trigger.
- [x] Queue Integrasi Google memisahkan `pending`, `processing`, `failed`, `dead_letter`, dan `completed`; successful full snapshot menyupersede failure historis untuk status aktif tanpa menghapus row histori.
- [x] Waktu sukses terakhir berasal dari `completed_at`; kegagalan yang lebih baru tidak mengganti label keberhasilan terakhir.
- [x] Health response ke browser tidak memuat shared secret, Spreadsheet/Calendar/Drive ID, endpoint scheduler internal, atau payload finansial.
- [x] Signed `integration.health` operator melaporkan Mirror/Calendar/Backup/Jobs/Trigger `SIAP`, dan Production `/api/jobs` sudah HTTP 200 dengan HMAC scheduler.
- [x] Validator Drive backup menerima nama canonical versioned mengikuti schema aktif dan regression menolak format malformed; `BACKUP_NAME_INVALID` akibat hardcode v3 tidak kembali.
- [x] Mirror target guard menolak spreadsheet non-kosong tanpa metadata canonical dan hanya membersihkan `Sheet1` default bila kosong.
- [ ] Verifikasi final resource nyata setelah hardening: `_Mirror_Metadata.schema_version=9`, `Sheet1` kosong hilang, event Calendar hanya shared tanpa duplikasi, file Drive backup versioned v9 ada, dan queue tidak memiliki failure aktif setelah full sync.

- [x] Action registry/policy, authorization map, dan API docs tetap sinkron.
- [ ] Full axe/visual regression dijalankan bila perubahan UI kompleks atau dependency tersedia.

- [ ] Modal Tambah Transaksi, Kategori, Rekening, Import, Restore, dan Tutup Periode tidak memiliki nested horizontal overflow pada 320–430px; scroll vertikal tetap bekerja.
- [x] Filter Transaksi dan kelompok ikon Kategori membungkus tanpa swipe horizontal; carousel rekening tetap menjadi pengecualian yang disengaja.
- [x] Kategori Uang masuk/Refund memakai nature internal yang kompatibel, sifat pengeluaran tidak ditampilkan, dan kategori `savings` baru ditolak backend.
- [ ] Transfer BNI/BCA ke BTN tidak masuk income/expense; jadwal auto-debit tidak mengubah saldo sampai transaksi aktual tersimpan satu kali.
- [x] Route internal Pengaturan hanya memuat resource terkait; member dapat membuka Notifikasi/Integrasi status dan ditolak pada deep link Administrator-only.

## Maintainability dan artifact hygiene

- [x] `npm-audit-*.json` diperlakukan sebagai diagnostic lokal: di-ignore Git/validator dan fail-closed agar tidak pernah masuk clean ZIP.
- [x] Serializer canonical dipakai bersama oleh cache key dan mutation fingerprint; property ordering tidak menghasilkan identitas berbeda.
- [x] Version stamp backend diekstrak hanya untuk metadata update yang identik; guard ownership, transition domain, dan optimistic row-version tetap eksplisit.
- [x] Feedback transient sukses memakai provider canonical pada flow harian; error/conflict/maintenance/backup/restore/status kritis tetap persisten.
- [x] jscpd tersedia sebagai report non-blocking; tidak ada threshold persentase yang memaksa refactor SQL/CSS deklaratif.
- [x] Queue recurring occurrence memakai entity identity konsisten untuk skip/restore/pay/reverse: Calendar occurrence-id, mirror rule-id.

## Product-control alignment

- [x] Filter transaksi rekening/kategori/pencatat diuji untuk Administrator dan Member.
- [x] Tren laporan 3/6/12 bulan serta breakdown rekening/kategori/nature/pencatat tervalidasi oleh regression suite.
- [ ] Label pencatat tidak disalahartikan sebagai kontribusi atau penanggung biaya.
- [x] Peringatan anggaran, kantong, recurring, target, transaksi tanpa alokasi, dan rekonsiliasi diuji; alert anggaran membuka `/anggaran`.
- [x] Proyeksi target tidak membagi dengan nol dan menangani tanpa tanggal, lewat jatuh tempo, serta target selesai.
- [x] Notification dedupe mencegah antrean ganda pada job retry.
- [x] Recurring expense H-2 dengan saldo rekening default di bawah sisa kewajiban mengantre alert privacy-safe; occurrence paid mengantre completion notification tanpa nama/nominal/rekening di payload.
- [x] Administrator dapat melewati satu recurring occurrence tanpa ledger/saldo change dan memulihkannya; cancelled tidak dibayar, tidak nag dashboard/Push/Calendar, tidak hilang saat rule diarsipkan, dan tetap diaudit.
- [x] Administrator/Member dapat mengatur tujuh tipe notifikasi miliknya sendiri; default tanpa row tetap aktif, stale row_version ditolak, dan mute satu user tidak mematikan alert pasangan.
- [x] Micro-feedback global hanya untuk success/info/warning dan tidak menyediakan generic hard undo; reversal finansial tetap action audited.
- [x] Semua `REQ-*` terlacak pada implementation matrix.
- [x] Migration v7 notification preference tetap additive dan dibackup/restored. Migration v8 `ewallet_template` juga additive, memiliki backup/restore compatibility v3-v7, dan rollback melalui backup pra-migration; perubahan schema berikutnya tetap memerlukan approval terpisah.

## Rekening, kategori, dan responsive parity

- [x] `/anggaran` dapat dibuka Administrator dan Member; hanya Administrator pada periode aktif memiliki form edit/arsip.
- [x] `/laporan` tidak memuat mutation anggaran dan hanya menampilkan Anggaran vs aktual.
- [ ] Menu Lainnya mengelompokkan Perencanaan, Data keuangan, Kontrol saldo, dan Aplikasi; Rekonsiliasi tidak bercampur dengan Rekening/Kategori.
- [x] Rekening mobile memakai quick action `Transfer` terpisah dari tab `Riwayat`/`Grafik`; business flow transfer tetap memakai form canonical dan saldo disegarkan setelah server mengonfirmasi write.
- [x] Scrollbar mobile tidak terlihat, scroll vertikal tetap bekerja, input tidak auto-zoom, dan zoom manual tidak diblokir.
- [ ] Dropdown rekening transaksi menampilkan provider/jenis dan nama pemilik untuk rekening personal agar dua rekening bernama sama tetap dapat dibedakan; rekening Bersama tidak mendapat suffix pemilik.
- [ ] Administrator dan Member dapat mengelola subscription notifikasi perangkat masing-masing.
- [x] `/rekening` hanya memuat rekening; `/kategori` hanya memuat kategori. Kegagalan kategori tidak memblokir rekening.
- [x] Administrator dan Member melihat rekening personal pasangan dengan label `Pribadi · <nama pemilik>`.
- [x] Member dapat membuka `Lihat transaksi` untuk ledger rekening personal pasangan yang readable, tetapi tidak memperoleh aksi edit/arsip rekening, create/update/cancel transaksi, atau rekonsiliasi pada scope tersebut; request write manual juga ditolak backend, termasuk transaksi legacy yang pernah dibuat member.
- [ ] `totalBalance` mencakup semua rekening readable, tetapi `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` tidak memasukkan rekening personal pasangan yang read-only.
- [ ] Label pemilik konsisten pada daftar/filter transaksi, breakdown laporan, riwayat rekonsiliasi, serta alert rekening.
- [ ] Administrator dapat memilih pemilik rekening personal; fallback saat daftar user gagal tidak mengubah ownership secara diam-diam.
- [ ] Administrator dapat membuat kantong dengan **Jatah untuk Bersama / Administrator / Member**; pilihan disimpan sebagai `assignee_user_id` dan tidak mengubah ownership ledger rekening sumber.
- [ ] Member hanya dapat memakai/memindahkan Jatah Bersama atau jatah miliknya sendiri; backend menolak jatah pengguna lain walaupun payload dimanipulasi.
- [ ] Rekening personal memaksa jatah ke pemilik rekening; rekening shared/gabungan boleh memilih penerima aktif.
- [ ] Kartu rekening menampilkan nomor rekening rata kiri dengan jarak kelompok proporsional pada mobile dan desktop.
- [ ] Notifikasi ambang Alokasi dengan penerima spesifik hanya dikirim kepada penerima jatah; Jatah Bersama tetap mengikuti penerima notifikasi shared.
- [ ] Pengguna tidak dapat dinonaktifkan selama masih memiliki rekening personal, planning personal, Budget personal, atau menjadi penerima jatah aktif.

- [ ] Kategori refund dapat dibuat, dan kegagalan reload domain/refresh dashboard setelah respons mutation sukses hanya menghasilkan refresh warning, bukan error mutation semu.
- [ ] Semua asset kartu BCA/BNI/BTN/Mandiri/Permata memakai rasio 1.586:1 dan ukuran container identik.
- [ ] Stack rekening mobile menampilkan 1 kartu untuk 1 rekening, 2 kartu untuk 2 rekening, dan maksimal 3 kartu untuk 3+ rekening tanpa wrapper berbeda ukuran.
- [ ] Swipe vertikal pada kartu aktif menggerakkan seluruh stack secara kontinu, menyelesaikan satu perpindahan per gesture, dan kembali saat threshold tidak tercapai. Gesture horizontal tidak mengganti rekening, area kosong stack tetap menggulir halaman, wheel tidak mengubah rekening, serta Arrow Up/Down bekerja tanpa auto-rotate.
- [x] Browser regression `Pembayaran keluar` memilih rekening fixture secara eksplisit, menetapkan periode deterministik, menunggu resource selesai dimuat, dan fixture `transactions.list` menghormati filter `period` serta `account_id` seperti backend canonical.
- [x] Browser regression Rekonsiliasi memverifikasi tujuan proses, input saldo aktual, saldo sistem, guard selisih audit, dan panduan pemeriksaan saat ada selisih; test tidak diikat ke copy singkat konfigurasi navigasi.
- [x] Flyout Perencanaan desktop menyediakan href canonical `/anggaran`, `/alokasi`, `/tagihan`, dan `/target`; capability route diuji melalui destination, bukan copy heading halaman.
- [x] Assertion geometry untuk flyout/drawer yang memiliki entrance animation menunggu Web Animations API selesai (`running`/`pending` tidak tersisa) sebelum membaca `getBoundingClientRect()`.
- [ ] `prefers-reduced-motion` mengurangi rotasi/durasi, focus-visible tetap jelas, dan live region hanya mengumumkan nama rekening aktif.
- [ ] Detail rekening sticky cukup besar pada desktop dan menjadi overlay/fullscreen dengan focus trap, Escape, body scroll lock, serta focus restoration pada tablet/mobile.
- [ ] Nomor rekening lebih dari 16 digit tidak overflow pada muka kartu; nomor lengkap tetap tersedia di detail dan clipboard.
- [ ] Pada 390px, `Tagihan periode ini`, `Penerimaan yang diharapkan`, halaman Anggaran, seluruh chart laporan, serta route Pengaturan Notifikasi/Integrasi/Member/Export/Backup/Pemulihan/Audit memiliki bounding rect nonzero.
- [ ] Pada ≤580px, action terakhir `.settings-card` menempati `grid-column: 1 / -1`.
- [x] Breakpoint 820/821/940/941 tidak menghasilkan capability hilang; breakpoint 580/581 tetap harus diverifikasi terpisah bila area terkait berubah.
- [x] Ikon navigasi sesuai fungsi dan menu mobile tidak bergantung pada indeks array.
- [ ] Sidebar desktop tetap memakai mask melengkung, target sentuh minimal 44px, dan tidak menutup konten pada 821/940/1440px.
- [x] Submenu desktop satu tingkat, dapat ditutup melalui trigger/Escape/click-outside, dan tidak memakai kartu di dalam kartu.
- [x] Menu mobile tidak menduplikasi dark/light toggle; logout tetap tersedia pada footer dan theme toggle shell di luar menu tetap dapat dijangkau.
- [ ] Input dialog tambah rekening mempertahankan fokus selama beberapa ketikan; Tab trap, Escape, body lock, serta focus restoration setelah dialog ditutup tetap lulus.
- [x] Mengganti template kartu bank atau provider E-wallet tidak mengubah nama rekening; create/update/list/backup/restore mempertahankan `bank_template` dan `ewallet_template` canonical.
- [x] Backend menolak perubahan `account_type` pada `accounts.update`; jenis rekening hanya ditetapkan saat create dan form edit tidak menjadi satu-satunya guard.

## Guard mutation otomatis terbaru

- [x] Frontend API test membuktikan mutation identik concurrent menghasilkan satu request dan retry setelah network putus memakai idempotency key yang sama.
- [x] High-risk create Goal/Jadwal/Kantong memakai `useGuardedMutation` dan loading state; direct `createIdempotencyKey()` dibatasi ke TransactionForm yang memang mempertahankan intent lokal.
- [x] Kantong duplikat dapat diarsipkan/dipulihkan dan realokasi salah dapat dibalik satu kali tanpa hard delete/audit loss. Target, Jadwal rutin, dan Anggaran arsip juga dapat dipulihkan owner dengan reason + `row_version` + dependency/conflict guard.
- [x] Rekonsiliasi menerima saldo aktual negatif hanya untuk rekening dengan `allow_negative=true`.
- [x] Browser regression baru mensimulasikan double-click create target pada response lambat dan menuntut satu mutation request; Device Notification/browser subscription juga memakai synchronous mutation guard.
- [x] Browser harness dapat menunggu selector capability setelah heading route stabil; journey Rekening Administrator/Member memakai readiness stack mobile agar lazy rendering tidak menghasilkan assertion merah palsu.
- [x] `integrity.run` sekarang mengikuti idempotency write canonical; double-submit/retry tidak membuat integrity execution baru secara diam-diam.
- [x] Governance test membandingkan action mode, kewajiban idempotency, dan permission Administrator/Member pada docs dengan policy/source canonical.
- [ ] Jalankan full `npm run check`, `npm run test:guard`, `npm run test:browser`, dan `npm run zip` pada Node 24.x setelah patch diterapkan di laptop operator.
- [x] Baseline operator `npm run test:coverage:backend` memenuhi gate: 84,98% lines / 62,95% branches / 82,33% functions.

## Proteksi human error dan penghapusan

- [ ] Administrator melihat preview saldo dan dependency sebelum arsip/hapus rekening atau kategori.
- [x] Rekening saldo awal/saat ini Rp0 yang belum pernah dipakai dapat dihapus hanya setelah alasan, acknowledgement, exact phrase, countdown, `row_version`, dan idempotency.
- [x] Satu transaksi cancelled, rekonsiliasi, kantong, tagihan, target, atau saldo nonzero membuat hard delete rekening ditolak.
- [x] Rekening yang pernah dipakai hanya dapat diarsipkan; generic purge tidak tersedia.
- [x] Audit delete-unused tetap ada dan nomor rekening tersimpan dalam bentuk masked.
- [x] Rekening/kategori arsip dapat dipulihkan per item; duplicate dan stale version ditolak.
- [x] Transaksi cancelled dapat dipulihkan owner hanya bila unlinked, periode terbuka, referensi aktif, dan balance guard lulus.
- [x] Reaktivasi member eksplisit memverifikasi allowlist; self-deactivate dan last-owner guard tetap lulus.
- [x] Tutup periode menampilkan impact preview dan memerlukan frasa konfirmasi persis.
- [x] Tombol destructive mobile berlabel jelas, fokus awal aman, Enter tidak melakukan submit typed confirmation, dan UI menunggu respons server.
- [ ] Konflik antarperangkat tidak menimpa data dan meminta refresh.

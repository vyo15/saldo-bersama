# QA Checklist

- [ ] Source terbaru dan migration version diverifikasi.
- [ ] Node/npm sesuai engines.
- [ ] `npm run clean:dry-run` ditinjau; tidak ada secret, dump, `.env`, backup, token, dependency, atau generated output dalam clean ZIP.
- [ ] Build, build budget, lint, frontend test, backend test, dan browser smoke lulus.
- [ ] Owner/member/unauthorized diuji.
- [ ] Seluruh nominal integer dan timezone Asia/Jakarta.
- [ ] Transfer tidak masuk income/expense.
- [ ] Soft cancel, audit, idempotency, dan row-version conflict lulus.
- [ ] Personal account tidak bocor ke member lain.
- [ ] Sheets hanya mirror satu arah dan view-only.
- [ ] Calendar hanya data shared.
- [ ] Excel netral terhadap formula injection.
- [ ] Backup checksum dan restore drill pada salinan terisolasi sementara lulus.
- [ ] Offline write ditolak.
- [ ] PWA iOS/Android, push, safe area, focus, contrast, tap target diuji.
- [ ] Route 404 mobile mengisi inner content box setelah padding/safe-area canonical; regression tidak boleh menghitung reserved `--mobile-navigation-content-gap` sebagai gap layout yang salah.
- [ ] Status backend Pengaturan memakai kontrak `system.health` aktual dan tidak menampilkan `Degraded` palsu.
- [ ] Schema v6, backup pra-migration, integrity check, pasangan VAPID, redeploy Production, serta satu Apps Script trigger diverifikasi.
- [ ] Desktop dan Android lulus Aktifkan → verifikasi otomatis → Nonaktifkan; iPhone/iPad diuji dari aplikasi Home Screen.
- [ ] Monitoring health/integration queue tidak membocorkan secret.
- [ ] `npm run env:check` menolak Development local testing bila Web Push hilang, parsial, invalid, atau pasangan key tidak cocok.
- [ ] `npm run env:push:development:settings` hanya menyentuh Web Push dan Google bridge yang aktif; Turso, allowlist, Firebase, dan session tidak ikut berubah.
- [ ] Setelah settings disinkronkan ke Vercel Development, laptop/PC tepercaya lain cukup menjalankan `npm run dev` dan menerima konfigurasi terbaru tanpa copy/edit `.env.local`.
- [ ] Google bridge tetap opsional; bila dinonaktifkan, Integrasi/backup/restore external menampilkan status belum siap tanpa memblokir fitur Turso lain.
- [ ] `/pengaturan/integrasi` tidak menampilkan `Siap` hanya karena bridge env tersedia; signed `integration.health` harus memverifikasi resource provider, scheduled jobs, dan satu trigger untuk Sheets/Calendar.
- [ ] Queue Integrasi Google menampilkan `pending`, `processing`, `failed`, `dead_letter`, dan `completed` secara terpisah; kegagalan tidak dihitung sebagai antrean biasa.
- [ ] Waktu sukses terakhir berasal dari `completed_at`; kegagalan yang lebih baru tidak boleh mengganti label keberhasilan terakhir.
- [ ] Health response ke browser tidak memuat shared secret, Spreadsheet/Calendar/Drive ID, endpoint scheduler internal, atau payload finansial.

- [ ] Action registry/policy, authorization map, dan API docs tetap sinkron.
- [ ] Full axe/visual regression dijalankan bila perubahan UI kompleks atau dependency tersedia.

- [ ] Modal Tambah Transaksi, Kategori, Rekening, Import, Restore, dan Tutup Periode tidak memiliki nested horizontal overflow pada 320–430px; scroll vertikal tetap bekerja.
- [ ] Filter Transaksi dan kelompok ikon Kategori membungkus tanpa swipe horizontal; carousel rekening tetap menjadi pengecualian yang disengaja.
- [ ] Kategori Uang masuk/Refund memakai nature internal yang kompatibel, sifat pengeluaran tidak ditampilkan, dan kategori `savings` baru ditolak backend.
- [ ] Transfer BNI/BCA ke BTN tidak masuk income/expense; jadwal auto-debit tidak mengubah saldo sampai transaksi aktual tersimpan satu kali.
- [ ] Route internal Pengaturan hanya memuat resource terkait; member dapat membuka Notifikasi/Integrasi status dan ditolak pada deep link owner-only.

## Product-control alignment

- [ ] Filter transaksi rekening/kategori/pencatat diuji untuk owner dan member.
- [ ] Tren laporan 3/6/12 bulan serta breakdown rekening/kategori/nature/pencatat tervalidasi.
- [ ] Label pencatat tidak disalahartikan sebagai kontribusi atau penanggung biaya.
- [ ] Peringatan anggaran, kantong, recurring, target, transaksi tanpa alokasi, dan rekonsiliasi diuji; alert anggaran membuka `/anggaran`.
- [ ] Proyeksi target tidak membagi dengan nol dan menangani tanpa tanggal, lewat jatuh tempo, serta target selesai.
- [ ] Notification dedupe mencegah antrean ganda pada job retry.
- [ ] Semua `REQ-*` terlacak pada implementation matrix.
- [ ] Perubahan schema setelah v6 hanya dilakukan melalui RFC/approval terpisah, backup terverifikasi, migration, integrity check, dan rollback plan.

## Rekening, kategori, dan responsive parity

- [ ] `/anggaran` dapat dibuka owner dan member; hanya owner pada periode aktif memiliki form edit/arsip.
- [ ] `/laporan` tidak memuat mutation anggaran dan hanya menampilkan Anggaran vs aktual.
- [ ] Menu Lainnya mengelompokkan Perencanaan, Data keuangan, Kontrol saldo, dan Aplikasi; Rekonsiliasi tidak bercampur dengan Rekening/Kategori.
- [ ] Kartu generic flat; ringkasan dan quick action Rekening menyatu dengan background.
- [ ] Scrollbar mobile tidak terlihat, scroll vertikal tetap bekerja, input tidak auto-zoom, dan zoom manual tidak diblokir.
- [ ] Dropdown rekening transaksi menampilkan provider/jenis dan nama tanpa suffix kepemilikan.
- [ ] Owner dan member dapat mengelola subscription notifikasi perangkat masing-masing.
- [ ] `/rekening` hanya memuat rekening; `/kategori` hanya memuat kategori. Kegagalan kategori tidak memblokir rekening.
- [ ] Owner dan member melihat rekening personal pasangan dengan label `Pribadi · <nama pemilik>`.
- [ ] Member dapat membuka `Lihat transaksi` untuk ledger rekening personal pasangan yang readable, tetapi tidak memperoleh aksi edit/arsip rekening, create/update/cancel transaksi, atau rekonsiliasi pada scope tersebut; request write manual juga ditolak backend, termasuk transaksi legacy yang pernah dibuat member.
- [ ] `totalBalance` mencakup semua rekening readable, tetapi `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` tidak memasukkan rekening personal pasangan yang read-only.
- [ ] Label pemilik konsisten pada daftar/filter transaksi, breakdown laporan, riwayat rekonsiliasi, serta alert rekening.
- [ ] Owner dapat memilih pemilik rekening personal; fallback saat daftar user gagal tidak mengubah ownership secara diam-diam.
- [ ] Kategori refund dapat dibuat, dan kegagalan reload domain/refresh dashboard setelah respons mutation sukses hanya menghasilkan refresh warning, bukan error mutation semu.
- [ ] Semua asset kartu BCA/BNI/BTN/Mandiri/Permata memakai rasio 1.586:1 dan ukuran container identik.
- [ ] Stack rekening mobile menampilkan 1 kartu untuk 1 rekening, 2 kartu untuk 2 rekening, dan maksimal 3 kartu untuk 3+ rekening tanpa wrapper berbeda ukuran.
- [ ] Swipe vertikal pada kartu aktif menggerakkan seluruh stack secara kontinu, menyelesaikan satu perpindahan per gesture, dan kembali saat threshold tidak tercapai. Gesture horizontal tidak mengganti rekening, area kosong stack tetap menggulir halaman, wheel tidak mengubah rekening, serta Arrow Up/Down bekerja tanpa auto-rotate.
- [ ] Browser regression `Pembayaran keluar` memilih rekening fixture secara eksplisit, menetapkan periode deterministik, menunggu resource selesai dimuat, dan fixture `transactions.list` menghormati filter `period` serta `account_id` seperti backend canonical.
- [ ] Browser regression Rekonsiliasi memverifikasi tujuan proses, input saldo aktual, saldo sistem, guard selisih audit, dan panduan pemeriksaan saat ada selisih; jangan mengikat test ke copy singkat konfigurasi navigasi.
- [ ] Flyout Perencanaan desktop menyediakan href canonical `/anggaran`, `/alokasi`, `/tagihan`, dan `/target`; capability route diuji melalui destination, bukan copy heading halaman.
- [ ] Assertion geometry untuk flyout/drawer yang memiliki entrance animation menunggu Web Animations API selesai (`running`/`pending` tidak tersisa) sebelum membaca `getBoundingClientRect()`.
- [ ] `prefers-reduced-motion` mengurangi rotasi/durasi, focus-visible tetap jelas, dan live region hanya mengumumkan nama rekening aktif.
- [ ] Detail rekening sticky cukup besar pada desktop dan menjadi overlay/fullscreen dengan focus trap, Escape, body scroll lock, serta focus restoration pada tablet/mobile.
- [ ] Nomor rekening lebih dari 16 digit tidak overflow pada muka kartu; nomor lengkap tetap tersedia di detail dan clipboard.
- [ ] Pada 390px, `Tagihan periode ini`, `Penerimaan yang diharapkan`, halaman Anggaran, seluruh chart laporan, serta route Pengaturan Notifikasi/Integrasi/Anggota/Export/Backup/Pemulihan/Audit memiliki bounding rect nonzero.
- [ ] Pada ≤580px, action terakhir `.settings-card` menempati `grid-column: 1 / -1`.
- [ ] Breakpoint 580/581, 820/821, 940/941 tidak menghasilkan overflow atau capability hilang.
- [ ] Ikon navigasi sesuai fungsi dan menu mobile tidak bergantung pada indeks array.
- [ ] Sidebar desktop tetap memakai mask melengkung, target sentuh minimal 44px, dan tidak menutup konten pada 821/940/1440px.
- [ ] Submenu desktop satu tingkat, dapat ditutup dengan tombol/Escape/click-outside, dan tidak memakai kartu di dalam kartu.
- [ ] Menu mobile tidak menduplikasi dark/light toggle; logout tetap tersedia pada footer dan theme toggle shell di luar menu tetap dapat dijangkau.
- [ ] Input dialog tambah rekening mempertahankan fokus selama beberapa ketikan; Tab trap, Escape, body lock, serta focus restoration setelah dialog ditutup tetap lulus.
- [ ] Mengganti template kartu tidak mengubah nama rekening; create/update/list/backup/restore mempertahankan `bank_template` canonical.

## Proteksi human error dan penghapusan

- [ ] Owner melihat preview saldo dan dependency sebelum arsip/hapus rekening atau kategori.
- [ ] Rekening saldo awal/saat ini Rp0 yang belum pernah dipakai dapat dihapus hanya setelah alasan, acknowledgement, exact phrase, countdown, `row_version`, dan idempotency.
- [ ] Satu transaksi cancelled, rekonsiliasi, kantong, tagihan, target, atau saldo nonzero membuat hard delete rekening ditolak.
- [ ] Rekening yang pernah dipakai hanya dapat diarsipkan; generic purge tidak tersedia.
- [ ] Audit delete-unused tetap ada dan nomor rekening tersimpan dalam bentuk masked.
- [ ] Rekening/kategori arsip dapat dipulihkan per item; duplicate dan stale version ditolak.
- [ ] Transaksi cancelled dapat dipulihkan owner hanya bila unlinked, periode terbuka, referensi aktif, dan balance guard lulus.
- [ ] Reaktivasi anggota eksplisit memverifikasi allowlist; self-deactivate dan last-owner guard tetap lulus.
- [ ] Tutup periode menampilkan impact preview dan memerlukan frasa konfirmasi persis.
- [ ] Tombol destructive mobile berlabel jelas, fokus awal aman, Enter tidak melakukan submit typed confirmation, dan UI menunggu respons server.
- [ ] Konflik antarperangkat tidak menimpa data dan meminta refresh.

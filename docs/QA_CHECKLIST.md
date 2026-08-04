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
- [ ] Monitoring health/integration queue tidak membocorkan secret.

- [ ] Action registry/policy, authorization map, dan API docs tetap sinkron.
- [ ] Full axe/visual regression dijalankan bila perubahan UI kompleks atau dependency tersedia.

## Product-control alignment

- [ ] Filter transaksi rekening/kategori/pencatat diuji untuk owner dan member.
- [ ] Tren laporan 3/6/12 bulan serta breakdown rekening/kategori/nature/pencatat tervalidasi.
- [ ] Label pencatat tidak disalahartikan sebagai kontribusi atau penanggung biaya.
- [ ] Peringatan budget, kantong, recurring, target, transaksi tanpa alokasi, dan rekonsiliasi diuji.
- [ ] Proyeksi target tidak membagi dengan nol dan menangani tanpa tanggal, lewat jatuh tempo, serta target selesai.
- [ ] Notification dedupe mencegah antrean ganda pada job retry.
- [ ] Semua `REQ-*` terlacak pada implementation matrix.
- [ ] Fitur yang membutuhkan schema hanya memiliki RFC Proposed dan belum mengubah schema v5 tanpa approval terpisah.

## Rekening, kategori, dan responsive parity

- [ ] `/rekening` hanya memuat rekening; `/kategori` hanya memuat kategori. Kegagalan kategori tidak memblokir rekening.
- [ ] Owner dan member melihat rekening personal pasangan dengan label `Pribadi · <nama pemilik>`.
- [ ] Member tidak memperoleh tombol transaksi/rekonsiliasi/edit/archive pada rekening personal pasangan; request manual juga ditolak backend, termasuk transaksi legacy yang pernah dibuat member.
- [ ] `totalBalance` mencakup semua rekening readable, tetapi `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` tidak memasukkan rekening personal pasangan yang read-only.
- [ ] Label pemilik konsisten pada daftar/filter transaksi, breakdown laporan, riwayat rekonsiliasi, serta alert rekening.
- [ ] Owner dapat memilih pemilik rekening personal; fallback saat daftar user gagal tidak mengubah ownership secara diam-diam.
- [ ] Kategori refund dapat dibuat, dan kegagalan reload domain/refresh dashboard setelah respons mutation sukses hanya menghasilkan refresh warning, bukan error mutation semu.
- [ ] Semua asset kartu BCA/BNI/BTN/Mandiri/Permata memakai rasio 1.586:1 dan ukuran container identik.
- [ ] Stack rekening mobile menampilkan 1 kartu untuk 1 rekening, 2 kartu untuk 2 rekening, dan maksimal 3 kartu untuk 3+ rekening tanpa wrapper berbeda ukuran.
- [ ] Swipe vertikal menggerakkan seluruh stack secara kontinu, menyelesaikan satu perpindahan per gesture, kembali saat threshold tidak tercapai, serta mendukung wheel/Arrow key tanpa auto-rotate.
- [ ] `prefers-reduced-motion` mengurangi rotasi/durasi, focus-visible tetap jelas, dan live region hanya mengumumkan nama rekening aktif.
- [ ] Detail rekening sticky cukup besar pada desktop dan menjadi overlay/fullscreen dengan focus trap, Escape, body scroll lock, serta focus restoration pada tablet/mobile.
- [ ] Nomor rekening lebih dari 16 digit tidak overflow pada muka kartu; nomor lengkap tetap tersedia di detail dan clipboard.
- [ ] Pada 390px, `Tagihan periode ini`, `Penerimaan yang diharapkan`, seluruh chart laporan, Anggota/Integrasi, serta admin owner Export/Backup/Restore/Audit memiliki bounding rect nonzero.
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

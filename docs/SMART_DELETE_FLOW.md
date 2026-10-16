# Smart Delete: penghapusan aman dari tampilan (Candidate 2026-10-15)

> **Status: Candidate / belum lulus quality gate penuh**. Ini menjelaskan perilaku yang ditambahkan pada patch Smart Delete pertama. Bukan klaim bahwa seluruh 46 kategori data sudah memiliki aksi hapus.

## Hotfix 2026-10-16 — Alokasi Dana dan Kebutuhan (fix jalur hapus)

- **Alokasi Dana**: aksi `Hapus dari daftar` di menu tiga titik kini langsung memanggil `openRuleLifecycle` → `envelopes.previewRuleLifecycle` → `ConfirmationModal` → `envelopes.deleteUnusedRule` atau `envelopes.archiveRule`. Modal aksi antara sebelumnya dihilangkan karena tidak dapat dirender ketika detail Alokasi terbuka. Setelah berhasil, query parameter detail Alokasi dibersihkan dan data diperbarui. Alasan tindakan tetap wajib.
- **Kebutuhan**: menu tiga titik pada setiap baris Kebutuhan dengan `can_manage` valid menampilkan `Hapus dari daftar` langsung, bukan tersembunyi di form Edit. Menggunakan kontrak `budgets.previewLifecycle` + `budgets.remove`, termasuk pengembalian dana yang boleh dilepas dan histori tetap tersedia. Pengguna tanpa izin melihat rincian tetapi tidak mendapatkan aksi finansial yang tidak diizinkan.
- **Dana bukan transaksi**: backend `envelopes.archiveRule` hanya mengubah lifecycle periode aktif menjadi `archived`; nominal yang belum terpakai kembali berstatus *dana tersedia* pada rekening yang sama, tanpa menambah/menghapus transaksi. Regression otomatis memeriksa kasus Alokasi `Rumah` Rp700.000 dengan dua kebutuhan Rp500.000 dan Rp200.000; akun tetap Rp1.000.000 pada fixture, *allocated remaining* berubah dari Rp700.000 menjadi Rp0, dan kedua record kebutuhan tetap tersimpan.
- **Batasan jelas**: mengarsipkan Alokasi tidak otomatis menghentikan semua jadwal rutin independen yang sudah terhubung ke Kebutuhan. Atur ulang/hentikan jadwal secara eksplisit bila tidak lagi berlaku. Tidak ada perubahan schema maupun penambahan API dalam hotfix ini.
- Tes hotfix: regresi frontend + backend, lint; tes build penuh harus diulang pada instalasi dependensi native Rollup yang sesuai OS. Perubahan baseline lint memperbaiki warning kompleksitas pada Wishlist/backup serta font investasi 11,5px menjadi 12px.

## Prinsip desain

Aksi **Hapus** di UI selalu menjelaskan dampaknya. Jika data masih digunakan transaksi, checkout, investasi, atau laporan, jangan menghapus physical record. Pilih arsip, sembunyikan khusus aktor, atau pembatalan/reversal canonical yang mempertahankan jejak audit. Rekening dengan saldo nonnol dan portofolio dengan posisi/dana aktif harus dipertahankan dalam total finansial; `display:hidden` tidak boleh memengaruhi saldo.

## Perubahan yang sudah diimplementasikan pada candidate ini

| Domain | UI/action | Data tetap utuh | Batasan |
|---|---|---|---|
| Daftar belanja | `shopping.archive`, `shopping.restore` | Checkout, item dan transaksi | Satu daftar aktif per Kebutuhan; daftar yang diarsipkan bisa dipulihkan jika tidak bentrok |
| Barang belanja yang telah checkout | `visibility.set` (`shopping_item`) | `shopping_items.status='purchased'`, `purchased_checkout_id`, `shopping_checkouts`, `transactions` | Preferensi hanya untuk pengguna aktif; toggle Tampilkan barang tersembunyi |
| Wishlist yang sudah dibeli | `visibility.set` (`wishlist_item`) | `purchase_transaction_id`, status purchased dan transaksi | Sembunyikan per-pengguna; bukan membatalkan pembelian |
| Portofolio investasi | `investments.portfolios.archive`, `.restore` | Trade, correction, valuation, reconciliation, audit | Arsip hanya jika RDN nol, posisi/cost basis nol, dan alokasi Target tidak aktif; akses pribadi/bersama tervalidasi |
| Hak akses baca daftar belanja pribadi | `shopping.detail`, `shopping.suggestions` | — | Anggota yang bukan pemilik tidak dapat mengakses melalui ID Kebutuhan |

### Lifecycle/arsip yang sudah ada pada baseline

Rekening, kategori, Alokasi Dana, Kebutuhan, jadwal rutin, Target, anggota, notifikasi, pengingat, dan transaksi sudah memiliki operasi penghapusan unused/arsip/tutup/batal/reversal sesuai masing-masing kontrak. Operasi tersebut **tidak disamakan dengan hard delete**; khusus keuangan, source financial authority tidak boleh dihapus sembarangan.

### Batasan yang masih membutuhkan fitur lanjutan

Tarik pengajuan master-data pending kini tersedia khusus pemohon asli (`masterDataRequests.withdraw`). Yang **belum** tersedia: tarik pengajuan transfer pending, operasi unlink integrasi, penghapusan snapshot valuasi investasi, hiding per-user untuk seluruh riwayat finansial, pengelolaan instrumen ticker dari UI, dan self-service hapus akun. Histori audit/reconciliations/ledger tidak boleh disediakan hard delete langsung. Lebih detail: laporan audit Smart Delete 15 Oktober dan matriks 46 unit pada handoff.

## Kontrak database, backup, dan reset

Migration `027_user_hidden_items.sql` menaikkan `schema_version` 28 ke 29 dan menambah `user_hidden_items` (satu preferensi visibility per `(user_id,entity_kind,entity_id)`). Nilai status `hidden` boolean; tidak mengubah source entity maupun aggregasi. `user_hidden_items` ikut logical backup, restore, reset scoped/full; snapshot versi lama tanpa tabel tetap kompatibel. **Jalankan migration canonical terlebih dahulu** sebelum menggunakan action baru; jangan migrasi manual di Production tanpa preview/backup/gate deployment.

## QA wajib sebelum rilis

1. Perbandingan saldo/reports sebelum-sesudah item wishlist/checkout dihapus dari tampilan masing-masing akun.
2. Daftar belanja partial checkout, completed, archived, restore dengan budget yang sudah berubah, serta konflik `row_version`.
3. Portfolio kosong, masih punya uang RDN, masih punya saham, investasi tertaut Target, akses personal anggota berbeda, akses shared non-owner, dan restore RDN inactive.
4. Migrasi DB 28 → 29, logical backup/restore versi lama dan baru, reset/full reset, rollback yang disetujui.
5. Mobile layar kecil, desktop, light/dark, focus/keyboard, offline, retry/idempotency, dan respons error backend.
6. `npm ci` → `npm run lint` → `npm run verify`, browser smoke di runtime Node didukung. Patch ini belum melewati gerbang tersebut karena dependensi tidak dapat terpasang secara lengkap di sandbox.

## Hotfix 2026-10-16 — feedback hapus dan tarik pengajuan lama

- Alokasi Dana dan Kebutuhan menampilkan *checking*, pesan kegagalan serta tombol coba lagi ketika preview lifecycle belum menghasilkan dialog. Menu menggunakan label tindakan eksplisit. Permission dan keputusan hard-delete vs arsip tetap dari backend.
- `masterDataRequests.withdraw` memungkinkan pengaju sendiri menarik request pending kategori/rekening dari versi lama; status `cancelled` sudah diizinkan oleh migration 012 (tidak perlu schema baru). Endpoint memvalidasi actor, row_version, reason, transisi pending, concurrency, audit; tidak menghapus record atau membuat/menghapus saldo. Hasil tetap berada di histori pengajuan dengan label *Ditarik*.
- Status hasil API yang belum pasti tidak dianggap sukses; pengguna harus memuat ulang daftar sebelum mencoba lagi.

- Portofolio investasi kini memakai komponen `ConfirmationModal` milik project (bukan `window.confirm`), menampilkan alasan keterbatasan saldo RDN/posisi/Target, error backend yang dapat dibaca, dan aksi restore yang sudah ada.
- Matriks audit yang diperbarui tersedia di `docs/SMART_DELETE_COVERAGE_MATRIX_2026-10-16.md` dan catatan cakupan di `docs/SMART_DELETE_COVERAGE_2026-10-16.md`.

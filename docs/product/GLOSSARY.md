# Glossary

| Istilah | Definisi canonical |
|---|---|
| Rekening | Wadah saldo dengan saldo awal dan transaksi; dapat `shared` atau `personal`. |
| Saldo | Saldo fisik rekening: saldo awal ditambah dampak seluruh transaksi aktif hingga cutoff. Alokasi tidak membuat saldo baru. |
| Dana tersedia | Saldo fisik rekening dikurangi seluruh sisa Alokasi Dana aktif yang bersumber dari rekening tersebut. Ini adalah dana yang masih bebas dipakai untuk transaksi tanpa Alokasi Dana atau Transfer. |
| Dialokasikan | Total sisa Alokasi Dana aktif yang masih terikat pada rekening sumber. Nilai ini merupakan bagian dari Saldo, bukan tambahan di atas Saldo. |
| Pemasukan | Transaksi `income` yang menambah rekening tujuan. |
| Pengeluaran | Transaksi `expense` yang mengurangi rekening sumber. |
| Transfer | Pemindahan antar dua rekening valid yang berbeda; bukan income/expense. |
| Refund | Pengembalian dana yang menambah rekening tujuan sesuai rule transaksi. |
| Adjustment | Penyesuaian Administrator-only yang tetap masuk ledger dan audit. |
| Active | Record masih berlaku terhadap perhitungan/operasi. |
| Cancelled | Transaksi dibatalkan secara audit-safe dan tidak memengaruhi saldo. |
| Archived | Record tidak aktif untuk penggunaan normal tetapi tidak dihapus permanen. |
| Alokasi Dana | Bagian saldo yang dialokasikan dari satu rekening sumber untuk tujuan/periode tertentu. Tidak membuat saldo atau transaksi ledger baru. Implementasi internal tetap memakai entitas `envelope_rules`/`envelope_periods` dan route compatibility `/perencanaan/kantong`. |
| Kebutuhan | Anggaran kategori di dalam satu Alokasi Dana. Implementasi internal memakai record `budgets` yang terhubung melalui `envelope_rule_id`; kategori master tetap dipakai ulang dan tidak diduplikasi. |
| Anggaran | Halaman ringkasan read-only seluruh Kebutuhan lintas Alokasi Dana. Pembuatan dan perubahan Kebutuhan dilakukan dari detail Alokasi Dana. |
| Budget | Batas nominal kategori per periode. |
| Recurring | Aturan pemasukan/tagihan yang menghasilkan occurrence. |
| Occurrence | Kejadian per tanggal dari recurring rule. |
| Target/Goal | Tujuan tabungan yang terhubung ke rekening dan mutasi. |
| Rekonsiliasi | Perbandingan saldo sistem dengan saldo aktual. |
| Periode tutup | Snapshot periode yang membatasi perubahan sesuai service rule. |
| Source of truth | Sistem canonical yang menjadi dasar data; saat ini Turso. |
| Mirror | Salinan satu arah untuk laporan; tidak menerima write balik. |
| Audit | Catatan append-only perubahan penting. |
| Idempotency key | Key retry yang memastikan request sama tidak membuat write ganda. |
| Row version | Versi record untuk menolak overwrite edit pengguna lain. |
| Preview | Analisis non-final sebelum import/restore apply. |
| Maintenance mode | Mode read-mostly untuk operasi recovery/integrity. |
| Administrator | Role administratif tertinggi. Key internal `owner` dipertahankan hanya untuk kompatibilitas backend/data existing. |
| Member | Role pengguna kedua dengan permission dan ownership terbatas. |

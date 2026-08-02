# Glossary

| Istilah | Definisi canonical |
|---|---|
| Rekening | Wadah saldo dengan saldo awal dan transaksi; dapat `shared` atau `personal`. |
| Saldo | Hasil saldo awal ditambah dampak seluruh transaksi aktif hingga cutoff. |
| Pemasukan | Transaksi `income` yang menambah rekening tujuan. |
| Pengeluaran | Transaksi `expense` yang mengurangi rekening sumber. |
| Transfer | Pemindahan antar dua rekening valid yang berbeda; bukan income/expense. |
| Refund | Pengembalian dana yang menambah rekening tujuan sesuai rule transaksi. |
| Adjustment | Penyesuaian owner-only yang tetap masuk ledger dan audit. |
| Active | Record masih berlaku terhadap perhitungan/operasi. |
| Cancelled | Transaksi dibatalkan secara audit-safe dan tidak memengaruhi saldo. |
| Archived | Record tidak aktif untuk penggunaan normal tetapi tidak dihapus permanen. |
| Kantong/Envelope | Alokasi dana dengan rule dan instance per periode. |
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
| Owner | Role administratif tertinggi yang tetap dibatasi backend. |
| Member | Role pengguna kedua dengan permission dan ownership terbatas. |

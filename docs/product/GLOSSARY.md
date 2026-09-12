# Glossary

> **Status:** Canonical  
> **Purpose:** Menetapkan arti istilah produk/keuangan agar copy, source, test, dan docs tidak memakai mental model berbeda.  
> **Update when:** Makna istilah atau hubungan finansial berubah.

| Istilah | Definisi canonical |
|---|---|
| Rekening | Wadah saldo dengan saldo awal dan transaksi; dapat `shared` atau `personal`. Kedua jenis tetap terlihat penuh oleh dua anggota keluarga terotorisasi. |
| Rekening personal | Rekening yang secara operasional dipegang satu anggota keluarga. Istilah `personal` tidak berarti privat/tersembunyi; pasangan tetap dapat membaca saldo dan histori sesuai prinsip full transparency. |
| Rekening bersama | Rekening keluarga tanpa satu pemegang personal. Capability operasi tetap ditentukan backend sesuai role. |
| Saldo rekening | Jumlah saldo cash rekening readable non-investasi. Ini angka utama Beranda dan berbeda dari Saldo RDN/Total investasi. |
| Saldo RDN | Saldo cash pada rekening canonical `account_type=investment`. Saldo RDN adalah dana investasi, tidak masuk Aman digunakan atau dana belum dialokasikan, dan ordinary ledger hanya memindahkannya melalui Transfer. |
| Nilai aset | Nilai tercatat holding investasi pada harga terakhir yang diketahui dari read-model Investasi. |
| Total investasi tercatat | Nilai aset + Saldo RDN dari `investments.overview`; bukan saldo operasional Beranda. |
| Aman digunakan | Dana operasional non-investasi yang dapat dipakai actor setelah proteksi, Alokasi Dana, dan komitmen Jadwal Rutin operasional. |
| Total kekayaan tercatat | Snapshot saat ini: Saldo rekening + Total investasi tercatat. Tidak dipakai sebagai historical market-value tanpa histori valuasi authoritative. |
| Saldo seluruh rekening | Saldo cash seluruh rekening readable termasuk RDN; dipakai untuk tren ledger/report yang secara eksplisit berlabel seluruh rekening. |
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
| Alokasi Dana | Wadah perencanaan account-bound. Dana di dalamnya adalah bagian Saldo yang diikat dari Dana Tersedia, terutama sebagai hasil total Kebutuhan. Mengikat/melepas dana tidak membuat transaksi ledger baru. Manual fund/release adalah advanced/compatibility control, bukan flow utama pembuatan wadah. Implementasi internal tetap memakai `envelope_rules`/`envelope_periods`. |
| Periode Alokasi Dana | Siklus aktif satu Alokasi Dana. Saat periode ditutup, sistem selalu menyiapkan periode aktif berikutnya. Policy `unallocated` memulai periode berikutnya pada Rp0, sedangkan `carry` hanya membawa sisa aktual. |
| Kebutuhan | Rencana nominal kategori di dalam satu Alokasi Dana. Menambah/mengubah Kebutuhan otomatis menyesuaikan dana Alokasi dari Dana Tersedia bila aman; menghapus/menurunkan hanya melepas sisa yang belum terpakai/dipesan dan tidak menyapu buffer. Implementasi internal memakai `budgets` + `envelope_rule_id`. |
| Anggaran | Istilah/domain legacy untuk record budget Kebutuhan. Tidak ada menu Anggaran terpisah; `/anggaran` hanya compatibility redirect ke Alokasi Dana. |
| Budget | Nama internal/legacy untuk record Kebutuhan per periode; bukan surface produk terpisah. |
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

## Sinkronisasi copy user-facing

- Definisi glossary adalah sumber makna product. UI boleh memendekkan kalimat, tetapi tidak boleh mengubah relasi finansialnya.
- Untuk Rekening, copy canonical frontend berada di `frontend/src/shared/presentation/account.js`: `ACCOUNT_BALANCE_GUIDANCE`, `ACCOUNT_AVAILABLE_BALANCE_HINT`, dan `ACCOUNT_ALLOCATED_BALANCE_HINT`.
- Page Info Perencanaan serta helper Rekening/Dashboard harus memakai makna yang sama: Alokasi Dana adalah bagian Saldo rekening non-investasi, Kebutuhan adalah nominal rencana kategori di dalam Alokasi Dana, tidak ada surface Anggaran terpisah pada UI, dan Saldo RDN tidak menjadi dana operasional.

# Investasi — compact native UX (diperbarui 14 Oktober 2026)

**Authority:** source `frontend/src/features/investments/`, API investasi dalam `api/_lib/services/investments/`, `docs/API_CONTRACT.md`. Dokumen ini menjelaskan UI yang dibuat, **bukan** otoritas ledger baru.

## Navigasi dan ringkasan

- Investasi memakai satu bar **Semua / Saham / Reksa Dana / Riwayat**, indikator aktif dengan reduced-motion fallback, roving Arrow/Home/End, dan tap target minimal canonical.
- Tab Semua berisi dua section semantik **Saham** dan **Reksa Dana**, hanya heading tipis; bukan kartu bertumpuk.
- Hero menampilkan nilai total, return, modal aktif dan jumlah aset tanpa mengulang `nilai saat ini` dalam kartu tambahan. Penanda **catatan manual, bukan harga pasar live** harus selalu tampil di mobile.
- Riwayat di layar ini bukan history database lengkap: query `investmentAssetActivity` tetap `LIMIT 30` per portfolio, lalu overview menampilkan maksimum 30 terbaru. Penyediaan pagination/cursor dan filter tanggal membutuhkan perpanjangan read contract terotorisasi tersendiri dan tes query/access control. Jangan menampilkan klaim "semua histori".

## Posisi awal dan pembelian pertama

- Tetap tanyakan **Sudah punya / Belum punya**. Posisi lama tanpa cash effect/RDN; pembelian baru memotong RDN tercatat hanya bila backend mengonfirmasi transaksi.
- Minimal: aset, jumlah, harga dan tanggal default hari ini; untuk posisi lama tambahkan harga/NAB referensi. Jika hanya ada satu rekening RDN operable, terpilih implisit tetapi tetap terlihat.
- `cost_basis` dan `market_value` override broker disembunyikan di `<details>` **Sesuaikan dengan angka broker**; tidak dihapus dari payload atau validasi. Fee dan notes juga dalam **Detail tambahan**.
- Setelah memilih aset, katalog/picker diganti baris ringkas berisi logo–nama–kategori dan tombol **Ganti**. Ketika Ganti dibuka, pemilihan, pencarian, izin member dan larangan menambah aset yang sudah ada tetap mengikuti `InvestmentAssetPicker` asli; tidak ada flow keuangan baru.
- Form posisi awal memakai prefix unit/Rp dekoratif di `InvestmentFormField` (aria label dan input formatter tetap sama), satu kolom untuk tanggal dan kuantitas di viewport mobile ≤620px, serta nilai ringkasan dengan surface lembut. Bottom sheet tetap mengikuti `Modal`, safe-area iOS dan focus keyboard canonical.
- Footer tahap isi: **Kembali + Tinjau**; tahap review: **Ubah + Simpan catatan**. Ketika hasil simpan tidak pasti (outcome-unknown), pengubahan intent tetap terkunci. Layar review posisi lama memuat aset, kuantitas, **tanggal posisi**, harga, modal, dan nilai akhir, termasuk override broker jika diisi.
- Detail holding saham/reksa dana memakai header identitas + harga terakhir (beserta tanggal jika ada), satu daftar fakta label–nominal tanpa harga terakhir duplikat, kemudian total nilai/return dan catatan manual. Aksi Beli/Jual/Perbarui, detail histori, data posisi selesai, dan pembatasan permission tetap sesuai source.
- Nominal dibulatkan half-up ke Rupiah memakai `rupiahFromInvestmentUnits`, berdasarkan integer hundredths & cents: 0,58 unit × Rp25 = Rp15. Validasi `purchaseTotalError`, preview first-purchase, dan opening position memakai perhitungan sama. Server tetap authoritative.

## Beli dan jual

- Form perdagangan mengutamakan aset, jumlah, harga, serta sumber Target bila perlu; tanggal/fee/catatan berada dalam **Detail transaksi** yang tetap dapat dibuka dan divalidasi.
- Penjualan menyediakan **25% / 50% / Jual semua tersedia**, hanya dari sumber unit bebas **atau** Target terpilih. Saham dibulatkan ke lot bulat ke bawah; reksa dana disimpan 2 desimal. Penjualan lintas Target **tidak** dilakukan sebagai batch client tanpa atomisitas server.
- Review menampilkan jumlah, gross, fee (jika belum diisi jangan menyebut "fee terverifikasi nol"), arus RDN bila relevan, average pada beli, serta sisa unit/lot, modal dilepas dan estimasi hasil realisasi pada jual. Nilai review adalah estimasi; ledger/Target/row-version/idempotency tetap authoritative di server.
- Konfirmasi server memicu toast dengan ticker dan highlight halus aset; tidak ada XP/confetti/game-feel yang merayakan spekulasi investasi. `prefers-reduced-motion` mematikan animasi.

## QA manual wajib sebelum produksi

1. Viewport 320/375/390/430px dan desktop, dark & light, ukuran teks 200%, keyboard Tab dan Arrow, focus, reduced-motion.
2. Saldo RDN cukup/tidak cukup, RDN tunggal/ganda, rekening internal hidden, member read-only, stale row-version, network outcome-unknown retry key.
3. Aset bebas, seluruhnya di satu Target, dialokasikan ke beberapa Target, dan posisi selesai; shortcut Jual Semua tak boleh melampaui sumber yang dipilih.
4. Reksa dana 0,01 / 0,58 / 977,56 dan harga dua desimal; total preview dan backend harus sama; fee, override broker, nilai overflow, pembelian mundur tanggal. Pastikan perbedaan 977,56 × Rp5.696,59 (otomatis Rp5.568.759) vs nilai broker Rp5.568.784 dapat ditampilkan dan dipilih lewat override tanpa mengubah kuantitas/harga/RDN.
5. Penjualan parsial vs penuh menyesuaikan cost basis proporsional, jumlah, realisasi P/L, RDN dan Target; pastikan UI tidak mengirim order ke broker.
6. Histori di atas 30 aktivitas harus **secara eksplisit ditandai terbatas** sampai ada pagination server. Jangan menganggap halaman Riwayat lengkap.

Tidak ada schema/migration/API mutation payload baru dalam patch ini. Komponen valuasi bulk yang belum tersambung tidak dihapus karena belum lolos audit orphan/deletion integrity.

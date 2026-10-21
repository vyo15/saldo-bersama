# Smart Delete — aturan UI pengelolaan data

> **Status:** Canonical — batas UI dan kontrak lifecycle data.
> **Purpose:** Menentukan kapan memakai Hapus, Arsipkan, Sembunyikan, Batalkan, dan Pulihkan.
> **Update when:** Action registry/authorization/feedback/lifecycle berubah.

- **Hapus permanen** hanya untuk entitas yang dinyatakan *unused* oleh lifecycle preview backend; jangan menghapus histori keuangan, saldo, audit atau transaksi yang masih terkait.
- **Arsipkan** mempertahankan histori saat data tidak lagi aktif. **Sembunyikan** hanya mengubah visibilitas untuk pengguna yang berhak; **Batalkan** mengikuti lifecycle transaksi atau pengingat, bukan hard-delete.
- Aksi yang belum dipastikan hasilnya dari server **tidak boleh** menampilkan sukses palsu. `OUTCOME_UNKNOWN` harus mengunci intent/payload hingga status definitif diketahui atau retry data sama berhasil.
- Hak akses, `row_version`, idempotency, saldo/RDN, dan relasi Target/Kebutuhan/Jadwal divalidasi server. UI tidak boleh menyimpulkan boleh hapus hanya dari warna/ikon/absence dependency di tampilan.
- Alokasi yang dilepas tetap hanya mengubah *available/allocated funds*, bukan membentuk transaksi baru. Jadwal independen yang berhubungan tidak otomatis dihentikan.
- Pilihan overflow pada Target, Transaksi, Shopping, Wishlist, Kewajiban, dan Keluarga memakai `ActionOverflowMenu` (lihat `UI_DESIGN_SYSTEM.md`); tombol khusus Kebutuhan/Alokasi memakai `Modal` canonical jika perlu pemilihan aksi lebih kompleks.

## Authority dan pengujian

- Detail status/izin/action: `API_CONTRACT.md`, `AUTHORIZATION_MATRIX.md`, `DATA_DELETION_AND_RECOVERY_POLICY.md`, dan backend handler aktual.
- Regression untuk delete/archive/restore/visibility: `TEST_PLAN.md`, `frontend/test/lifecycle-action-semantics.test.js`, test domain backend dan integritas saldo.
- QA manual: periksa role, data kosong/terkait, status loading/error/unknown, konfirmasi, double-submit, restore, light/dark, dan mobile 320px/near bottom navigation.
- Matriks historis 46 kategori dan hotfix lama telah diringkas ke `history/COMPLETED_UI_REGRESSION_LOG.md`; versi mentah tetap ada di Git, **bukan** authority terkini.

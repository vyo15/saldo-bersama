# RFC-0020 — Daftar Belanja Kebutuhan

Status: **Implemented**

## Tujuan

Daftar Belanja adalah lapisan eksekusi untuk `Kebutuhan` di Atur Dana. Fitur ini membantu keluarga menyiapkan barang, menggunakan checklist saat belanja, lalu mencatat hasil akhirnya sebagai transaksi canonical tanpa membuat ledger kedua.

## Invariant

1. Satu daftar belanja selalu terhubung ke satu `budget`/Kebutuhan.
2. Checkbox `pending`/`in_cart` tidak pernah mengubah saldo, pemakaian Kebutuhan, atau laporan.
3. Hanya `shopping.checkout` yang membuat transaksi keuangan, melalui `createTransactionInternal`.
4. Checkout, perubahan item ke `purchased`, dan link checkout-transaksi berlangsung dalam satu transaction database dan write action idempotent.
5. `shopping_items` adalah metadata operasional, bukan `transaction line items` dan tidak mengubah RFC-0019.
6. Satu daftar boleh memiliki beberapa checkout agar belanja parsial pada hari berbeda tetap representatif.
7. Barang yang sudah `purchased` dipertahankan sebagai histori; pembatalan transaksi tidak diam-diam mengembalikan kondisi fisik barang.
8. Hak mutasi mengikuti scope, owner/assignee, status Kebutuhan, kategori, dan Alokasi Dana canonical.
9. Daftar belanja masuk backup, restore, reset, export, dan lifecycle dependency Kebutuhan.
10. Capability Daftar Belanja adalah keputusan eksplisit per Kebutuhan, default nonaktif; kategori tidak menjadi authority untuk mengaktifkannya. Preference aktif diproyeksikan dari list non-archived, sedangkan item/checkouts tetap histori domain shopping.

## Model

- `shopping_lists`: daftar per Kebutuhan.
- `shopping_items`: item, kuantitas milli-unit, estimasi, aktual, kelompok, dan state.
- `shopping_checkouts`: penghubung immutable antara satu perjalanan belanja dan satu transaksi.

State item: `pending -> in_cart -> purchased`; `removed` adalah soft removal sebelum checkout.
State list: `draft|active|completed|archived`.

## UX

Entry point tetap dari Atur Dana/Kebutuhan, bukan menu utama baru. Form Kebutuhan menyediakan switch **Gunakan daftar belanja**; CTA shopping hanya tampil saat preference aktif dan tidak diduplikasi di overflow. Mobile menggunakan list minim wrapper dan sticky primary action. Desktop menambah summary rail. Rekening sumber dan Kebutuhan pada checkout ditampilkan sebagai locked context supaya user tidak mengulang keputusan yang sudah ditentukan Alokasi Dana.

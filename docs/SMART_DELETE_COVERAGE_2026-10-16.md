# Cakupan Smart Delete — audit 46 unit data, 16 Oktober 2026

Status **CANDIDATE**; source terbaru dari `saldo-bersama.zip`. Matriks Markdown pendamping memuat seluruh 46 unit yang sebelumnya diinventarisasi, dengan status diperbarui berdasarkan action registry dan UI aktual. Matriks bukan jaminan tiap jalur sudah melalui tes E2E perangkat nyata.

## Implementasi yang ditangani patch ini

1. **Atur Dana → Alokasi Dana**: tombol Hapus di menu tiga titik, status memeriksa, error persisten, retry; `envelopes.previewRuleLifecycle` memilih hapus permanen hanya untuk rule unused atau arsip untuk histori. Tidak menimpa saldo rekening dan jurnal lama.
2. **Atur Dana → Kebutuhan**: tombol Hapus pada tiga titik per Kebutuhan, status memeriksa, error, retry; `budgets.previewLifecycle`/`budgets.remove` mempertahankan histori dan melepaskan dana yang aman.
3. **Pengajuan**: `masterDataRequests.withdraw` menarik request rekening/kategori *legacy* pending oleh pemohon asli dengan `row_version`, idempotency dari dispatcher, audit, sinkronisasi, dan notifikasi; pemohon lain/owner tidak dapat menarik request yang bukan miliknya. Status request menjadi `cancelled`, tidak dibuat entitas atau transaksi baru.
4. **Investasi → Portofolio**: mengganti konfirmasi bawaan browser menjadi `ConfirmationModal` selaras komponen project; arsip hanya bila posisi, saldo RDN, dan alokasi Target memenuhi aturan backend.
5. **UI lain**: arsip Wishlist/purchased, Daftar Belanja/purchased, rekening, kategori, target, jadwal, notifikasi, anggota dan sesi memakai lifecycle existing pada source ZIP, bukan implementasi ulang pada patch ini.

## Belum boleh dianggap fitur selesai

- **Rekening dengan saldo/histori**: backend menolak arsip dalam sebagian kasus; belum ada hide-only universal dengan saldo tetap dihitung.
- **Transaksi, transfer, checkout, trade, saldo awal, mutasi, audit, dan rekonsiliasi**: bukan hard-delete bebas. Perlu alur koreksi/reversal sesuai dampak jurnal dan periode.
- **Pengajuan transfer masih pending**: hanya approve/reject; belum ada self-withdraw. Database `transfer_requests` saat ini tidak mengizinkan `cancelled`, perubahan memerlukan migration yang dirancang khusus.
- **Instrumen investasi/ticker, holding, snapshot valuasi, dan pencatatan investasi historis**: belum punya lifecycle individual universal.
- **Integrasi Google**: belum ada putuskan koneksi self-service canonical pada action registry, berbeda dari mencabut push subscription.
- **Hapus akun sendiri** dan **hide-only semua histori pribadi** belum ada.
- **Dashboard, laporan dan metrik** merupakan data turunan dari sumber, tidak semestinya memiliki tombol hapus terpisah.

## Gate dan risiko

Perlindungan backend: actor scope, row_version, mode operasi, audit, idempotency, relasi transaksi, saldo RDN, dan alokasi dana harus tetap menjadi sumber kebenaran. UX tidak boleh melewati blocker dengan `DELETE` langsung. Perlu tes end-to-end termasuk iPhone/PWA, error jaringan, sinkronisasi lintas akun, migrasi source deployment, dan `npm ci && npm run verify` pada dependensi sesuai OS sebelum status production-ready.

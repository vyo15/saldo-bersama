# RFC-0013 Contribution and Cost Sharing

**Status:** Accepted, MVP implemented  
**Owner:** Product owner  
**Reviewers:** Backend, privacy/security, frontend, QA  
**Date:** 2026-08-02  
**Decision date:** 2026-08-19

## Problem

`created_by` hanya actor pencatat. Ia tidak menjelaskan siapa memakai uang, membayar, menanggung, atau berkontribusi. Laporan aktivitas pencatatan karena itu harus tetap terpisah dari pembagian beban.

## Decision

MVP mengimplementasikan **pembagian beban biaya** untuk transaksi `expense` shared. Ini bukan model kontribusi aktual.

- Mode: `unspecified`, `equal`, atau `percentage`.
- Transaksi historis tetap `unspecified`; tidak ada backfill 50:50.
- Snapshot split disimpan pada transaksi agar perubahan user atau pilihan di masa depan tidak mengubah histori.
- Transaksi aktual dari Jadwal Rutin shared memakai kontrak split yang sama saat occurrence dibayar. Rule jadwal tidak menyimpan split sebagai asumsi permanen.
- `equal` dan `percentage` membagi integer Rupiah secara deterministik. Total nominal split harus tepat sama dengan nominal expense.
- Split tidak membuat ledger entry dan tidak mengubah saldo rekening, Alokasi Dana, atau Target.
- `created_by` tetap recorder dan tidak boleh dipakai sebagai fallback kontribusi.

Schema additive berada pada `database/migrations/009_transaction_cost_sharing.sql` dan menaikkan schema ke v11 melalui `transactions.cost_share_mode` serta `transactions.cost_share_json`. API, validation, audit, integrity, backup/restore, export, dan `reports.monthly.costShareExpenses` mengikuti snapshot tersebut.

## Authorization dan privacy

Hanya transaksi shared yang dapat memiliki split. Client tidak dapat mengirim snapshot internal `cost_share_json`; backend menghitung snapshot dari user aktif dan input mode/persentase yang tervalidasi. Setelah tersimpan, edit dengan mode yang sama mempertahankan participant dan basis snapshot agar perubahan roster user tidak menulis ulang histori. Perubahan mode atau persentase dianggap keputusan baru dan divalidasi terhadap user aktif saat perubahan dilakukan. Report menyebutnya pembagian beban biaya, bukan kontribusi.

## Deferred scope

MVP **belum** memodelkan payer, beneficiary, liable party terpisah, settlement, template split berdasarkan pendapatan, nominal tetap, atau kontribusi aktual. Fitur tersebut membutuhkan keputusan dan migration lanjutan sebelum label “kontribusi” boleh digunakan.

Refund juga belum terhubung ke expense asli untuk mengembalikan cost split atau Alokasi Dana. Partial/multiple refund dan dampaknya ke Kebutuhan/Alokasi Dana harus diputuskan secara terpisah; UI tidak boleh memalsukannya dengan memilih Alokasi Dana sembarang.

## Test and acceptance criteria

- Total split tepat 100% dan nominal integer tepat sama dengan amount transaksi.
- Rounding Rupiah deterministik.
- Personal/non-expense selalu `unspecified`.
- Edit nominal menghitung ulang split dari snapshot basis points yang sama.
- Edit biasa setelah user ditambah/dinonaktifkan tidak mengganti participant snapshot transaksi lama.
- Pembayaran occurrence Jadwal Rutin shared dapat membawa split dan menghasilkan transaksi dengan snapshot yang sama seperti transaksi manual.
- Cancel/restore menjaga snapshot dan audit.
- Pembagian beban tidak menambah atau mengurangi saldo di luar dampak transaksi expense itu sendiri.
- Backup/restore v3-v10 dinormalisasi aman ke runtime v11.

## Risks

False precision tetap mungkin bila user menganggap pembagian beban sebagai bukti pembayaran. UI/report wajib mempertahankan label analitis dan penjelasan bahwa payer/beneficiary belum tersedia.

# RFC-0013 Contribution and Cost Sharing

**Status:** Accepted, MVP implemented; follow-up design hardened but not implemented  
**Owner:** Product owner  
**Reviewers:** Backend, privacy/security, frontend, QA  
**Date:** 2026-08-02  
**Decision date:** 2026-08-19  
**Follow-up review:** 2026-08-21 against schema v11

## Problem

`created_by` hanya actor pencatat. Ia tidak menjelaskan siapa memakai uang, membayar, menanggung, atau berkontribusi. Laporan aktivitas pencatatan karena itu harus tetap terpisah dari pembagian beban dan kontribusi aktual.

## Implemented MVP decision

MVP mengimplementasikan **pembagian beban biaya** untuk transaksi `expense` shared. Ini bukan model kontribusi aktual.

- Mode: `unspecified`, `equal`, atau `percentage`.
- Transaksi historis tetap `unspecified`; tidak ada backfill 50:50.
- Snapshot split disimpan pada transaksi agar perubahan user atau pilihan di masa depan tidak mengubah histori.
- Transaksi aktual dari Jadwal Rutin shared memakai kontrak split yang sama saat occurrence dibayar. Rule jadwal tidak menyimpan split sebagai asumsi permanen.
- `equal` dan `percentage` membagi integer Rupiah secara deterministik. Total nominal split harus tepat sama dengan nominal expense.
- Split tidak membuat ledger entry dan tidak mengubah saldo rekening, Alokasi Dana, atau Target.
- `created_by` tetap recorder dan tidak boleh dipakai sebagai fallback kontribusi.

Schema additive berada pada `database/migrations/009_transaction_cost_sharing.sql` dan menaikkan schema ke v11 melalui `transactions.cost_share_mode` serta `transactions.cost_share_json`. API, validation, audit, integrity, backup/restore, export, dan `reports.monthly.costShareExpenses` mengikuti snapshot tersebut.

## Authorization dan privacy MVP

Hanya transaksi shared yang dapat memiliki split. Client tidak dapat mengirim snapshot internal `cost_share_json`; backend menghitung snapshot dari user aktif dan input mode/persentase yang tervalidasi.

Setelah tersimpan, edit dengan mode yang sama mempertahankan participant dan basis snapshot agar perubahan roster user tidak menulis ulang histori. Perubahan mode atau persentase dianggap keputusan baru dan divalidasi terhadap user aktif saat perubahan dilakukan.

Report menyebutnya **pembagian beban biaya**, bukan kontribusi.

## Canonical participant vocabulary for follow-up

Follow-up RFC menggunakan vocabulary RFC-0011:

- **Recorder**: actor pencatat, existing `created_by`.
- **Payer**: pihak yang secara nyata menyediakan dana.
- **Beneficiary**: pihak yang menerima manfaat ekonomi.
- **Liable party**: pihak yang secara ekonomi menanggung kewajiban.
- **Cost-share participant**: participant analitis dalam `cost_share_json`.
- **External counterparty**: pihak di luar user aplikasi.

Tidak ada fallback otomatis antar role. Payer tidak disimpulkan dari recorder. Beneficiary tidak disimpulkan dari cost share. Cost-share participant tidak dianggap bukti kontribusi aktual.

## Follow-up A: actual contribution

### Decision

Kontribusi aktual adalah **fact/event terpisah dari cost-share snapshot**.

Future implementation tidak boleh menulis actual contribution ke `cost_share_json`. Model kandidat memakai relation/event canonical yang link ke transaction dan participant, dengan minimum:

- contributor/payer subject;
- amount integer Rupiah;
- source/evidence relation jika relevan;
- status/lifecycle;
- idempotency/audit;
- optional settlement relation bila kontribusi dibayar kemudian.

Total actual contribution tidak harus selalu sama dengan cost share. Perbedaan tersebut justru data yang mungkin dibutuhkan untuk settlement internal. UI/report wajib membedakan:

- **pembagian beban**: siapa seharusnya menanggung;
- **kontribusi aktual**: siapa benar-benar membayar;
- **settlement**: pembayaran untuk menyelesaikan selisih kontribusi, jika fitur tersebut kelak diaktifkan.

Cost-share mismatch tidak otomatis membuat utang/piutang RFC-0012. Pembuatan obligation internal harus aksi eksplisit dan audited.

## Follow-up B: payer and beneficiary

Future transaction participant model menggunakan role eksplisit dan tidak menambah field ambigu `used_by`.

MVP target role:

- `payer`
- `beneficiary`
- `liable_party`

Existing transaksi tetap valid tanpa participant. Tidak ada backfill dari `created_by`, account owner, atau `cost_share_json`.

## Follow-up C: original-expense relation for refund

### Current boundary

Schema v11 memperlakukan refund sebagai cash inflow ke destination account. Refund belum mempunyai relation ke expense asli. Karena itu current runtime **benar** dengan tidak mengembalikan Alokasi Dana atau cost split secara otomatis.

### Required relation

Sebelum refund boleh memulihkan Alokasi Dana atau split, refund wajib mempunyai original expense relation yang divalidasi backend.

Minimum invariants:

- original transaction harus `expense`;
- original expense harus dapat dibaca/dioperasikan sesuai ownership contract;
- refund dan original expense harus mempunyai compatible scope;
- refund amount integer > 0;
- cumulative active refund ke satu original expense tidak boleh melebihi original expense amount;
- cancelled/reversed refund tidak dihitung pada cumulative cap;
- satu expense boleh mempunyai multiple partial refund;
- satu refund hanya mempunyai satu original expense pada MVP;
- relation tidak dapat diganti diam-diam setelah refund aktif tanpa guarded reversal/correction workflow.

Refund tanpa original relation tetap diperbolehkan sebagai generic cash refund hanya jika product contract masih memerlukannya, tetapi **tidak boleh** memulihkan Alokasi Dana/cost split.

## Follow-up D: cost-share reversal on linked refund

Jika linked refund kelak memulihkan cost share, reversal split harus berasal dari immutable original snapshot, bukan roster user saat refund dibuat.

Untuk partial/multiple refund:

1. gunakan basis points original;
2. hitung cumulative refundable share per participant secara deterministik;
3. cap cumulative reversed share agar tidak melebihi original `share_amount` participant;
4. setiap refund menyimpan reversal snapshot sehingga histori tidak berubah ketika ada refund berikutnya;
5. total reversal snapshot refund harus tepat sama dengan refund amount yang eligible untuk split reversal.

Tidak ada backfill heuristik untuk refund historis tanpa original-expense relation.

## Follow-up E: Alokasi Dana restoration on linked refund

Auto-restore hanya boleh terjadi jika original expense mempunyai `envelope_period_id` dan policy period aman.

Baseline aman:

- jika original Alokasi Dana period masih aktif/open, linked refund dapat mengembalikan maksimal cumulative amount yang benar-benar dikonsumsi oleh original expense;
- restore menggunakan server-side movement/event yang dapat diaudit, bukan edit saldo envelope bebas;
- multiple refund memakai cumulative cap;
- jika original period sudah closed/archived, **jangan restore silang periode secara otomatis**;
- refund pada period closed menjadi dana rekening yang belum dialokasikan. UI boleh menawarkan aksi eksplisit untuk mengalokasikan kembali pada period aktif;
- restore tidak boleh membuat envelope remaining melebihi capacity/policy yang disetujui tanpa explicit handling.

Policy ini mencegah refund lama mengubah histori periode yang sudah ditutup.

## Follow-up F: refund and Kebutuhan

Kebutuhan yang terkait original expense hanya boleh dipulihkan jika semantics Kebutuhan memang mengukur spending capacity period yang sama. Tidak ada restore lintas period. Jika Kebutuhan sudah archived/closed, refund tidak membuka kembali lifecycle secara otomatis.

## Test and acceptance criteria MVP

- Total split tepat 100% dan nominal integer tepat sama dengan amount transaksi.
- Rounding Rupiah deterministik.
- Personal/non-expense selalu `unspecified`.
- Edit nominal menghitung ulang split dari snapshot basis points yang sama.
- Edit biasa setelah user ditambah/dinonaktifkan tidak mengganti participant snapshot transaksi lama.
- Pembayaran occurrence Jadwal Rutin shared dapat membawa split dan menghasilkan transaksi dengan snapshot yang sama seperti transaksi manual.
- Cancel/restore menjaga snapshot dan audit.
- Pembagian beban tidak menambah atau mengurangi saldo di luar dampak transaksi expense itu sendiri.
- Backup/restore v3-v10 dinormalisasi aman ke runtime v11.

## Follow-up acceptance criteria before implementation

- Payer/beneficiary/liable party tidak diinfer dari recorder.
- Actual contribution tersimpan terpisah dari cost-share snapshot.
- Refund relation memblokir cumulative refund di atas original amount.
- Partial/multiple refund deterministic dan idempotent.
- Linked refund menggunakan original cost-share snapshot untuk reversal.
- Refund tanpa original relation tidak mengubah split/Alokasi Dana.
- Refund ke closed period tidak mengubah histori period dan tidak auto-restore silang periode.
- Reversal/cancel refund mengembalikan state split/Alokasi tepat satu kali jika restoration feature diaktifkan.
- Backup/restore dan integrity check memverifikasi original expense, refund, split reversal, dan allocation movement relation.

## Risks

- False precision jika user menganggap pembagian beban sebagai bukti pembayaran.
- Participant role yang tumpang tindih dapat membuat laporan kontribusi salah.
- Refund relation yang longgar dapat menggandakan dana Alokasi atau membalik split melebihi original expense.
- Auto-create debt dari cost-share mismatch dapat membuat kewajiban palsu.

## Decision

MVP cost-sharing schema v11 tetap Accepted dan implemented.

Follow-up payer/beneficiary, actual contribution, settlement, dan refund restoration **belum approved untuk migration/runtime**. Design boundary di RFC ini menjadi baseline untuk plan berikutnya: original-expense relation harus hadir lebih dulu, lalu split/Alokasi restoration dapat direncanakan sebagai guarded feature terpisah.

## Links

- `0011-transaction-lifecycle-receipts-and-usage.md`
- `0012-debt-receivable-ledger.md`
- `../../database/migrations/009_transaction_cost_sharing.sql`

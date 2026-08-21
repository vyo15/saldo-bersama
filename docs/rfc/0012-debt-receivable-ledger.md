# RFC-0012 Debt and Receivable Obligation + Settlement Ledger

**Status:** Proposed, design hardened  
**Owner:** Product owner + finance-domain owner  
**Reviewers:** Backend, QA, recovery owner  
**Date:** 2026-08-02  
**Last reviewed:** 2026-08-21 against schema v11

## Problem

Utang/piutang mempunyai kontrak ekonomi yang berbeda dari cash movement. Ia memiliki principal, pihak terkait, tanggal mulai, jatuh tempo, settlement parsial, bunga/fee, reversal, write-off, dan saldo kewajiban tersisa.

Schema v11 hanya mengenal ledger transaction `income`, `expense`, `transfer`, `refund`, dan `adjustment`. Menambah `debt` atau `receivable` sebagai `transaction_type` akan mencampur obligation dengan cash movement. Sebaliknya, mencatat pencairan utang sebagai pemasukan biasa atau pembayaran principal sebagai pengeluaran biasa akan membuat laporan income/expense salah secara ekonomi.

## Canonical vocabulary

RFC ini menggunakan participant vocabulary RFC-0011:

- recorder;
- payer;
- beneficiary;
- liable party;
- external counterparty.

`obligation_party` tidak boleh menjadi konsep baru yang artinya tumpang tindih. Ia adalah relation party ke obligation dengan role yang eksplisit.

## Goals

- Pisahkan obligation dari account cash ledger.
- Cash movement yang benar-benar terjadi tetap memengaruhi account balance tepat sekali.
- Principal movement tidak dihitung sebagai operating income/expense.
- Interest/fee dapat dilaporkan terpisah dari principal.
- Outstanding obligation dapat direkonstruksi dari event canonical.
- Settlement dan reversal atomic, idempotent, versioned, dan audited.
- External counterparty tidak dipalsukan sebagai user aplikasi.

## Non-goals

- RFC ini bukan approval migration/API.
- Cost sharing internal tidak otomatis menjadi utang antar pasangan.
- Tidak mengonversi transaksi historis menjadi obligation secara heuristik.
- Tidak mengandalkan editable `remaining_balance` sebagai source of truth.

## Accounting decision

### Obligation bukan transaction type

Canonical obligation berada pada entity terpisah. Account ledger tetap merepresentasikan cash movement. Untuk menghindari principal muncul sebagai income/expense ekonomi, future ledger membutuhkan **economic classification** yang terpisah dari shape cash movement.

Nama field final diputuskan saat schema plan, tetapi semantics minimum:

- `operating`
- `debt_principal_received`
- `debt_principal_repaid`
- `receivable_principal_disbursed`
- `receivable_principal_collected`
- `obligation_interest`
- `obligation_fee`

Existing transaksi v11 dinormalisasi sebagai `operating` kecuali type internal seperti adjustment/goal yang mempunyai classification canonical sendiri pada migration plan.

Client tidak boleh membuat principal movement dengan memilih label pemasukan/pengeluaran biasa. Action obligation server-side menentukan ledger shape dan economic classification.

### Reporting rule

Cash principal tetap memengaruhi saldo rekening, tetapi dikeluarkan dari total pemasukan/pengeluaran operasional.

Contoh:

| Event | Account balance | Operating income | Operating expense | Obligation outstanding |
| --- | ---: | ---: | ---: | ---: |
| Pinjam Rp5 juta masuk rekening | +5 jt | 0 | 0 | +5 jt debt |
| Bayar principal Rp1 juta | -1 jt | 0 | 0 | -1 jt debt |
| Bayar bunga Rp50 ribu | -50 rb | 0 | +50 rb | tidak berubah |
| Pinjamkan Rp2 juta | -2 jt | 0 | 0 | +2 jt receivable |
| Terima pengembalian principal Rp500 ribu | +500 rb | 0 | 0 | -500 rb receivable |

Dengan policy ini, balance tetap benar tanpa memalsukan principal sebagai income/expense.

## Proposed domain model

### `obligations`

Minimum concept:

- `obligation_id`
- `kind`: `debt` atau `receivable`
- original principal integer Rupiah
- currency fixed IDR untuk MVP
- start date
- due date nullable
- scope/owner
- counterparty relation
- lifecycle `active`, `settled`, `written_off`, `archived`
- `row_version`
- audit fields

Outstanding tidak boleh menjadi angka bebas edit. Source of truth berasal dari original principal plus active obligation events/settlements. Cached outstanding boleh dipertimbangkan hanya jika integrity check selalu dapat merekonstruksi dan memverifikasinya.

### `obligation_parties`

Relation party dengan role eksplisit. Party dapat berupa canonical user atau external counterparty, tetapi tidak keduanya pada row yang sama.

Minimum role:

- `creditor`
- `debtor`

Internal payer/beneficiary tetap memakai vocabulary participant dan tidak disimpulkan otomatis dari creditor/debtor.

### `obligation_settlements`

Gunakan settlement ledger/event, bukan mutable payment row yang kehilangan histori.

Minimum concept:

- settlement id
- obligation id
- linked ledger transaction id
- principal component integer
- interest component integer
- fee component integer
- effective date
- status `active`/`reversed`
- idempotency key
- `row_version`
- audit/reversal fields

Total cash movement settlement harus sama dengan component yang benar-benar dibayar/diterima sesuai direction contract. Principal component mengurangi outstanding. Interest/fee tidak mengurangi principal kecuali contract eksplisit mendefinisikan kapitalisasi melalui event terpisah.

### Obligation adjustments

Perubahan principal setelah creation tidak dilakukan dengan edit diam-diam. Gunakan event/versioned adjustment atau contract amendment yang audited. Write-off juga event eksplisit dan tidak membuat cash movement palsu.

## Settlement workflow

Settle harus atomic:

1. auth + authorization;
2. load obligation dan version terbaru;
3. validasi account operable dan ownership;
4. hitung outstanding terbaru dari active events;
5. validasi principal component tidak melebihi outstanding;
6. buat ledger cash transaction canonical dengan economic classification yang benar;
7. buat settlement event yang link ke transaction;
8. update obligation lifecycle bila outstanding menjadi nol;
9. append audit;
10. commit;
11. baru balas sukses.

Retry menggunakan idempotency key yang sama.

## Reversal workflow

Reverse settlement wajib:

- menolak stale version;
- reverse settlement event tepat sekali;
- cancel/reverse linked ledger cash transaction sesuai ledger contract;
- mengembalikan outstanding tepat sebesar principal component;
- tidak menggandakan interest/fee pada report;
- append audit;
- commit atomically.

Tidak boleh menghapus settlement permanen.

## Internal obligations and cost sharing

Cost-share expense RFC-0013 adalah analytical burden snapshot. Ia tidak otomatis membuat utang antar pengguna. Jika kelak ada fitur "A berutang ke B" dari kontribusi aktual, obligation internal hanya dibuat melalui aksi eksplisit dengan preview, bukan derivasi otomatis dari cost share.

## Impact

- Frontend: halaman Utang/Piutang, create, detail, settle, reverse, history.
- API: obligation list/create/update lifecycle/settle/reverse dengan preview guarded.
- Database: migration additive setelah economic classification dan external counterparty model approved.
- Reports: principal excluded dari operating income/expense, interest/fee classified eksplisit.
- Backup/import/export: obligation, party, settlement, event, dan linked transaction validation.
- Reconciliation: account cash movement tetap terlihat karena ledger transaction canonical.

## Migration and rollback

- Existing transactions tidak dikonversi otomatis.
- Migration economic classification harus mempunyai deterministic default untuk histori v11 dan compatibility backup v3-v11.
- Import obligation wajib preview dan reject over-settlement/unknown party/account.
- Rollback menggunakan forward-fix. Linked settlement/transaction tidak boleh diputus dengan DROP manual.
- Backup teknis wajib sebelum migration dan restore wajib integrity check obligation vs ledger.

## Test and acceptance criteria

- Principal/outstanding selalu integer dan tidak negatif.
- Borrowing/repayment principal memengaruhi account balance tetapi bukan operating income/expense.
- Interest/fee dilaporkan sesuai classification tanpa mengubah principal secara salah.
- Active principal settlement cumulative tidak melebihi original/amended outstanding.
- Concurrent settlement memakai latest outstanding dan stale `row_version` ditolak.
- Idempotent retry menghasilkan satu settlement dan satu cash movement.
- Reverse settlement mengembalikan outstanding dan membatalkan efek ledger tepat satu kali.
- External counterparty tidak dapat dipalsukan sebagai user.
- Cross-ownership ditolak backend.
- Cancelled/reversed ledger relation terdeteksi integrity check.
- Backup/restore mempertahankan relation dan tidak menduplikasi settlement.

## Risks

- Salah memisahkan cash direction dan economic classification dapat merusak laporan.
- Principal + interest pada satu pembayaran dapat double-count jika component contract tidak konsisten.
- Internal cost-share yang otomatis diubah menjadi debt dapat membuat kewajiban palsu.
- External counterparty merupakan data privat dan perlu projection/export policy.

## Decision

Accounting semantics di atas menjadi design baseline: **obligation terpisah dari ledger, principal memengaruhi saldo tetapi bukan operating income/expense, dan settlement memakai event ledger yang link ke cash transaction canonical.**

RFC tetap Proposed. Belum ada approval schema, economic-classification field final, external-counterparty schema, migration, API, atau UI implementation.

## Links

- `0011-transaction-lifecycle-receipts-and-usage.md`
- `0013-contribution-and-cost-sharing.md`
- `../TURSO_SCHEMA.md`
- `../DATA_DICTIONARY.md`

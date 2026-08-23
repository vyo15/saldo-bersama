# RFC-0019 Transaction Line Items for Multi-Category / Multi-Kebutuhan Payments

**Status:** Proposed, problem/invariants registered
**Owner:** Product owner + finance-domain owner
**Reviewers:** Backend, reporting, planning, QA, recovery owner
**Date:** 2026-08-23
**Last reviewed:** 2026-08-23 against schema v12

## Problem

Schema v12 menyimpan satu `transactions.category_id` dan satu `transactions.envelope_period_id`. Akibatnya satu pembayaran nyata seperti struk supermarket yang berisi beberapa kategori atau Kebutuhan hanya dapat dicatat dengan memecahnya menjadi beberapa transaksi cash ledger. Workaround tersebut membuat satu pembayaran bank terlihat sebagai beberapa cash movement dan menyulitkan reconciliation, receipt relation, refund, cost sharing, dan audit.

RFC ini mendaftarkan gap tersebut tanpa mengubah ledger runtime sebelum model header/line, migration, report, refund, backup/restore, dan UI contract disetujui.

## Goals

- Satu cash movement memengaruhi saldo rekening tepat sekali.
- Satu transaksi dapat mempunyai beberapa line item kategori/Kebutuhan.
- Semua nominal line integer Rupiah dan jumlah active line tepat sama dengan amount transaksi header.
- Setiap line mempunyai category yang valid untuk transaction type dan, bila memakai Alokasi Dana, relation period/rule/account yang valid.
- Report kategori/Kebutuhan menghitung line; cash-flow/account balance tetap menghitung header sehingga tidak double-count.
- Edit/cancel/refund/reconciliation/backup/restore tetap dapat direkonstruksi secara deterministik.
- Existing transaksi singular schema v12 tetap valid tanpa rewrite histori heuristik.

## Non-goals MVP

- Tidak mendukung satu pembayaran dengan beberapa rekening sumber/tujuan. Multi-source payment tetap beberapa cash movement canonical.
- Tidak menyimpan line item sebagai JSON bebas di `transactions`.
- Tidak auto-membagi nominal berdasarkan tebakan merchant/category.
- Tidak mengubah cost-share participant menjadi category line atau sebaliknya.
- Tidak membuat receipt OCR sebagai authority.

## Design boundary

### Header vs line

Baseline yang perlu di-review adalah memisahkan **cash header** dari **classification/planning line**. Header transaksi tetap menjadi authority untuk account direction, total amount, status, idempotency, audit, reconciliation relation, dan cash-flow date. Child line menjadi authority untuk pembagian amount ke category/Kebutuhan.

Nama tabel/kolom final belum disetujui. Kandidat `transaction_lines` hanya nama desain, bukan schema runtime.

### Required invariants

Untuk transaksi yang memakai line model:

1. `SUM(active_line.amount) = transactions.amount` dalam satu guarded transaction;
2. setiap line amount integer `> 0`;
3. category line wajib sesuai transaction type;
4. parent category non-leaf future RFC-0014 tidak selectable untuk new line;
5. `envelope_period_id` line optional tetapi jika ada harus cocok dengan category/Kebutuhan, source account, period, ownership, assignee, dan capability existing;
6. satu line tidak boleh mengurangi Alokasi Dana lebih dari sekali;
7. cancel header menonaktifkan seluruh financial effect line secara atomik, bukan per-line cash reversal;
8. edit line memakai latest header/line version dan menolak stale write;
9. client tidak dapat mengirim total header yang berbeda dari validated sum line;
10. audit menyimpan perubahan line secara aman tanpa menjadikan client actor/owner authority.

### Compatibility policy

Existing schema v12 transaction tanpa child line tetap dibaca sebagai satu implicit line dari `category_id` + `envelope_period_id`. Migration tidak boleh membuat duplicate financial effect. Pilihan antara deterministic backfill child row vs compatibility projection harus diputuskan pada migration plan dan dibuktikan lewat report/balance parity tests.

Setelah runtime line model aktif, write baru tidak boleh memelihara dua source of truth category/allocation yang dapat drift. Legacy columns dapat dipertahankan sementara untuk compatibility hanya dengan invariant yang eksplisit dan forward-fix plan.

## Reporting and planning

- Account balance/cash-flow memakai transaction header tepat sekali.
- Category, Kebutuhan, Alokasi spending breakdown memakai line item.
- Aggregate parent category future RFC-0014 roll-up dari line tanpa double-count header.
- Cost sharing RFC-0013 tetap berbasis transaction total sampai RFC lanjutan secara eksplisit memilih apakah split per-line dibutuhkan.
- Dashboard recent transaction tetap menampilkan satu pembayaran; detail dapat membuka breakdown line.

## Refund boundary

Original-expense relation RFC-0013 wajib menjadi authority untuk refund. Sebelum line-level refund disetujui, linked refund tidak boleh menebak line mana yang dipulihkan. Partial refund terhadap multi-line expense memerlukan explicit allocation atau deterministic policy tersendiri dan cumulative cap tetap tidak boleh melebihi original amount.

## Reconciliation and receipt

Satu bank statement payment harus cocok dengan satu transaction header. Receipt RFC-0011 boleh mempunyai line metadata/presentation, tetapi raw receipt/OCR bukan authority nominal line tanpa konfirmasi server-validated user intent.

## Migration / backup / restore requirements before acceptance

Sebelum RFC dapat menjadi Accepted, plan wajib menentukan:

- schema child + foreign key/index/uniqueness;
- legacy compatibility/backfill policy;
- atomic create/edit/cancel transaction + lines + envelope consumption;
- row-version model header/line;
- idempotency fingerprint semantics;
- backup version compatibility dan restore normalization;
- export/import representation dan formula-neutralization;
- integrity checks untuk sum mismatch, dangling category/envelope, duplicate consumption, dan report parity;
- rollback/forward-fix tanpa DROP destructive pada Production.

## Acceptance criteria before runtime implementation

- Balance parity tidak berubah untuk histori v12.
- Satu payment multi-line mengubah source/destination balance tepat sekali.
- Total line tidak dapat berbeda satu Rupiah pun dari header.
- Category/Kebutuhan report tepat dan tidak double-count.
- Envelope consumption per line tidak dapat melebihi available planning capacity/policy.
- Concurrent edit stale ditolak.
- Retry idempotent tidak membuat header/line kedua.
- Cancel/restore menjaga relation line dan audit.
- Refund tidak mengembalikan line secara heuristik.
- Backup/restore/import/integrity memverifikasi seluruh relation.

## Unresolved decisions

RFC tetap Proposed sampai owner memilih dan menyetujui secara eksplisit:

1. schema final child line dan strategy legacy columns;
2. apakah income/refund juga memakai multi-line pada MVP atau expense saja;
3. semantics line-level cost sharing;
4. semantics partial refund terhadap multi-line expense;
5. row-version ownership antara header dan child line;
6. UI edit model dan maximum line count untuk mobile performance.

## Decision

Gap multi-kategori/multi-Kebutuhan resmi menjadi product requirement, tetapi **tidak ada approval migration/API/runtime** pada RFC ini. Array JSON pada `transactions` dan pemecahan satu cash movement menjadi beberapa ledger transaction tidak menjadi solusi canonical.

## Links

- `0011-transaction-lifecycle-receipts-and-usage.md`
- `0013-contribution-and-cost-sharing.md`
- `0014-category-hierarchy-and-goal-stages.md`
- `../DATA_DICTIONARY.md`
- `../API_CONTRACT.md`
- `../../database/migrations/001_initial_schema.sql`

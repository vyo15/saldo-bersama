# ADR-0011 Investasi manual memakai RDN canonical dan history append-only

**Status:** Accepted
**Date:** 2026-09-02

## Context

Saldo Bersama perlu mencatat portfolio broker secara manual tanpa menjadi broker, tanpa menyimpan credential Ajaib, dan tanpa live-market dependency. Domain baru harus menjaga invariant ledger existing: transfer internal bukan income/expense, browser bukan financial authority, saldo harus dapat direkonstruksi, retry tidak boleh menggandakan mutation, serta backup/restore harus mempertahankan history authoritative.

Menyimpan `holding`, `market_value`, atau saldo RDN sebagai angka mutable independen akan menciptakan dua authority dan berisiko double-count. Mengubah Buy menjadi expense atau Sell menjadi ordinary income juga akan merusak cashflow dan laporan existing.

## Decision

1. Setiap portfolio memakai tepat satu rekening canonical `account_type=investment` sebagai RDN. Tidak ada tabel saldo RDN kedua.
2. Deposit/withdraw Bank↔RDN memakai Transfer ledger existing dan tetap netral terhadap income/expense.
3. Buy/Sell disimpan pada `investment_trades` dan memengaruhi saldo RDN melalui view canonical `investment_account_events`; Buy/Sell tidak dibuat sebagai transaction income/expense.
4. Holding, weighted remaining cost basis, market value, realized P/L, dan unrealized P/L adalah backend read-model yang diturunkan dari trade/correction/valuation history. Harga manual adalah snapshot append-only; trade terakhir menjadi fallback harga bila belum ada valuation.
5. Buy hanya menerima instrument aktif. Holding instrument yang kemudian inactive tetap dapat dijual agar pengguna tidak terjebak pada posisi yang tidak dapat ditutup.
6. Mutation portfolio memvalidasi actor/ownership, integer Rupiah, lot/share, fee, chronology, available RDN, optimistic `row_version`, dan idempotency dispatcher existing. Event sebelum `accounts.initial_balance_date` RDN ditolak. Trade baru pada/sebelum reconciliation checkpoint terbaru juga ditolak; historical difference setelah checkpoint memakai correction explicit.
7. Reconciliation membandingkan state canonical **as-of tanggal reconciliation** dan tidak auto-adjust. Mismatch hanya dapat diperbaiki melalui explicit Administrator correction yang audited dan append-only; trade history lama tidak ditulis ulang.
8. Backup schema v15 menyimpan enam tabel Investment authoritative. Restore v3-v14 tetap additive-compatible tanpa mengarang histori Investment; restore v15 hanya definitive setelah foreign-key dan business-integrity check membuktikan RDN/holding/cost-basis/P&L/ledger parity.
9. Frontend dan Dashboard hanya memakai backend read-model `investments.overview`; UI tidak menghitung financial authority sendiri.

## Consequences

- Net worth/cashflow tidak double-count ketika uang berpindah Bank→RDN→holding.
- Unrealized gain/loss tidak muncul sebagai income/expense; realized P/L dipisahkan dari ordinary cashflow.
- Portfolio dapat direkonstruksi dan diaudit dari history canonical.
- Simultaneous sell/stale edit dapat ditolak lewat transaction + `row_version`; retry intent memakai idempotency key yang sama.
- Correction lebih verbose daripada overwrite langsung, tetapi menjaga data integrity dan recovery evidence.
- V1 tetap manual: tidak ada login Ajaib, scraping, broker API, live price, auto-sync, atau auto-trading.

## Alternatives

- **RDN/holding sebagai saldo mutable terpisah:** ditolak karena menciptakan dual authority dan sulit direkonsiliasi.
- **Buy sebagai expense dan Sell sebagai income:** ditolak karena mengotori cashflow dan menyalahi transfer/investment accounting contract.
- **Auto-adjust saat reconciliation:** ditolak karena menjadikan reconciliation backdoor rewrite history.
- **Menyimpan broker credential untuk sync otomatis:** ditolak untuk V1 karena memperluas security/privacy boundary tanpa kebutuhan canonical.

## References

- `database/migrations/013_investment_tracking.sql`
- `api/_lib/services/investments.js`
- `api/_lib/services/readModels.js`
- `api/_lib/services/reporting/integrity.js`
- `docs/product/PRODUCT_REQUIREMENTS.md`
- `docs/API_CONTRACT.md`
- `docs/RECOVERY_RUNBOOK.md`

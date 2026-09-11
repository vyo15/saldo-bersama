# ADR-0011 Investasi manual memakai RDN canonical dan history append-only

**Status:** Accepted
**Date:** 2026-09-02

## Amendment schema v17 (11 September 2026)

Keputusan RDN-ledger di bawah ini tetap authoritative untuk **histori v15/v16 dan compatibility/recovery**, tetapi tidak lagi menjadi mental model atau cash prerequisite untuk pencatatan investasi baru. Schema v17 mengadopsi UI/flow asset-centric: user menambah saham/reksa dana langsung melalui `investments.assets.create`; backend boleh mempertahankan portfolio + rekening investment tersembunyi hanya untuk FK legacy. Direct opening-position dan Buy/Sell v17 memakai `cash_effect_enabled=0`, sehingga tidak mengubah rekening dan tidak memerlukan saldo RDN. Existing row mendapat default `cash_effect_enabled=1`, sehingga histori lama tetap identik. Total investasi user-facing menggunakan `market_value`; `rdn_cash`/`portfolio_value` dipertahankan sebagai compatibility read-model.

## Context

Saldo Bersama perlu mencatat aset investasi aktual secara manual—rekening RDN, saham yang dimiliki, transaksi beli/jual yang sudah dilakukan, harga manual, dan hasil investasinya—tanpa menjadi broker, tanpa menyimpan credential aplikasi investasi, dan tanpa live-market dependency. Domain baru harus menjaga invariant ledger existing: transfer internal bukan income/expense, browser bukan financial authority, saldo harus dapat direkonstruksi, retry tidak boleh menggandakan mutation, serta backup/restore harus mempertahankan history authoritative.

Menyimpan `holding`, `market_value`, atau saldo RDN sebagai angka mutable independen akan menciptakan dua authority dan berisiko double-count. Mengubah Buy menjadi expense atau Sell menjadi ordinary income juga akan merusak cashflow dan laporan existing.

## Decision

1. Setiap portfolio memakai tepat satu rekening canonical `account_type=investment` sebagai RDN. Tidak ada tabel saldo RDN kedua.
2. Deposit/withdraw Bank↔RDN memakai Transfer ledger existing dan tetap netral terhadap income/expense.
3. Buy/Sell disimpan pada `investment_trades` dan memengaruhi saldo RDN melalui view canonical `investment_account_events`; Buy/Sell tidak dibuat sebagai transaction income/expense.
4. Holding, weighted remaining cost basis, market value, realized P/L, dan unrealized P/L adalah backend read-model yang diturunkan dari trade/correction/valuation history. Harga manual adalah snapshot append-only; trade terakhir menjadi fallback harga bila belum ada valuation.
5. Buy hanya menerima instrument aktif. Holding instrument yang kemudian inactive tetap dapat dijual agar pengguna tidak terjebak pada posisi yang tidak dapat ditutup.
6. Mutation portfolio memvalidasi actor/ownership, integer Rupiah, lot/share, fee, chronology, available RDN, optimistic `row_version`, dan idempotency dispatcher existing. Event sebelum `accounts.initial_balance_date` RDN ditolak. Trade baru pada/sebelum reconciliation checkpoint terbaru juga ditolak; historical difference setelah checkpoint memakai correction explicit.
7. Reconciliation membandingkan state canonical **as-of tanggal reconciliation** dan tidak auto-adjust. Mismatch hanya dapat diperbaiki melalui explicit Administrator correction yang audited dan append-only; trade history lama tidak ditulis ulang.
8. Backup schema v17 menyimpan enam tabel Investment authoritative beserta field opening-position/trade notes, `is_system_hidden`, dan `cash_effect_enabled`. Restore v3-v16 tetap additive-compatible tanpa mengarang histori Investment; restore baru definitive setelah foreign-key dan business-integrity check membuktikan holding/cost-basis/P&L/cash-effect/ledger parity.
9. Frontend dan Dashboard hanya memakai backend read-model `investments.overview`; UI tidak menghitung financial authority sendiri. Rekening Investasi adalah pintu ke **Saldo RDN** dan detail aset aktual; saham ditampilkan per lot pada UI, sedangkan share quantity tetap detail internal/backend. Detail holding menampilkan weighted cost basis, harga terakhir tercatat, nilai, realized/unrealized P/L, serta histori trade/valuation/correction yang memang tersimpan.
10. Field teknis `investment_portfolios.broker` dipertahankan sebagai metadata compatibility dan client canonical memakai `other`. `investment_portfolios.name` boleh menyimpan label sumber catatan opsional seperti `Ajaib`, tetapi bukan identitas koneksi broker; setup tidak meminta pilihan broker atau nama portfolio wajib.
11. Kondisi investasi yang sudah ada sebelum aplikasi dicatat melalui semantic event `opening_position` append-only, bukan fake Buy atau Transfer. Event aset membawa share quantity, cost basis, reference price, dan optional delta Cash RDN; baseline Saldo RDN juga boleh berdiri sendiri dengan `instrument_id=NULL`, share/cost nol, dan cash delta nonzero. Fase opening hanya terbuka sebelum aktivitas investasi reguler.
12. Continuation Investasi memakai satu contract konseptual `{source, action, returnTo, payload}` sambil tetap membaca state legacy. RDN creation dan Transfer kembali ke konteks Investasi; draft Buy dipertahankan ketika perlu funding dan return path dibatasi ke path internal.
13. Satu portfolio tetap terikat eksplisit ke satu RDN. Multi-RDN dibedakan lewat qualifier presentasional/canonical account name + ownership tanpa membuat ledger baru; setelah Sell, penarikan dari RDN adalah action opsional, bukan continuation wajib.
14. RDN bersifat transfer-only pada ledger transaksi biasa: income/expense/refund/adjustment baru tidak boleh menunjuk RDN; Buy/Sell/Koreksi tetap memakai event Investasi canonical.
15. Dashboard memisahkan cash operasional dan investasi. `totalBalance` tetap all-readable untuk compatibility, `nonInvestmentBalance` menjadi **Saldo rekening**, sedangkan safe-to-spend/daily-safe/unallocated/reserved recurring mengecualikan RDN.
16. Alokasi Dana dan Jadwal Rutin baru tidak boleh memakai RDN. Data legacy tetap readable/archivable tetapi tidak boleh mengikat Cash RDN atau menjalankan capability operasional/pembayaran.
17. Laporan boleh menampilkan snapshot **Total kekayaan tercatat · saat ini** sebagai `nonInvestmentBalance + portfolio_value`. Historical market-value tidak disintesis dari valuation saat ini. Read-model tren tetap boleh membawa `totalBalance` yang merekonsiliasi `investment_account_events` untuk compatibility, tetapi presentation **Saldo utama** wajib memakai `nonInvestmentBalance` agar RDN tidak terbaca dua kali.

## Consequences

- Net worth/cashflow tidak double-count ketika uang berpindah Bank→RDN→holding.
- Unrealized gain/loss tidak muncul sebagai income/expense; realized P/L dipisahkan dari ordinary cashflow.
- Portfolio dapat direkonstruksi dan diaudit dari history canonical.
- Simultaneous sell/stale edit dapat ditolak lewat transaction + `row_version`; retry intent memakai idempotency key yang sama.
- Correction lebih verbose daripada overwrite langsung, tetapi menjaga data integrity dan recovery evidence.
- V1 tetap manual: tidak ada login aplikasi investasi, scraping, broker API, live price, auto-sync, order execution, atau auto-trading.

## Alternatives

- **RDN/holding sebagai saldo mutable terpisah:** ditolak karena menciptakan dual authority dan sulit direkonsiliasi.
- **Buy sebagai expense dan Sell sebagai income:** ditolak karena mengotori cashflow dan menyalahi transfer/investment accounting contract.
- **Auto-adjust saat reconciliation:** ditolak karena menjadikan reconciliation backdoor rewrite history.
- **Menyimpan broker credential untuk sync otomatis:** ditolak untuk V1 karena memperluas security/privacy boundary tanpa kebutuhan canonical.

## References

- `database/migrations/013_investment_tracking.sql`
- `database/migrations/014_investment_opening_position.sql`
- `api/_lib/services/investments.js`
- `api/_lib/services/readModels.js`
- `api/_lib/services/reporting/integrity.js`
- `docs/product/PRODUCT_REQUIREMENTS.md`
- `docs/API_CONTRACT.md`
- `docs/RECOVERY_RUNBOOK.md`

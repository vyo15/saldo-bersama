# RFC-0012 Debt and Receivable Ledger

**Status:** Proposed  
**Owner:** Product owner + finance-domain owner  
**Reviewers:** Backend, QA, recovery owner  
**Date:** 2026-08-02

## Problem

Utang/piutang memiliki kontrak, pihak terkait, jatuh tempo, saldo tersisa, pencairan, cicilan, dan settlement. Menambah `debt`/`receivable` langsung ke `transaction_type` berisiko menghitung saldo dan laporan dua kali.

## Goals

- Pisahkan obligation dari cash movement.
- Setiap pencairan/settlement yang benar-benar memindahkan uang menghasilkan transaksi ledger.
- Sisa kewajiban dapat direkonstruksi dan diaudit.

## Proposed solution

Entitas kandidat: `obligations`, `obligation_parties`, `obligation_payments`, dan link ke `transactions`. Type debt/receivable, principal integer, due date, status, scope/owner, row version. Payment apply harus transaction + obligation update dalam satu database transaction dan idempotency key.

## Impact

Frontend halaman Utang/Piutang; API list/create/settle/reverse; migration additive; authorization scope; laporan obligation terpisah dari expense; backup/import/export diperluas.

## Migration and rollback

Tidak mengonversi transaksi lama otomatis. Import harus preview. Rollback menggunakan forward-fix karena transaction links tidak boleh hilang.

## Test and acceptance criteria

- Principal/sisa tidak negatif.
- Settlement tidak menggandakan expense/income.
- Reverse settlement mengembalikan sisa dan cancel transaksi tepat satu kali.
- Cross-ownership ditolak.
- Audit dan restore parity lulus.

## Risks

Interpretasi akuntansi salah, double counting, dan perubahan setelah cicilan.

## Decision

Pending domain examples dan approval schema.

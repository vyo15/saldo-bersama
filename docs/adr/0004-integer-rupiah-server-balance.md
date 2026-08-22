# ADR-0004 Integer Rupiah dan saldo server-side

**Status:** Accepted
**Date:** 2026-08-02

## Decision
Nominal disimpan sebagai integer Rupiah. Saldo dihitung dari saldo awal dan transaksi aktif.

## Consequences
Tidak ada float Rupiah atau editable balance. Transfer tidak masuk income/expense. Perhitungan canonical berada di API/database.

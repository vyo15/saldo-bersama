# ADR-0005 Idempotency, row version, dan soft cancel

**Status:** Accepted  
**Date:** 2026-08-02

## Decision
Write kritis memakai idempotency key; edit memakai optimistic `row_version`; transaksi normal dibatalkan/diarsipkan, bukan hard delete.

## Consequences
Retry harus memakai key sama, conflict menghasilkan 409, audit dan ledger history tetap dapat direkonstruksi.

# ADR-0001 Turso sebagai source of truth

**Status:** Accepted  
**Date:** 2026-08-02

## Context
Spreadsheet tidak cukup kuat untuk transaction, conflict, idempotency, dan integrity guard.

## Decision
Seluruh data finansial canonical disimpan di Turso dan hanya diakses melalui backend.

## Consequences
Schema migration, transaction, backup, parity, dan server authorization menjadi wajib. Sheets tidak boleh menerima write balik.

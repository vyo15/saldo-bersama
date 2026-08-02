# ADR-0007 Satu database Turso untuk Development dan Production

**Status:** Accepted with known risk  
**Date:** 2026-08-02

## Context
Pemilik memilih satu database agar setup lintas perangkat sederhana.

## Decision
Development lokal dan Production memakai database Turso yang sama; Preview tidak diberi akses.

## Consequences
Data dummy, migration eksperimen, import, restore, purge, dan destructive test dilarang. Perubahan menuju database terpisah harus melalui RFC sebelum tim berkembang.

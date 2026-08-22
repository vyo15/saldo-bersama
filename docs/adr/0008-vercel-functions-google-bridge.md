# ADR-0008 Vercel Functions dan Google Apps Script bridge

**Status:** Accepted
**Date:** 2026-08-02

## Decision
Vercel Functions menjalankan auth/business logic/Turso access. Apps Script hanya bridge bertanda tangan untuk Sheets, Calendar, Drive, dan scheduler.

## Consequences
Secret bridge harus sinkron dua sisi; endpoint Apps Script tidak boleh memiliki business logic finansial.

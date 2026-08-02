# ADR-0002 Google Sheets sebagai mirror satu arah

**Status:** Accepted  
**Date:** 2026-08-02

## Decision
Sheets hanya memuat data `shared` untuk laporan dan dapat dibangun ulang dari Turso.

## Consequences
Business logic tidak berada di Apps Script; data personal tidak dimirror; edit manual Sheets tidak memengaruhi Turso.

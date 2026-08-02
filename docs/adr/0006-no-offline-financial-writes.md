# ADR-0006 Tidak ada offline financial writes

**Status:** Accepted  
**Date:** 2026-08-02

## Decision
PWA meng-cache app shell tetapi menolak write ketika offline dan tidak menyimpan queue transaksi di browser.

## Consequences
Tidak ada status sukses ambigu atau duplicate saat reconnect; pengguna harus online untuk perubahan data.

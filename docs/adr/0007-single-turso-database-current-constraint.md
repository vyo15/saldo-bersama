# ADR-0007 Satu database Turso untuk runtime lokal dan Production

**Status:** Accepted with known risk  
**Date:** 2026-08-02

## Context
Pemilik memilih satu database agar setup lintas perangkat sederhana dan tidak ada database Development/Production terpisah.

## Decision
Runtime lokal membaca `.env.local`, sedangkan deployment cloud hanya memakai Vercel Production. Keduanya mengakses database Turso yang sama. Vercel Preview dan Development tidak diberi environment aplikasi.

`.env.local` tidak ditarik otomatis dari Vercel. Secret lokal dipindahkan melalui penyimpanan rahasia yang disetujui karena sensitive Production variables tidak dapat dijadikan mekanisme bootstrap yang dapat dibaca kembali.

## Consequences
Data dummy, migration eksperimen, import, restore, purge, dan destructive test dilarang. Backup wajib sebelum migration atau operasi besar. Perubahan menuju database terpisah atau penambahan scope Vercel lain harus melalui RFC dan approval.

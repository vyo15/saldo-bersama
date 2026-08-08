# ADR-0007 Satu database Turso untuk runtime lokal dan Production

**Status:** Accepted with known risk; environment-bootstrap portion superseded by ADR-0010  
**Date:** 2026-08-02  
**Updated:** 2026-08-08

## Context
Pemilik memilih satu database agar setup lintas perangkat sederhana dan tidak ada database Development/Production terpisah.

## Decision
Runtime lokal membaca `.env.local`, sedangkan deployment cloud memakai Vercel Production. Keduanya mengakses database Turso yang sama. Vercel Preview tetap kosong.

Keputusan awal bahwa Vercel Development kosong dan `.env.local` tidak ditarik otomatis sudah digantikan oleh ADR-0010. Vercel Development sekarang menjadi sumber bootstrap untuk komputer tepercaya. Runtime lokal tetap tidak pernah menarik secret dari scope Production.

## Consequences
Data dummy, migration eksperimen, import, restore, purge, dan destructive test dilarang. Backup wajib sebelum migration atau operasi besar. Penggunaan satu database tetap menjadi keputusan aktif. Perubahan menuju database terpisah atau scope runtime baru selain Development/Production yang telah disetujui harus melalui RFC dan approval.

Bootstrap, refresh, dan kebijakan environment Development mengikuti `docs/adr/0010-vercel-development-environment-bootstrap.md`.

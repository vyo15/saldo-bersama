# ADR-0007 Satu database Turso untuk runtime lokal dan Production

**Status:** Superseded — historical single-database constraint; current runtime requires isolated Development/Production
**Date:** 2026-08-02
**Updated:** 2026-08-25

## Context
Pemilik memilih satu database agar setup lintas perangkat sederhana dan tidak ada database Development/Production terpisah. Pada fase saat ini aplikasi belum go-live dan data finansial yang dimasukkan masih dapat berupa trial/error.

## Decision
Keputusan satu database pada ADR ini **tidak lagi menjadi runtime yang didukung**. Source/test aktual mewajibkan Development dan Production memakai Turso URL/token, `SESSION_SECRET`, VAPID, dan binding `database_environment` yang terpisah; sharing fail-closed. Vercel Preview tetap kosong.

Keputusan bootstrap awal juga sudah digantikan oleh ADR-0010: Vercel Development menjadi sumber bootstrap `.env.local` pada workstation tepercaya, sedangkan Production memakai `.env.production.local` dan tidak pernah dipull dari scope Sensitive.

Riwayat satu database tetap dipertahankan di ADR ini hanya sebagai konteks migrasi. Runtime source terbaru **tidak mengizinkan Trial Reset pada database bersama/Production**: `reset.preview` dan `reset.apply` fail-closed kecuali `system_config.database_environment=development`. Dengan demikian maintenance action **Reset data testing** baru tersedia setelah database Development terisolasi dan terikat benar. Action tersebut tetap Administrator-only, preview + fingerprint, typed confirmation, acknowledgement, safety backup, maintenance lock, purge atomik, integrity check, audit, serta rebuild integrasi. Outcome `reset.apply` yang tidak pasti wajib direkonsiliasi melalui read action `reset.status`; retry destructive tidak pernah otomatis, dan maintenance hanya boleh dibuka setelah integrity check lulus.

## Consequences

- Backend tidak memiliki penanda yang dapat membedakan transaksi trial dan transaksi nyata. Semua data dalam scope preview dianggap data testing saat owner menjalankan maintenance reset.
- Pembersihan data testing tidak dijalankan otomatis atau terjadwal. Administrator harus memulai operasi secara eksplisit setelah membaca preview.
- Rekening, kategori, pengguna, konfigurasi, audit log, backup, push subscription, dan preference notifikasi dipertahankan.
- Begitu transaksi nyata mulai dicatat, maintenance reset massal tidak boleh digunakan lagi. Koreksi wajib melalui cancel/archive/restore/reverse sesuai lifecycle domain.
- Migration eksperimen, restore drill, SQL purge manual, dan destructive automated test tetap dilarang terhadap database aktif. Backup wajib sebelum migration atau operasi besar.
- Scheduled job boleh membersihkan state ephemeral yang sudah expired, seperti idempotency key dan preview import/restore, karena data tersebut bukan ledger maupun audit. Row berstatus `applying` tidak boleh dibersihkan oleh housekeeping.
- Perubahan menuju database terpisah atau scope runtime baru selain Development/Production yang telah disetujui harus melalui RFC dan approval.

Bootstrap, refresh, dan kebijakan environment Development mengikuti `docs/adr/0010-vercel-development-environment-bootstrap.md`.

## Approved exit plan (historical)

Plan berikut adalah urutan cutover yang membawa project keluar dari constraint satu-database. Source v16 sekarang menganggap isolasi ini sebagai invariant runtime dan checker menolak profile yang berbagi database/token/session/VAPID. Evidence operasional tetap harus dipertahankan, tetapi ADR ini tidak lagi memberi izin untuk kembali ke satu database.

Urutan cutover historis:

1. Buat database Turso Development baru tanpa menyalin credential Production ke source/chat/log.
2. Terapkan seluruh migration canonical sampai schema v16 pada database Development.
3. Bind database tersebut secara eksplisit dengan `npm run db:bind-environment -- development`; rebind silang wajib ditolak.
4. Verifikasi `timezone=Asia/Jakarta`, `currency=IDR`, foreign key, dan business integrity.
5. Isi Vercel Development `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, dan `DATABASE_ENVIRONMENT=development` dengan scope Development. Production tetap memakai credential Production dan `DATABASE_ENVIRONMENT=production`.
6. Pastikan `.env.local` yang ditarik oleh `npm run dev` sekarang menunjuk Development.
7. Jalankan test/smoke development dengan data dummy hanya pada database Development.
8. Verifikasi Production tetap membaca database Production yang benar sebelum dan sesudah perubahan.
9. Setelah isolation terbukti, rotasi token Turso dan `SESSION_SECRET` per environment agar credential Development dan Production tidak identik.
10. Simpan evidence berupa nama/scope resource dan hasil health/integrity tanpa nilai secret.

Exit criteria teknis kini diwujudkan sebagai guard source/test: Development dan Production harus berbeda dan terikat ke environment masing-masing. Smoke/integrity/rollback evidence tetap bagian release/operations checklist; kegagalannya harus diperbaiki tanpa menghidupkan kembali sharing database.

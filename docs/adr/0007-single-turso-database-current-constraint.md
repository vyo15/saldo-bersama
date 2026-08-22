# ADR-0007 Satu database Turso untuk runtime lokal dan Production

**Status:** Accepted with known risk; environment-bootstrap portion superseded by ADR-0010
**Date:** 2026-08-02
**Updated:** 2026-08-17

## Context
Pemilik memilih satu database agar setup lintas perangkat sederhana dan tidak ada database Development/Production terpisah. Pada fase saat ini aplikasi belum go-live dan data finansial yang dimasukkan masih dapat berupa trial/error.

## Decision
Runtime lokal membaca `.env.local`, sedangkan deployment cloud memakai Vercel Production. Keduanya mengakses database Turso yang sama. Vercel Preview tetap kosong.

Keputusan awal bahwa Vercel Development kosong dan `.env.local` tidak ditarik otomatis sudah digantikan oleh ADR-0010. Vercel Development sekarang menjadi sumber bootstrap untuk komputer tepercaya. Runtime lokal tetap tidak pernah menarik secret dari scope Production.

Satu database tetap dipakai. Tidak dibuat database testing kedua. Selama fase pra-go-live, Administrator boleh memakai maintenance action **Reset data testing** untuk mengosongkan aktivitas/perencanaan dan projection/queue testing yang dinyatakan pada preview. Action tersebut wajib Administrator-only, preview + fingerprint, typed confirmation, acknowledgement, safety backup, maintenance lock, purge atomik, integrity check, audit, serta rebuild integrasi. Outcome `reset.apply` yang tidak pasti wajib direkonsiliasi melalui read action `reset.status`; retry destructive tidak pernah otomatis, dan maintenance hanya boleh dibuka setelah integrity check lulus.

## Consequences

- Backend tidak memiliki penanda yang dapat membedakan transaksi trial dan transaksi nyata. Semua data dalam scope preview dianggap data testing saat owner menjalankan maintenance reset.
- Pembersihan data testing tidak dijalankan otomatis atau terjadwal. Administrator harus memulai operasi secara eksplisit setelah membaca preview.
- Rekening, kategori, pengguna, konfigurasi, audit log, backup, push subscription, dan preference notifikasi dipertahankan.
- Begitu transaksi nyata mulai dicatat, maintenance reset massal tidak boleh digunakan lagi. Koreksi wajib melalui cancel/archive/restore/reverse sesuai lifecycle domain.
- Migration eksperimen, restore drill, SQL purge manual, dan destructive automated test tetap dilarang terhadap database aktif. Backup wajib sebelum migration atau operasi besar.
- Scheduled job boleh membersihkan state ephemeral yang sudah expired, seperti idempotency key dan preview import/restore, karena data tersebut bukan ledger maupun audit. Row berstatus `applying` tidak boleh dibersihkan oleh housekeeping.
- Perubahan menuju database terpisah atau scope runtime baru selain Development/Production yang telah disetujui harus melalui RFC dan approval.

Bootstrap, refresh, dan kebijakan environment Development mengikuti `docs/adr/0010-vercel-development-environment-bootstrap.md`.

## Approved exit plan

Pemisahan Development dan Production telah disetujui sebagai target hardening, tetapi **belum dianggap efektif hanya karena source berubah**. Sampai bukti environment menunjukkan dua database berbeda, keputusan runtime aktual pada bagian Decision tetap berlaku dan semua larangan destructive terhadap database aktif tetap wajib.

Urutan cutover:

1. Buat database Turso Development baru tanpa menyalin credential Production ke source/chat/log.
2. Terapkan seluruh migration canonical sampai schema v11 pada database Development.
3. Verifikasi `timezone=Asia/Jakarta`, `currency=IDR`, foreign key, dan business integrity.
4. Isi Vercel Development `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` dengan database/token Development. Production tetap memakai database/token Production.
5. Pastikan `.env.local` yang ditarik oleh `npm run dev` sekarang menunjuk Development.
6. Jalankan test/smoke development dengan data dummy hanya pada database Development.
7. Verifikasi Production tetap membaca database lama yang benar sebelum dan sesudah perubahan.
8. Setelah isolation terbukti, rotasi token Turso dan `SESSION_SECRET` per environment agar credential Development dan Production tidak identik.
9. Simpan evidence berupa nama/scope resource dan hasil health/integrity tanpa nilai secret.

Exit criteria ADR single-database terpenuhi hanya bila Development dan Production terbukti memakai database berbeda, smoke kedua runtime lulus, dan rollback path telah diverifikasi. Setelah itu ADR baru/superseding decision harus mencatat kondisi final; jangan mengubah status ADR ini menjadi superseded sebelum cutover nyata selesai.

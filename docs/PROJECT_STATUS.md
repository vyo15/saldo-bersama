# Project Status

**Last source verification:** 2026-08-02
**Repository:** `vyo15/saldo-bersama`
**Branch baseline:** `main`
**Schema:** version 3, migration `database/migrations/001_initial_schema.sql`
**Runtime baseline:** Node 24.x, npm 10+

Dokumen ini adalah snapshot status, bukan pengganti source. Perbarui pada setiap PR/task yang mengubah implementasi, keputusan, risiko, dokumentasi canonical, atau next step.

## Arsitektur aktif

- React 19 + React Router + Vite PWA.
- Firebase Google Authentication dan signed HttpOnly session.
- Lima Vercel Functions canonical: session, gateway, export, health, jobs.
- Turso/libSQL sebagai source of truth.
- Apps Script sebagai HMAC-protected bridge untuk Sheets mirror, Calendar, Drive backup, dan scheduler.
- Google Sheets hanya mirror `shared`; data personal tetap di Turso.
- Web Push melalui queue backend.

## Status implementasi dan aktivasi

- Auth, authorization, transaksi, saldo, transfer, idempotency, optimistic conflict, audit, planning, report, integration outbox, export XLSX, backup/restore guard, PWA, dan push tersedia pada source.
- Status “Implemented” tidak otomatis berarti integrasi telah dikonfigurasi atau diverifikasi pada resource nyata; lihat `IMPLEMENTATION_MATRIX.md`.
- Production migration tetap **pending real-data parity**.
- Backup/restore sudah diimplementasikan tetapi **real-resource drill wajib**.
- Google bridge dan Web Push hanya aktif bila grup environment terkait lengkap; real-resource/device test tetap diperlukan.
- Browser E2E, automated accessibility, visual regression, dan performance budget belum tersedia.
- Alerting dan retensi observability eksternal belum lengkap.

## Keputusan/risiko aktif

1. Runtime lokal dan Vercel Production memakai satu database Turso sesuai keputusan pemilik. Ini meningkatkan risiko eksperimen terhadap data production. Jangan mengubah atau memisahkan tanpa RFC/approval; jangan gunakan data dummy atau operasi destruktif.
2. Vercel hanya memakai scope Production. Preview dan Vercel Development tidak diberi environment aplikasi.
3. Environment canonical terdiri dari delapan key core wajib dan satu key logging opsional yang ikut disinkronkan ke Production.
4. Rate limit runtime masih best-effort per instance.
5. Backup teknis terkompresi dan ber-checksum; enkripsi aplikasi belum menjadi baseline yang terbukti pada source.
6. Branch protection, repository ruleset, GitHub Security features, dan Vercel settings tidak dapat dibuktikan dari source; verifikasi dashboard masih diperlukan.

## Dokumentasi dan governance

- Schema overview dan data dictionary wajib mencatat setiap tabel migration, termasuk `request_nonces` untuk anti-replay scheduler/bridge.
- Required reading, local Markdown reference, index coverage, environment classification, dan cross-reference Git dijaga oleh `test/api/governance-docs.test.js`.
- One-time cutover legacy didokumentasikan di `LEGACY_SHEETS_TO_TURSO_CUTOVER.md`; kebijakan perubahan schema jangka panjang tetap di `DATABASE_MIGRATION_POLICY.md`.
- Setiap task yang mengubah project wajib memperbarui `PROJECT_STATUS.md`, `PROJECT_HANDOFF.md`, `CHANGELOG.md`, serta contract/ADR/runbook/matrix yang terdampak.

## Prioritas berikutnya

1. Terapkan GitHub branch protection/ruleset dan required `Quality` check.
2. Jalankan migration parity pada snapshot atau salinan terisolasi yang bersifat sementara.
3. Jalankan backup/restore real-resource drill.
4. Konfigurasikan dan uji Google bridge/Web Push bila fitur akan diaktifkan.
5. Lengkapi observability terminal logging, client crash reporting, metrics, dan alert.
6. Tambah Playwright E2E, axe accessibility, dan performance budget.
7. Tinjau ulang guard operasional database tunggal melalui RFC sebelum tim berkembang.

## Cara melanjutkan di chat baru

Minta agent membaca `../AGENTS.md`, `PROJECT_STATUS.md`, dan `PROJECT_HANDOFF.md`, lalu validasi source aktual. Jangan mengandalkan ringkasan percakapan sebagai source of truth.

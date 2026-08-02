# Project Status

**Last source verification:** 2026-08-02  
**Repository:** `vyo15/saldo-bersama`  
**Branch baseline:** `main`  
**Schema:** version 3, migration `database/migrations/001_initial_schema.sql`  
**Runtime baseline:** Node 24.x, npm 10+

Dokumen ini adalah snapshot status, bukan pengganti source. Perbarui pada setiap PR/task yang mengubah implementasi, keputusan, risiko, atau next step.

## Arsitektur aktif

- React 19 + React Router + Vite PWA.
- Firebase Google Authentication dan signed HttpOnly session.
- Lima Vercel Functions canonical: session, gateway, export, health, jobs.
- Turso/libSQL sebagai source of truth.
- Apps Script sebagai HMAC-protected bridge untuk Sheets mirror, Calendar, Drive backup, dan scheduler.
- Google Sheets hanya mirror `shared`; data personal tetap di Turso.
- Web Push melalui queue backend.

## Status implementasi

- Auth, authorization, transaksi, saldo, transfer, idempotency, optimistic conflict, audit, planning, report, integration outbox, export XLSX, backup/restore guard, PWA, dan push tersedia pada source.
- Production migration tetap **pending real data parity**.
- Backup/restore sudah diimplementasikan tetapi **real-resource drill wajib**.
- Web Push masih memerlukan device test.
- Browser E2E, automated accessibility, visual regression, dan performance budget belum tersedia.
- Alerting/retensi observability eksternal belum lengkap.

## Keputusan/risiko aktif

1. Runtime lokal dan Vercel Production memakai satu database Turso sesuai keputusan pemilik. Ini meningkatkan risiko eksperimen terhadap data production. Jangan mengubah atau memisahkan tanpa RFC/approval; jangan gunakan data dummy atau operasi destruktif.
2. Vercel hanya memakai scope Production. Preview dan Vercel Development tidak diberi environment aplikasi.
3. Rate limit runtime masih best-effort per instance.
4. Backup teknis terkompresi dan ber-checksum; enkripsi aplikasi belum menjadi baseline yang terbukti pada source.
5. Branch protection, repository ruleset, GitHub Security features, dan Vercel settings tidak dapat dibuktikan dari source; verifikasi dashboard masih diperlukan.

## Governance foundation

Tersedia:

- `AGENTS.md` untuk onboarding AI/coding agent;
- project handoff dan status;
- contribution/security policy;
- CODEOWNERS, PR dan issue templates;
- product requirements/glossary;
- API, authorization, data, environment, security, logging, release, rollback, operations, dan incident docs;
- ADR/RFC workflow;
- test untuk mendeteksi drift dokumentasi utama.

## Prioritas berikutnya

1. Terapkan GitHub branch protection/ruleset dan required `Quality` check.
2. Jalankan migration parity pada snapshot atau salinan terisolasi yang bersifat sementara.
3. Jalankan backup/restore real-resource drill.
4. Lengkapi observability terminal logging, client crash reporting, metrics, dan alert.
5. Tambah Playwright E2E, axe accessibility, dan performance budget.
6. Tinjau ulang guard operasional database tunggal melalui RFC sebelum tim berkembang.

## Cara melanjutkan di chat baru

Minta agent membaca `AGENTS.md`, `docs/PROJECT_STATUS.md`, dan `docs/PROJECT_HANDOFF.md`, lalu validasi source aktual. Jangan mengandalkan ringkasan percakapan sebagai source of truth.

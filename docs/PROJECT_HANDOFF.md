# Project Handoff

**Updated:** 2026-08-02
**Task:** Documentation governance and source-drift hardening
**Status:** Implemented in source; lihat hasil validasi di bawah.

## Tujuan task

Menutup mismatch konkret antara source, schema, environment, index dokumentasi, workflow Git, dan governance tests. Task ini juga menetapkan bahwa setiap perubahan project harus meninggalkan jejak pada status, handoff, changelog, dan dokumen contract/runbook yang relevan.

## Source yang divalidasi

- Arsip: `saldo-bersama-clean(75).zip`
- Root project: `saldo-bersama/`
- Schema canonical: `database/migrations/001_initial_schema.sql`
- Path utama:
  - `docs/TURSO_SCHEMA.md`
  - `docs/DATA_DICTIONARY.md`
  - `docs/ENVIRONMENT_VARIABLES.md`
  - `docs/INDEX.md`
  - `CONTRIBUTING.md`
  - `docs/GIT_WORKFLOW.md`
  - `scripts/runtime-environment.mjs`
  - `scripts/check-environment.mjs`
  - `scripts/push-vercel-production-env.mjs`
  - `test/api/governance-docs.test.js`

## Perubahan utama

- `request_nonces` ditambahkan ke ringkasan `TURSO_SCHEMA.md` dan dijelaskan sebagai anti-replay persisten.
- Environment memiliki satu sumber daftar canonical:
  - 8 core wajib;
  - 1 logging opsional (`LOG_LEVEL`);
  - grup Google bridge;
  - grup Web Push;
  - 9 key Production sync.
- `VITE_APP_NAME` sekarang diperiksa konsisten oleh bootstrap, environment checker, diagnostic, dan production sync.
- `docs/INDEX.md` sekarang memuat out-of-scope, roadmap, handoff template, serta membedakan cutover legacy dari policy schema.
- `CONTRIBUTING.md` menjadi kebijakan kontribusi; `docs/GIT_WORKFLOW.md` menjadi sumber command Git canonical. Keduanya saling merujuk.
- `docs/DATA_MIGRATION.md` di-rename menjadi `docs/LEGACY_SHEETS_TO_TURSO_CUTOVER.md` agar tidak tertukar dengan `DATABASE_MIGRATION_POLICY.md`.
- Implementation matrix memisahkan status source dari activation/real-resource verification.
- Governance tests sekarang menjaga required reading, local Markdown reference, index coverage, dua dokumentasi schema, cross-reference Git, serta klasifikasi environment.
- Changelog dan project status diperbarui untuk merekam perubahan terdahulu yang masih aktif pada source.

## Guarded area

Task ini tidak mengubah:

- schema atau data Turso;
- auth, role, session, atau authorization;
- API bisnis;
- saldo, transfer, audit, idempotency, atau `row_version`;
- import/export, backup/restore implementation;
- secret, nilai environment, atau deployment resource;
- dependency.

## Validasi

Command yang berhasil dijalankan pada source patch:

```text
npm run validate:source: PASS — 222 file; 5/12 Vercel Functions canonical
npm test: PASS — frontend 29/29; backend/database/governance 78/78; total 107/107
node scripts/check-node-syntax.mjs: PASS — 54 file
node scripts/check-apps-script-syntax.mjs: PASS — 6 file, 2 urutan load
```

Quality gate yang belum dapat dijalankan pada sandbox archive bersih:

```text
npm run lint: BELUM TERVERIFIKASI — eslint tidak tersedia karena node_modules tidak dibawa ZIP
npm run build: BELUM TERVERIFIKASI — vite tidak tersedia karena node_modules tidak dibawa ZIP
```

Lint dan build wajib diulang pada komputer project dengan Node 24 dan dependency terpasang.

## Risiko dan unresolved

- ZIP tidak membawa `.git`; histori bahwa setiap perubahan lama selalu terdokumentasi tidak dapat dibuktikan. Patch ini menguatkan enforcement mulai source sekarang.
- Status integrasi source dan activation production tetap harus dibedakan; Google bridge, Web Push, dan restore drill memerlukan verifikasi resource nyata.
- Link validation saat ini menjaga README, AGENTS, dan INDEX sebagai entry point; dokumen lain tetap perlu review saat diubah.

## Next safe step

Jalankan full quality gate pada Node 24, commit patch dokumentasi, lalu lanjutkan prioritas operasional di `PROJECT_STATUS.md` tanpa mengubah area guarded sebelum approval baru.

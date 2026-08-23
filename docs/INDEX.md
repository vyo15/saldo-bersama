# Documentation Index

## Mulai di sini

- `../AGENTS.md` — instruksi AI/coding agent.
- `WORKFLOW.md` — workflow review, patch, validation, dan delivery canonical.
- [`CODE_MAINTAINABILITY.md`](CODE_MAINTAINABILITY.md) — aturan comment/JSDoc, decomposition, facade, dan characterization test.
- `GIT_WORKFLOW.md` — branch/PR workflow dengan Quality gate.
- `PROJECT_STATUS.md` — snapshot kondisi project sekarang.
- `DOCUMENT_LIFECYCLE.md` — lifecycle dokumen.
- `../CONTRIBUTING.md` — kebijakan kontribusi.
- `ARCHITECTURE.md` — arsitektur runtime.
- `product/PRODUCT_REQUIREMENTS.md` — kebutuhan produk.
- `product/GLOSSARY.md` — istilah canonical.
- `product/OUT_OF_SCOPE.md` — batas fitur.
- `product/ROADMAP.md` — roadmap.

## Peta perubahan

Gunakan tabel ini sebelum coding. Jangan membaca seluruh folder docs tanpa arah; mulai dari contract yang relevan lalu cari source dan test aktual.

| Area perubahan | Wajib dibaca | Test/validation utama |
|---|---|---|
| UI/layout/responsive | `UI_DESIGN_SYSTEM.md`, `TEST_PLAN.md` | frontend regression + `npm run lint` + `npm run build` + manual device QA |
| Rekening/transaksi/saldo/laporan | `API_CONTRACT.md`, `DATA_DICTIONARY.md`, `TEST_PLAN.md` | test business/domain terkait + full `npm run verify` |
| Auth/session/role | `SECURITY_MODEL.md`, `AUTHORIZATION_MATRIX.md`, `ENVIRONMENT_VARIABLES.md` | auth/security regression + manual login journey pada device relevan |
| Schema/database/migration | `TURSO_SCHEMA.md`, `DATA_DICTIONARY.md`, `DATABASE_MIGRATION_POLICY.md` | migration/schema/integrity tests |
| Backup/restore/import/reset | `DATA_DELETION_AND_RECOVERY_POLICY.md`, `RECOVERY_RUNBOOK.md`, `TEST_PLAN.md` | maintenance/data-lifecycle guards |
| Env/deployment/CI/tooling | `ENVIRONMENT_VARIABLES.md`, `DEPLOYMENT.md`, `GIT_WORKFLOW.md`, `TEST_PLAN.md` | tooling/governance tests + `npm run verify` |
| Build/performance/bundle | `TEST_PLAN.md`, `UI_DESIGN_SYSTEM.md`, `WORKFLOW.md` | production build + build-budget internal pada `npm run verify`; audit static import, CSS global, lazy chunk, dan asset legacy |
| Dokumentasi/governance | `DOCUMENT_LIFECYCLE.md`, `WORKFLOW.md`, `DEFINITION_OF_DONE.md` | governance/tooling tests |

Jika perubahan menyentuh lebih dari satu area, gabungkan contract dan test dari semua baris yang relevan. Source tetap sumber kebenaran bila snapshot docs tertinggal; drift docs harus diperbaiki pada patch yang sama.

## Contract

- `API_CONTRACT.md`
- `AUTHORIZATION_MATRIX.md`
- `ENVIRONMENT_VARIABLES.md`
- `TURSO_SCHEMA.md`
- `DATA_DICTIONARY.md`
- `DATA_DELETION_AND_RECOVERY_POLICY.md`
- `DATABASE_MIGRATION_POLICY.md`
- `LEGACY_SHEETS_TO_TURSO_CUTOVER.md`

## Delivery dan governance

- `WORKFLOW.md`
- `GIT_WORKFLOW.md`
- `GITHUB_RULESET.md`
- `DEFINITION_OF_READY.md`
- `DEFINITION_OF_DONE.md`
- `rfc/README.md`
- `adr/README.md`
- `RELEASE_CHECKLIST.md`
- `ROLLBACK_RUNBOOK.md`

Historical task records dari workflow lama tetap berada di `tasks/archive/`, tetapi bukan workflow aktif.

## Security dan operasi

- `../SECURITY.md`
- `SECURITY_MODEL.md`
- `THREAT_MODEL.md`
- `OBSERVABILITY.md`
- `LOG_EVENT_CATALOG.md`
- `OPERATIONS_RUNBOOK.md`
- `INCIDENT_RESPONSE.md`
- `RECOVERY_RUNBOOK.md`
- `SECRET_ROTATION_RUNBOOK.md`

## Build, QA, dan integrasi

- `SETUP.md`
- `DEPLOYMENT.md`
- `TEST_PLAN.md`
- `QA_CHECKLIST.md`
- `GOOGLE_INTEGRATIONS.md`
- `../database/README.md` — aturan source-of-truth migration database.
- `../apps-script/README.md` — peran Apps Script sebagai integration bridge.
- `IMPLEMENTATION_MATRIX.md`
- `UI_DESIGN_SYSTEM.md`

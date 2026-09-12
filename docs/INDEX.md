# Documentation Index

> **Status:** Canonical  
> **Purpose:** Pintu masuk dokumentasi dan routing authority.  
> **Update when:** Dokumen aktif ditambah, dipindah, dipensiunkan, atau authority berubah.

Gunakan index ini sebelum coding. Jangan membaca seluruh folder docs tanpa arah; pilih pertanyaan/area, buka authority-nya, lalu validasi source dan test aktual.

## Mulai di sini

- `../README.md` — orientasi repository dan command utama.
- `../AGENTS.md` — instruksi AI/coding agent.
- `DOCUMENT_LIFECYCLE.md` — lifecycle, authority, dan aturan current vs history.
- `WORKFLOW.md` — workflow review, implementasi, validation, dan delivery.
- `GIT_WORKFLOW.md` — commit/push canonical.
- [`CODE_MAINTAINABILITY.md`](CODE_MAINTAINABILITY.md) — decomposition, facade, comment/JSDoc, dan characterization test.
- `PROJECT_STATUS.md` — snapshot kondisi sekarang.
- `product/PRODUCT_REQUIREMENTS.md` — behavior produk canonical.
- `product/GLOSSARY.md` — istilah canonical.

## Authority map

| Pertanyaan | Sumber kebenaran |
|---|---|
| Produk harus bagaimana? | `product/PRODUCT_REQUIREMENTS.md` |
| Istilah produk/keuangan? | `product/GLOSSARY.md` |
| Scope yang sengaja tidak dikerjakan? | `product/OUT_OF_SCOPE.md` |
| Prioritas/future direction? | `product/ROADMAP.md` |
| Sudah implement atau belum? | `IMPLEMENTATION_MATRIX.md` |
| Kondisi project sekarang? | `PROJECT_STATUS.md` |
| Runtime/komponen/data flow? | `ARCHITECTURE.md` |
| API/action canonical? | `API_CONTRACT.md` |
| Role/capability? | `AUTHORIZATION_MATRIX.md` |
| Schema/table/constraint? | `TURSO_SCHEMA.md` |
| Makna field/lifecycle data? | `DATA_DICTIONARY.md` |
| UI/UX convention? | `UI_DESIGN_SYSTEM.md` |
| Regression yang wajib tetap benar? | `TEST_PLAN.md` |
| Manual QA sebelum delivery? | `QA_CHECKLIST.md` |
| Environment key? | `ENVIRONMENT_VARIABLES.md` |
| Setup workstation? | `SETUP.md` |
| Deployment Production? | `DEPLOYMENT.md` |
| Keputusan teknis yang sudah diterima? | `adr/README.md` |
| Proposal/future design? | `rfc/README.md` |
| History perubahan? | `../CHANGELOG.md`, Git, `history/`, `docs/tasks/archive/` |

## Peta perubahan

| Area perubahan | Wajib dibaca | Test/validation utama |
|---|---|---|
| UI/layout/responsive | `UI_DESIGN_SYSTEM.md`, `TEST_PLAN.md` | frontend regression + browser smoke dalam `npm run verify` + manual device QA bila relevan |
| Rekening/transaksi/saldo/laporan | `product/PRODUCT_REQUIREMENTS.md`, `API_CONTRACT.md`, `DATA_DICTIONARY.md`, `TEST_PLAN.md` | business/domain regression + `npm run verify` |
| Alokasi/Kebutuhan/Jadwal | `product/PRODUCT_REQUIREMENTS.md`, `product/GLOSSARY.md`, `API_CONTRACT.md`, `TEST_PLAN.md` | planning/business regression + funding/account-balance regression + `npm run verify` |
| Investasi/RDN | `product/PRODUCT_REQUIREMENTS.md`, `API_CONTRACT.md`, `AUTHORIZATION_MATRIX.md`, `TURSO_SCHEMA.md`, `RECOVERY_RUNBOOK.md`, `adr/0011-manual-investment-rdn-ledger.md` | investment/integrity/backup regression + `npm run verify` |
| Auth/session/role | `SECURITY_MODEL.md`, `AUTHORIZATION_MATRIX.md`, `ENVIRONMENT_VARIABLES.md` | auth/security regression + real login journey bila relevan |
| Schema/database/migration | `TURSO_SCHEMA.md`, `DATA_DICTIONARY.md`, `DATABASE_MIGRATION_POLICY.md` | migration/schema/integrity tests |
| Backup/restore/import/reset | `DATA_DELETION_AND_RECOVERY_POLICY.md`, `RECOVERY_RUNBOOK.md`, `TEST_PLAN.md` | maintenance/data-lifecycle guards |
| Realtime/sync/offline | `ARCHITECTURE.md`, `API_CONTRACT.md`, `TEST_PLAN.md` | sync revision/dependency regression + multi-device smoke bila release menyentuh sync |
| Env/deployment/CI/tooling | `ENVIRONMENT_VARIABLES.md`, `DEPLOYMENT.md`, `GIT_WORKFLOW.md`, `TEST_PLAN.md` | tooling/governance + `npm run verify` |
| Build/performance/bundle | `TEST_PLAN.md`, `UI_DESIGN_SYSTEM.md`, `WORKFLOW.md` | production build + build budget + browser smoke |
| Dokumentasi/governance | `DOCUMENT_LIFECYCLE.md`, `WORKFLOW.md`, `DEFINITION_OF_DONE.md` | governance/documentation tests |

Jika perubahan menyentuh lebih dari satu area, gabungkan authority dan test dari semua baris. Snapshot tidak boleh mengalahkan source; bila snapshot drift, perbaiki pada patch yang sama.

## Product

- `product/PRODUCT_REQUIREMENTS.md`
- `product/GLOSSARY.md`
- `product/OUT_OF_SCOPE.md`
- `product/ROADMAP.md`

## Engineering contracts

- `ARCHITECTURE.md`
- `API_CONTRACT.md`
- `AUTHORIZATION_MATRIX.md`
- `TURSO_SCHEMA.md`
- `DATA_DICTIONARY.md`
- `DATABASE_MIGRATION_POLICY.md`
- `DATA_DELETION_AND_RECOVERY_POLICY.md`
- `SECURITY_MODEL.md`
- `THREAT_MODEL.md`
- `ENVIRONMENT_VARIABLES.md`

## Quality dan delivery

- `TEST_PLAN.md`
- `QA_CHECKLIST.md`
- `CODE_MAINTAINABILITY.md`
- `WORKFLOW.md`
- `GIT_WORKFLOW.md`
- `GITHUB_RULESET.md`
- `DEFINITION_OF_READY.md`
- `DEFINITION_OF_DONE.md`
- `RELEASE_CHECKLIST.md`
- `UI_DESIGN_SYSTEM.md`

## Operations

- `SETUP.md`
- `DEPLOYMENT.md`
- `OPERATIONS_RUNBOOK.md`
- `RECOVERY_RUNBOOK.md`
- `ROLLBACK_RUNBOOK.md`
- `INCIDENT_RESPONSE.md`
- `SECRET_ROTATION_RUNBOOK.md`
- `OBSERVABILITY.md`
- `LOG_EVENT_CATALOG.md`
- `GOOGLE_INTEGRATIONS.md`
- `../database/README.md` — migration source-of-truth.
- `../apps-script/README.md` — Apps Script integration bridge.

## Current state

- `PROJECT_STATUS.md`
- `IMPLEMENTATION_MATRIX.md`

## Decisions, proposals, dan history

- `adr/README.md` — keputusan arsitektur canonical dan statusnya.
- `rfc/README.md` — proposal/future design dan statusnya.
- `history/README.md` — one-time runbook/cutover yang sudah selesai; bukan workflow aktif.
- `docs/tasks/archive/` — task record workflow lama; historical only.
- `../CHANGELOG.md` — kronologi perubahan source/release.

Historical docs tidak boleh digunakan sebagai authority current behavior kecuali current canonical doc secara eksplisit merujuknya untuk alasan keputusan/recovery.

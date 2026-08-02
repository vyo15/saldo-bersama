# Implementation Matrix

Kolom **Source** menjelaskan apakah implementasi tersedia pada repository. Kolom **Deployment/verification** menjelaskan apakah fitur sudah dikonfigurasi dan dibuktikan pada resource nyata. “Implemented” tidak otomatis berarti aktif di production.

| Area | Source of truth / implementation | Source | Deployment/verification |
|---|---|---|---|
| Authentication | Firebase Google + signed HttpOnly session | Implemented | Production smoke test required after env/deploy changes |
| Authorization | Vercel allowlist + Turso users + backend scope guard | Implemented | Owner/member real-account test required |
| Database | Turso schema v3 | Implemented | Active; integrity check required after migration |
| Transactions/saldo | Vercel service + Turso transaction | Implemented | Core tests pass; real-data parity still guarded |
| Idempotency | `idempotency_keys` | Implemented | Covered by database/service tests |
| Conflict control | `row_version` conditional update | Implemented | Service tests pass; authenticated browser conflict E2E pending |
| Audit | append-only `audit_log` | Implemented | Covered by schema/service tests |
| Sheets mirror | one-way shared-only bridge | Implemented | Not configured or real-resource verified unless bridge env is complete |
| Calendar | shared recurring bridge | Implemented | Not configured or shared-calendar verified unless bridge env is complete |
| Excel | direct backend XLSX | Implemented | Generator tests pass; production download smoke test required |
| Backup/restore | Drive technical backup + guarded restore | Implemented | Real-resource restore drill required |
| PWA | manifest, service worker, install/offline/update UI | Implemented | iPhone/Android device smoke test required |
| Web Push | backend queue + VAPID | Implemented | Disabled until VAPID group is complete; device test required |
| Legacy Sheets DB | removed from runtime | Completed | Legacy spreadsheet remains archival/read-only until retention approval |
| Production migration | controlled cutover | Implemented tooling | Pending real-data parity/cutover evidence |
| Governance/handoff | AGENTS, status, handoff, CODEOWNERS, templates | Implemented | Drift tests cover required docs, links, schema, env, and index |
| Team contracts | API, authorization, data, security, release/runbook docs | Implemented | Machine-readable payload schema pending |
| Browser E2E/accessibility automation | Chromium/CDP smoke + accessibility tree | Implemented | Login redirect/mobile smoke available; full axe and authenticated journeys pending |
| Build/archive performance guard | gzip bundle budget + clean ZIP size/content guard | Implemented | Enforced by `npm run check` and tooling tests |
| External alerting | Vercel/log drain/approved provider | Not implemented | Pending |

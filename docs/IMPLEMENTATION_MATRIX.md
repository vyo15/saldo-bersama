# Implementation Matrix

| Area | Source of truth / implementation | Status desain |
|---|---|---|
| Authentication | Firebase Google + signed HttpOnly session | Implemented |
| Authorization | Vercel allowlist + Turso users + backend scope guard | Implemented |
| Database | Turso schema v3 | Implemented |
| Transactions/saldo | Vercel service + Turso transaction | Implemented |
| Idempotency | `idempotency_keys` | Implemented |
| Conflict control | `row_version` conditional update | Implemented |
| Audit | append-only `audit_log` | Implemented |
| Sheets | one-way mirror bridge | Implemented |
| Calendar | shared recurring bridge | Implemented |
| Excel | direct backend XLSX | Implemented |
| Backup/restore | Drive technical backup + guarded restore | Implemented; real-resource drill required |
| PWA | manifest, service worker, install/offline/update UI | Implemented |
| Web Push | backend queue + VAPID | Implemented; device test required |
| Legacy Sheets DB | removed from runtime | Completed |
| Production migration | controlled cutover | Pending real data parity |

# Implementation Matrix

Status **Implemented** berarti source tersedia; bukan bukti deployment production. **Partial** berarti subset aman tersedia dan gap dinyatakan. **Planned** berarti belum ada schema/API runtime dan tidak boleh dianggap selesai.

| Requirement | Area | Status source | Bukti utama | Gap / verification |
|---|---|---|---|---|
| `REQ-FIN-001` | Integer Rupiah | Implemented | migration constraints, validation, tests | Real-data parity wajib |
| `REQ-FIN-002` | Saldo dari ledger aktif | Implemented | balance projection, finance tests | Real bank reconciliation wajib |
| `REQ-FIN-003` | Transfer netral income/expense | Implemented | finance service/report tests | Production smoke wajib |
| `REQ-FIN-004` | Soft cancel/archive | Implemented | transaction status, audit, tests | Retention policy operation |
| `REQ-FIN-005` | Idempotency + audit append-only | Implemented | idempotency/audit services + triggers | Operational audit review |
| `REQ-FIN-006` | Optimistic row version | Implemented | version guards/conflict tests | Multi-device smoke |
| `REQ-SEC-001`–`REQ-SEC-002` | Auth/authorization | Implemented | `security.js`, session, ownership query | Real owner/member smoke |
| `REQ-DATA-001`–`REQ-DATA-002` | Turso/recovery | Implemented | migration, maintenance services | Restore drill nyata |
| `REQ-OFFLINE-001` | Offline write deny | Implemented | service worker/front-end guards | Device smoke |
| `REQ-AUDIT-001` | Audit append-only | Implemented | `audit_log` triggers/service | Retention operation |
| `REQ-UX-001` | UI states | Implemented | feedback components/pages + shared responsive view model | Production/device smoke |
| `REQ-A11Y-001` | Accessibility baseline | Partial | semantic tests + unauthenticated/authenticated Chromium smoke | axe penuh dan Safari/Firefox device coverage pending |
| `REQ-PROD-01` | Rekening/sumber uang | Partial | accounts/read models/dashboard + schema v5 account number + `bank_template` terpisah + list/detail financial-card UI + owner label/capability + route rekening terpisah | Mode privacy granular pending RFC-0015; real-resource owner/member smoke pending |
| `REQ-PROD-02` | Transaksi lengkap | Partial | finance service/TransactionForm | `used_by`, receipt, draft, debt pending RFC-0011/0012 |
| `REQ-PROD-03` | Kategori | Partial | route `/kategori`, facade feature, categories + `nature` | hierarchy pending RFC-0014 |
| `REQ-PROD-04` | Kantong/alokasi | Implemented | envelope rules/periods | Real-device UX verification |
| `REQ-PROD-05` | Anggaran multi-cadence | Partial | envelope cadence + monthly budgets + alerts | recurring budget rules belum ada |
| `REQ-PROD-06` | Target tabungan | Partial | goals, movements, projection | split/stages pending RFC-0013/0014 |
| `REQ-PROD-07` | Tagihan rutin | Partial | recurring rules/occurrences | assignee/receipt pending RFC-0011/0013 |
| `REQ-PROD-08` | Kalender keuangan | Partial | shared recurring Calendar bridge | internal multi-event calendar belum ada |
| `REQ-PROD-09` | Dashboard pasangan | Implemented | shared dashboard view model, mobile/desktop filters, detail, alerts, privacy | Production/device smoke |
| `REQ-PROD-10` | Kontribusi/split | Planned | hanya aktivitas pencatatan | RFC-0013 |
| `REQ-PROD-11` | Quick/draft transaction | Partial | quick form, duplicate guard, unallocated alerts | draft/template pending RFC-0011 |
| `REQ-PROD-12` | Utang/piutang | Planned | tidak ada runtime table/action | RFC-0012 |
| `REQ-PROD-13` | Laporan | Partial | monthly report + 3/6/12 trend + breakdown | contribution/debt model pending |
| `REQ-PROD-14` | Rekonsiliasi | Implemented | reconciliation service + alerts | Cadence configurable belum ada |
| `REQ-PROD-15` | Privasi | Partial | rekening/ledger transparan untuk dua user + owner label + operable write guard; mirror shared-only | projection granular pending RFC-0015 |
| `REQ-PROD-16` | Notifikasi | Partial | secure-context guard, backend status/test, privacy-safe payload, per-device delivery/retry | real Android/iOS, scheduler, dan VAPID Production verification pending |
| `REQ-PROD-17` | Security/anti-error | Implemented | auth/audit/idempotency/version/backup/export | external alerting + operational drills |

## Infrastruktur dan deployment

| Area | Source | Deployment/verification |
|---|---|---|
| Firebase Google auth | Implemented | Production smoke after env/deploy changes |
| Turso schema v6 | Implemented | Migration additive delivery Web Push; production migration/parity evidence pending |
| Sheets mirror shared-only | Implemented | Requires complete bridge env + resource test |
| Calendar recurring shared | Implemented | Requires shared-calendar test |
| XLSX | Implemented | Generator tests; production download smoke |
| Backup/restore | Implemented | Real-resource restore drill required |
| PWA/Web Push | Partial | Source contract implemented; real-device HTTPS and scheduler delivery test required |
| Browser smoke/build budget | Implemented | Enforced after successful local/CI install |
| External alerting | Not implemented | RFC/approved provider pending |

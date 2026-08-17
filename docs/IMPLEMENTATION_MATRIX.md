# Implementation Matrix

Status **Implemented** berarti source tersedia; bukan bukti deployment production. **Partial** berarti subset aman tersedia dan gap dinyatakan. **Planned** berarti belum ada schema/API runtime dan tidak boleh dianggap selesai.

| Requirement | Area | Status source | Bukti utama | Gap / verification |
|---|---|---|---|---|
| `REQ-FIN-001` | Integer Rupiah | Implemented | migration constraints, validation, tests | Real-data parity wajib |
| `REQ-FIN-002` | Saldo dari ledger aktif | Implemented | balance projection, finance tests | Real bank reconciliation wajib |
| `REQ-FIN-003` | Transfer netral income/expense | Implemented | finance service/report tests | Production smoke wajib |
| `REQ-FIN-004` | Soft cancel/archive + guarded delete-unused | Implemented | transaction status, master/config lifecycle preview, exact hard-delete allowlist, audit, tests | Backup/operational retention policy tetap terpisah |
| `REQ-FIN-005` | Idempotency + audit append-only | Implemented | internal transaction replay + external pre-side-effect reservation + restore reservation preservation + private-memory frontend mutation intent + integrity-run idempotency + audit triggers | Full Node 24 quality + guard gate pada patch terbaru |
| `REQ-FIN-006` | Optimistic row version | Implemented | version guards/conflict tests | Multi-device smoke |
| `REQ-SEC-001`–`REQ-SEC-002` | Auth/authorization | Implemented | `security.js`, local Firebase popup, production desktop/mobile Google OAuth server callback → Firebase verification, signed session, ownership query | Real Administrator/Member smoke termasuk iPhone/Android production |
| `REQ-DATA-001`–`REQ-DATA-002` | Turso/recovery | Implemented | migration, cumulative all-or-nothing import preview/apply, safety backup, guarded restore, integrity verification, maintenance recovery | Restore drill nyata |
| `REQ-OFFLINE-001` | Offline write deny | Implemented | service worker/front-end guards | Device smoke |
| `REQ-AUDIT-001` | Audit append-only | Implemented | `audit_log` triggers/service | Retention operation |
| `REQ-UX-001` | UI states | Implemented | feedback components/pages + shared responsive view model | Production/device smoke |
| `REQ-A11Y-001` | Accessibility baseline | Partial | semantic/static regression, AA semantic danger-pair guard, 44px transaction mobile controls, readable financial micro-text, notification preference descriptions + `aria-describedby` | axe penuh dan Chrome/Firefox/Safari real-device coverage pending |
| `REQ-PROD-01` | Rekening/sumber uang | Partial | accounts/read models/dashboard + schema v5 account number/`bank_template` + schema v8 `ewallet_template` + schema v9 `assignee_user_id` pada Alokasi + list/detail financial-card UI + label/capability Administrator/Member + route rekening terpisah | Mode privacy granular pending RFC-0015; real-resource Administrator/Member smoke pending |
| `REQ-PROD-02` | Transaksi lengkap | Partial | finance service/TransactionForm + `MobileTransactionHistory` history-first UI | `used_by`, receipt, draft, debt pending RFC-0011/0012 |
| `REQ-PROD-03` | Kategori | Partial | route `/kategori`, facade feature, categories + `nature` | hierarchy pending RFC-0014 |
| `REQ-PROD-04` | Kantong/alokasi | Implemented | envelope rules/periods + archive/restore rule + reverse reallocation | Full device regression setelah patch terbaru |
| `REQ-PROD-05` | Anggaran multi-cadence | Partial | envelope cadence + monthly budgets + alerts | recurring budget rules belum ada |
| `REQ-PROD-06` | Target tabungan | Partial | goals, movements, projection, owner restore arsip | split/stages pending RFC-0013/0014 |
| `REQ-PROD-07` | Tagihan rutin | Partial | recurring rules/occurrences + skip/restore satu occurrence + owner restore arsip + H-2/completion notification | assignee/receipt pending RFC-0011/0013 |
| `REQ-PROD-08` | Kalender keuangan | Partial | shared recurring Calendar bridge + ScriptLock + duplicate managed-event self-heal | internal multi-event calendar belum ada |
| `REQ-PROD-09` | Dashboard pasangan | Implemented | shared dashboard view model, mobile/desktop filters, detail, alerts, privacy | Production/device smoke |
| `REQ-PROD-10` | Kontribusi/split | Planned | hanya aktivitas pencatatan | RFC-0013 |
| `REQ-PROD-11` | Quick/draft transaction | Partial | quick form, duplicate guard, unallocated alerts | draft/template pending RFC-0011 |
| `REQ-PROD-12` | Utang/piutang | Planned | tidak ada runtime table/action | RFC-0012 |
| `REQ-PROD-13` | Laporan | Partial | `reports.monthly` + tren 3/6/12 + breakdown; mobile ≤820px `Ringkasan`/`Per kategori`, chart, KPI, compare, alerts, budget vs actual; desktop workspace existing | contribution/debt model pending |
| `REQ-PROD-14` | Rekonsiliasi | Implemented | reconciliation service + alerts + signed actual balance untuk rekening `allow_negative` | Cadence configurable belum ada |
| `REQ-PROD-15` | Privasi | Partial | rekening/ledger transparan untuk dua user + owner label + operable write guard; mirror shared-only | projection granular pending RFC-0015 |
| `REQ-PROD-16` | Notifikasi | Partial | tujuh tipe alert otomatis + preference per user + manual reminder one-shot pada Jadwal/Anggaran/Alokasi/Target + detail push server-generated + branded icon/badge + per-device delivery/retry | Real Android/iOS masih pending; transaksi besar/saldo rendah/cadence tambahan belum ada |
| `REQ-PROD-17` | Security/anti-error | Implemented | auth/audit/version + private-memory guarded mutation intent + same-key retry + external idempotency reservation + restore reservation replay + server lifecycle preview/delete-unused guard + exact destructive-SQL allowlist + canonical timezone/currency integrity + confirmation/browser-side single-flight | GitHub ruleset, Dev/Prod DB isolation, per-device session revoke (RFC-0018), platform rate limit, external alerting, dan operational drills tetap perlu evidence/decision |

## Infrastruktur dan deployment

| Area | Source | Deployment/verification |
|---|---|---|
| Firebase Google auth | Implemented | Desktop/mobile branded login + local Firebase popup; production server OAuth memerlukan callback URI + `GOOGLE_OAUTH_CLIENT_SECRET` Production Sensitive dan real-device smoke |
| Turso schema v10 | Implemented | Migration additive manual reminder + penerima jatah + provider E-wallet + compatibility backup v3-v9; production migration/parity evidence pending |
| Sheets mirror shared-only | Implemented | Requires complete bridge env + resource test |
| Calendar recurring shared | Implemented | Requires shared-calendar test |
| XLSX | Implemented | Generator tests; production download smoke |
| Backup/restore | Implemented | Real-resource restore drill required |
| PWA/Web Push | Partial | Source contract + centralized VAPID + detail server-generated automatic/manual alerts + branded icon/badge; desktop Production operator smoke reported, real Android/iOS tetap required |
| Build budget | Implemented | Enforced pada local/CI quality gate; browser/device QA dilakukan manual sesuai perubahan UI |
| External alerting | Not implemented | RFC/approved provider pending |

## Maintenance destructive

| Area | Status source | Bukti utama | Verification |
|---|---|---|---|
| Reset data testing & full reset | Implemented | preset aktivitas, optional saldo Rp0 + row_version, full data reset guarded, verified safety backup, reconciliation status, integrity/audit | Restore drill nyata setelah full reset pada salinan terisolasi |

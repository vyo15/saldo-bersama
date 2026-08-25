# Implementation Matrix

Status **Implemented** berarti source tersedia; bukan bukti deployment production. **Partial** berarti subset aman tersedia dan gap dinyatakan. **Planned** berarti belum ada schema/API runtime dan tidak boleh dianggap selesai.

| Requirement | Area | Status source | Bukti utama | Gap / verification |
|---|---|---|---|---|
| `REQ-FIN-001` | Integer Rupiah | Implemented | migration constraints, validation, tests | Real-data parity wajib |
| `REQ-FIN-002` | Saldo dari ledger aktif | Implemented | balance projection, finance tests | Real bank reconciliation wajib |
| `REQ-FIN-003` | Transfer netral income/expense | Implemented | finance service/report tests | Production smoke wajib |
| `REQ-FIN-004` | Soft cancel/archive + guarded delete-unused | Implemented | transaction status, master/config lifecycle preview, exact hard-delete allowlist, audit, tests | Backup/operational retention policy tetap terpisah |
| `REQ-FIN-005` | Idempotency + audit append-only | Implemented | internal transaction replay + external pre-side-effect reservation + restore reservation preservation + reload-persistent safe frontend mutation metadata + integrity-run idempotency + audit triggers | Full Node 24 quality + guard gate pada patch terbaru |
| `REQ-FIN-006` | Optimistic row version | Implemented | version guards/conflict tests | Multi-device smoke |
| `REQ-SEC-001`–`REQ-SEC-002` | Auth/authorization | Implemented | `security.js`, local Firebase popup, production desktop/mobile Google OAuth server callback → Firebase verification, signed session, ownership query | Real Administrator/Member smoke termasuk iPhone/Android production |
| `REQ-DATA-001`–`REQ-DATA-002` | Turso/recovery | Implemented | migration, cumulative all-or-nothing import preview/apply, safety backup, guarded restore, integrity verification, maintenance recovery | Restore drill nyata |
| `REQ-OFFLINE-001` | Offline write deny | Implemented | service worker/front-end guards | Device smoke |
| `REQ-AUDIT-001` | Audit append-only | Implemented | `audit_log` triggers/service | Retention operation |
| `REQ-UX-001` | UI states | Implemented | feedback components/pages + shared responsive view model | Production/device smoke |
| `REQ-A11Y-001` | Accessibility baseline | Partial | semantic/static regression, AA semantic danger-pair guard, mobile native controls 16px, effective target ≥44px, meaningful financial micro-text ~12px+, top/bottom safe-area contract, non-color active navigation indicator, notification preference descriptions + `aria-describedby` | axe penuh; real-device coverage pending untuk Chrome/Firefox/Safari dan installed-PWA |
| `REQ-PROD-01` | Rekening/sumber uang | Partial | accounts/read models/dashboard + schema v5 account number/`bank_template` + schema v8 `ewallet_template` + schema v9 `assignee_user_id` pada Alokasi + list/detail financial-card UI + label/capability Administrator/Member + route rekening terpisah | Mode privacy granular pending RFC-0015; real-resource Administrator/Member smoke pending |
| `REQ-PROD-02` | Transaksi lengkap | Partial | finance service/TransactionForm + `MobileTransactionHistory` history-first UI + smart source-account picker + Kebutuhan→Alokasi suggestion + early funds feedback | participant roles, receipt, draft, debt pending RFC-0011/0012 |
| `REQ-PROD-19` | Multi-kategori/line item | Planned | transaksi canonical masih satu `category_id` + satu `envelope_period_id` | RFC-0019; header/line total dan no-double-count invariant belum runtime |
| `REQ-PROD-03` | Kategori | Partial | route `/kategori`, facade feature, categories + `nature` | hierarchy pending RFC-0014 |
| `REQ-PROD-04` | Alokasi Dana | Implemented | `envelope_rules`/`envelope_periods` internal + add/release alokasi existing tanpa ledger + funding flow dari dashboard/pemasukan + close selalu menyiapkan periode aktif berikutnya + release-to-Target prefill + archive/restore rule + reverse reallocation | Full device regression setelah patch terbaru |
| `REQ-PROD-05` | Kebutuhan + overview Anggaran | Partial | Kebutuhan memakai `budgets` + `envelope_rule_id`; kategori dapat dipakai lintas Alokasi Dana; copy opt-in ke periode berikutnya tidak menimpa target existing; `/anggaran` read-only overview + alerts | Rule Kebutuhan multi-periode/recurring independen belum ada |
| `REQ-PROD-06` | Target tabungan | Partial | goals, movements, projection, source-account deposit guard, owner restore arsip | kontribusi aktual/stages pending follow-up RFC-0013/0014 |
| `REQ-PROD-07` | Tagihan rutin | Partial | recurring rules/occurrences + skip/restore satu occurrence + owner restore arsip + H-2/completion notification | assignee/receipt pending RFC-0011/0013 |
| `REQ-PROD-08` | Kalender keuangan | Partial | shared recurring Calendar bridge + ScriptLock + duplicate managed-event self-heal | internal multi-event calendar belum ada |
| `REQ-PROD-09` | Dashboard pasangan | Implemented | shared dashboard view model; free funds dan expense tanpa Alokasi Dana dipisah; CTA alokasi/Target; usable-state first-run checklist + guided continuation; desktop filter; mobile recent/detail/rekening/arus kas/alerts/privacy | Production/device smoke |
| `REQ-PROD-10` | Kontribusi/split | Partial | schema v11 snapshot pembagian beban `equal`/`percentage` untuk expense shared + report terpisah | payer/beneficiary/actual contribution/template split masih deferred RFC-0013 |
| `REQ-PROD-11` | Quick/draft transaction | Partial | quick form, duplicate guard, unallocated review queue, `Pakai lagi` safe prefill, kategori sering dipakai per rekening, `Tambah lagi` dengan intent baru, semuanya tanpa auto-submit | draft/template tersimpan pending RFC-0011 |
| `REQ-PROD-12` | Utang/piutang | Planned | tidak ada runtime table/action | RFC-0012 |
| `REQ-PROD-13` | Laporan | Partial | `reports.monthly` + tren 3/6/12 + breakdown rekening/nature/recorder + pembagian beban biaya; mobile ≤820px `Ringkasan`/`Per kategori`, chart, KPI, compare, alerts, budget vs actual | actual contribution/debt model pending |
| `REQ-PROD-14` | Rekonsiliasi | Implemented | reconciliation service + alerts + signed actual balance untuk rekening `allow_negative` + mismatch CTA ke transaksi rekening tanpa auto-adjustment | Cadence configurable belum ada |
| `REQ-PROD-15` | Privasi | Partial | rekening/ledger transparan untuk dua user + owner label + operable write guard; mirror shared-only | projection granular pending RFC-0015 |
| `REQ-PROD-16` | Notifikasi | Partial | tujuh tipe alert otomatis + preference per user + manual reminder one-shot pada Jadwal Rutin/Kebutuhan/Alokasi Dana/Target + last-dispatch/pending guard + lifecycle auto-cancel + reminder integrity parity + privacy-safe lock-screen payload + branded icon/badge + per-device delivery/retry | Real Android/iOS masih pending; transaksi besar/saldo rendah/cadence tambahan belum ada |
| `REQ-PROD-17` | Security/anti-error | Implemented | auth/audit/version + reload-persistent guarded mutation metadata + same-key retry + external idempotency reservation + restore reservation replay + server lifecycle preview/delete-unused guard + exact destructive-SQL allowlist + canonical timezone/currency integrity + confirmation/browser-side single-flight | GitHub ruleset, live Dev/Prod DB separation evidence, opsional platform/WAF defense, external alert delivery, dan operational drills tetap perlu evidence/decision |

| `REQ-PROD-18` | Reminder konsistensi pencatatan | Planned | belum ada inactivity/completeness alert type | cadence opt-in/configurable, dedupe, timezone, privacy copy, dan notification contract perlu approval |

## Infrastruktur dan deployment

| Area | Source | Deployment/verification |
|---|---|---|
| Firebase Google auth | Implemented | Desktop/mobile branded login + local Firebase popup; production server OAuth memerlukan callback URI + `GOOGLE_OAUTH_CLIENT_SECRET` Production Sensitive dan real-device smoke |
| Turso schema v13 | Implemented | v12 session/environment guard dipertahankan; v13 menambah durable cross-instance rate-limit buckets tanpa mengubah ledger; runtime v13 menerima backup v3-v12; production migration/parity evidence pending |
| Sheets mirror shared-only | Implemented | Requires complete bridge env + resource test |
| Calendar recurring shared | Implemented | Requires shared-calendar test |
| XLSX | Implemented | Generator tests; production download smoke |
| Backup/restore | Implemented | Real-resource restore drill required |
| PWA/Web Push | Partial | Source contract + centralized VAPID + privacy-safe automatic/manual lock-screen copy + branded icon/badge; desktop Production operator smoke reported, real Android/iOS tetap required |
| Build budget | Implemented | Enforced pada local/CI quality gate; browser/device QA dilakukan manual sesuai perubahan UI |
| External alerting | Partial | Health/log sudah monitor-ready untuk scheduler, unresolved dead-letter integrasi, notification queue/per-device Push dead-letter yang actionable, partial Push delivery, backup gagal, dan integrity gagal; provider/delivery independen masih pending approval |

## Maintenance destructive

| Area | Status source | Bukti utama | Verification |
|---|---|---|---|
| Reset data testing & full reset | Implemented | preset aktivitas, optional saldo Rp0 + row_version, full data reset guarded, verified safety backup, reconciliation status, integrity/audit | Restore drill nyata setelah full reset pada salinan terisolasi |

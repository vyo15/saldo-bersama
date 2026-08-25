# Request for Comments

RFC wajib sebelum perubahan lintas arsitektur atau guarded area: database, auth/role, API contract, saldo, offline mode, import/export, backup/restore, integrasi baru, dependency/stack utama, environment, atau deployment.

## Proposed RFC

- `0011-transaction-lifecycle-receipts-and-usage.md`
- `0012-debt-receivable-ledger.md`
- `0014-category-hierarchy-and-goal-stages.md`
- `0015-granular-personal-privacy.md`
- `0019-transaction-line-items.md`

RFC Proposed belum merupakan fitur runtime atau approval schema. Semua RFC pada daftar Proposed di atas tetap memerlukan keputusan Accepted sebelum migration/runtime implementation.

## Accepted dan implemented

- `0013-contribution-and-cost-sharing.md` menerapkan MVP pembagian beban biaya `equal`/`percentage` pada expense shared melalui schema v11. Payer/beneficiary/kontribusi aktual tetap deferred.
- `0016-partner-planning-permissions.md` mengizinkan Member mengelola planning shared serta Alokasi/Kebutuhan/Jadwal Rutin personal miliknya sendiri; Target baru tetap shared dan destructive lifecycle/recovery tetap Administrator-only.
- `0017-manual-reminders.md` menerapkan reminder manual one-shot actor-scoped pada Jadwal Rutin, Kebutuhan, Alokasi Dana, dan Target melalui schema v10 serta scheduler/Web Push existing.
- `0018-session-device-management.md` menerapkan registry session per perangkat, revoke own/all, PKCE S256, dan forced legacy re-login melalui schema v12.

## Alur

1. Salin `RFC_TEMPLATE.md` atau lanjutkan RFC Proposed yang relevan.
2. Review owner dan tim terdampak.
3. Catat keputusan `Accepted`, `Rejected`, atau `Withdrawn`.
4. Setelah implementasi, update RFC/ADR yang relevan dan link release atau PR bila tersedia.

# Request for Comments

RFC wajib sebelum perubahan lintas arsitektur atau guarded area: database, auth/role, API contract, saldo, offline mode, import/export, backup/restore, integrasi baru, dependency/stack utama, environment, atau deployment.

## Proposed RFC

- `0011-transaction-lifecycle-receipts-and-usage.md`
- `0012-debt-receivable-ledger.md`
- `0013-contribution-and-cost-sharing.md`
- `0014-category-hierarchy-and-goal-stages.md`
- `0015-granular-personal-privacy.md`
- `0016-partner-planning-permissions.md`
- `0018-session-device-management.md`

RFC Proposed belum merupakan fitur runtime atau approval schema. Setelah keputusan Accepted, buat migration/API plan file-by-file dan minta approval implementasi.

## Accepted dan implemented

- `0017-manual-reminders.md` menerapkan reminder manual one-shot actor-scoped pada Jadwal Rutin, Anggaran, Alokasi, dan Target melalui schema v10 serta scheduler/Web Push existing.

## Alur

1. Salin `RFC_TEMPLATE.md` atau lanjutkan RFC Proposed yang relevan.
2. Review owner dan tim terdampak.
3. Catat keputusan `Accepted`, `Rejected`, atau `Withdrawn`.
4. Setelah implementasi, update RFC/ADR yang relevan dan link release atau PR bila tersedia.

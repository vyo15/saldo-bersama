# Authorization Matrix

## Prinsip

- Default deny.
- Firebase identity diverifikasi backend.
- `ALLOWED_USERS_JSON` adalah outer allowlist; tabel `users` adalah binding internal.
- Role dan actor tidak dipercaya dari client.
- Permission action diperiksa di `api/_lib/security.js`.
- Ownership/scope diperiksa lagi di service dan query.
- Frontend guard hanya UX; backend guard adalah keputusan keamanan.

## Action permission

| Action | Owner | Member |
|---|---:|---:|
| `system.health` | Ya | Ya |
| `app.initialState` | Ya | Ya |
| `bootstrap.get` | Ya | Ya |
| `users.list` | Ya | Tidak |
| `users.upsert` | Ya | Tidak |
| `users.deactivate` | Ya | Tidak |
| `audit.list` | Ya | Tidak |
| `dashboard.overview` | Ya | Ya |
| `accounts.list` | Ya | Ya |
| `accounts.create` | Ya | Tidak |
| `accounts.update` | Ya | Tidak |
| `accounts.archive` | Ya | Tidak |
| `categories.list` | Ya | Ya |
| `categories.create` | Ya | Tidak |
| `categories.update` | Ya | Tidak |
| `categories.archive` | Ya | Tidak |
| `transactions.list` | Ya | Ya |
| `transactions.create` | Ya | Ya |
| `transactions.update` | Ya | Ya |
| `transactions.cancel` | Ya | Ya |
| `envelopes.list` | Ya | Ya |
| `envelopes.create` | Ya | Tidak |
| `envelopes.move` | Ya | Ya |
| `envelopes.close` | Ya | Tidak |
| `recurring.list` | Ya | Ya |
| `recurring.createRule` | Ya | Tidak |
| `recurring.updateRule` | Ya | Tidak |
| `recurring.payOccurrence` | Ya | Ya |
| `recurring.reversePayment` | Ya | Ya |
| `budgets.list` | Ya | Ya |
| `budgets.upsert` | Ya | Tidak |
| `budgets.archive` | Ya | Tidak |
| `goals.list` | Ya | Ya |
| `goals.create` | Ya | Tidak |
| `goals.update` | Ya | Tidak |
| `goals.move` | Ya | Ya |
| `goals.reverseMovement` | Ya | Ya |
| `reports.monthly` | Ya | Ya |
| `reconciliations.list` | Ya | Ya |
| `reconciliations.create` | Ya | Ya |
| `periods.list` | Ya | Tidak |
| `periods.close` | Ya | Tidak |
| `periods.reopen` | Ya | Tidak |
| `calendar.sync` | Ya | Tidak |
| `mirror.sync` | Ya | Tidak |
| `mirror.rebuild` | Ya | Tidak |
| `integrations.status` | Ya | Ya |
| `notifications.register` | Ya | Ya |
| `notifications.unregister` | Ya | Ya |
| `backup.create` | Ya | Tidak |
| `import.preview` | Ya | Tidak |
| `import.apply` | Ya | Tidak |
| `restore.preview` | Ya | Tidak |
| `restore.apply` | Ya | Tidak |
| `integrity.run` | Ya | Tidak |

## Ownership penting

- Member tidak dapat membaca atau menulis rekening personal pengguna lain.
- Member hanya dapat mengubah/cancel transaksi sendiri, kecuali rule service menyatakan lain.
- Adjustment owner-only.
- User management, master create/update/archive, budget management, period close/reopen, mirror/calendar manual sync, backup/import/restore/integrity adalah owner-only sesuai action matrix.
- Export lengkap owner-only melalui `/api/export`.
- Data `shared` dapat digunakan dua actor sesuai action permission.
- Setiap query/read model wajib menerapkan filter ownership; jangan mengandalkan filtering frontend.

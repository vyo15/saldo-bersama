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
| `users.reactivate` | Ya | Tidak |
| `archive.list` | Ya | Tidak |
| `audit.list` | Ya | Tidak |
| `dashboard.overview` | Ya | Ya |
| `accounts.list` | Ya | Ya |
| `accounts.create` | Ya | Tidak |
| `accounts.update` | Ya | Tidak |
| `accounts.previewLifecycle` | Ya | Tidak |
| `accounts.archive` | Ya | Tidak |
| `accounts.restore` | Ya | Tidak |
| `accounts.deleteUnused` | Ya | Tidak |
| `categories.list` | Ya | Ya |
| `categories.create` | Ya | Tidak |
| `categories.update` | Ya | Tidak |
| `categories.previewArchive` | Ya | Tidak |
| `categories.archive` | Ya | Tidak |
| `categories.restore` | Ya | Tidak |
| `transactions.list` | Ya | Ya |
| `transactions.create` | Ya | Ya |
| `transactions.update` | Ya | Ya |
| `transactions.cancel` | Ya | Ya |
| `transactions.restore` | Ya | Tidak |
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
| `periods.previewClose` | Ya | Tidak |
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

- Kedua pengguna aktif yang lolos Firebase session, outer allowlist, dan binding tabel `users` dapat **membaca seluruh rekening serta ledger**: shared, personal milik sendiri, dan personal milik pasangan. Transparansi baca ini mencakup saldo, nomor rekening, transaksi pembentuk saldo, laporan, dashboard, dan riwayat rekonsiliasi.
- Rekening personal selalu membawa `owner_name` dari join backend serta capability server-side. Frontend tidak boleh menentukan pemilik atau hak akses dari nama rekening, email client, atau role yang dikirim browser.
- Hak operasi tetap lebih sempit: member hanya dapat bertransaksi dan merekonsiliasi rekening shared atau rekening personal miliknya. Rekening personal pasangan memiliki `read_only=true`, `can_transact=false`, dan `can_reconcile=false`.
- Member hanya dapat mengubah/cancel transaksi yang dibuatnya sendiri **dan** berada pada scope yang dapat dioperasikan. Request manual tetap ditolak backend.
- `accounts.create/update/previewLifecycle/archive/restore/deleteUnused` tetap owner-only. `accounts.deleteUnused` hanya pengecualian sempit untuk rekening saldo awal dan saldo saat ini Rp0 yang belum pernah digunakan; purge umum tetap dilarang. Adjustment dan pemulihan transaksi cancelled tetap owner-only.
- User management, master create/update/archive, budget management, period close/reopen, mirror/calendar manual sync, backup/import/restore/integrity adalah owner-only sesuai action matrix.
- Export lengkap owner-only melalui `/api/export`. Sheets mirror tetap shared-only.
- Read model rekening/ledger wajib memakai policy readable; write dan reconciliation create wajib memakai policy operable. Jangan mengandalkan filtering atau disabled button frontend.
- `totalBalance` adalah metrik readable/transparan. `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` adalah metrik actionable sehingga hanya boleh memakai rekening/scope operable actor.

## Keputusan role pasangan

Runtime canonical tetap memakai role `member`. Dokumen produk tidak boleh menganggap member dapat membuat/mengubah master planning bila permission source masih owner-only. Perubahan `envelopes.create`, `budgets.upsert`, `goals.create/update`, atau recurring rule management memerlukan RFC-0016, review backend/frontend, dan test authorization.

## Privasi data turunan

- Filter dan laporan hanya boleh dibangun dari transaksi/rekening yang lolos scope backend.
- `creatorExpenses` adalah aktivitas pencatatan, bukan kontribusi biaya.
- Mode balance-only/contribution-only/private penuh belum ada; jangan menyembunyikan detail hanya di frontend. Rencana berada pada RFC-0015.

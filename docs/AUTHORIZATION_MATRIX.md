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

| Action | Administrator | Member |
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
| `categories.deleteUnused` | Ya | Tidak |
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
| `envelopes.previewRuleLifecycle` | Ya | Tidak |
| `envelopes.archiveRule` | Ya | Tidak |
| `envelopes.deleteUnusedRule` | Ya | Tidak |
| `envelopes.restoreRule` | Ya | Tidak |
| `envelopes.reverseMovement` | Ya | Ya |
| `recurring.list` | Ya | Ya |
| `recurring.createRule` | Ya | Tidak |
| `recurring.updateRule` | Ya | Tidak |
| `recurring.previewRuleLifecycle` | Ya | Tidak |
| `recurring.archiveRule` | Ya | Tidak |
| `recurring.deleteUnusedRule` | Ya | Tidak |
| `recurring.cancelOccurrence` | Ya | Tidak |
| `recurring.restoreOccurrence` | Ya | Tidak |
| `recurring.payOccurrence` | Ya | Ya |
| `recurring.reversePayment` | Ya | Ya |
| `recurring.restoreRule` | Ya | Tidak |
| `budgets.list` | Ya | Ya |
| `budgets.upsert` | Ya | Tidak |
| `budgets.previewLifecycle` | Ya | Tidak |
| `budgets.archive` | Ya | Tidak |
| `budgets.deleteUnused` | Ya | Tidak |
| `budgets.restore` | Ya | Tidak |
| `goals.list` | Ya | Ya |
| `goals.create` | Ya | Tidak |
| `goals.update` | Ya | Tidak |
| `goals.previewLifecycle` | Ya | Tidak |
| `goals.archive` | Ya | Tidak |
| `goals.deleteUnused` | Ya | Tidak |
| `goals.move` | Ya | Ya |
| `goals.reverseMovement` | Ya | Ya |
| `goals.restore` | Ya | Tidak |
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
| `notifications.status` | Ya | Ya |
| `notifications.preferences` | Ya | Ya |
| `notifications.updatePreference` | Ya | Ya |
| `notifications.register` | Ya | Ya |
| `notifications.unregister` | Ya | Ya |
| `notifications.test` | Ya | Ya |
| `reminders.get` | Ya | Ya |
| `reminders.upsert` | Ya | Ya |
| `reminders.cancel` | Ya | Ya |
| `backup.create` | Ya | Tidak |
| `import.preview` | Ya | Tidak |
| `import.apply` | Ya | Tidak |
| `restore.preview` | Ya | Tidak |
| `restore.apply` | Ya | Tidak |
| `reset.preview` | Ya | Tidak |
| `reset.status` | Ya | Tidak |
| `reset.apply` | Ya | Tidak |
| `fullReset.preview` | Ya | Tidak |
| `fullReset.status` | Ya | Tidak |
| `fullReset.apply` | Ya | Tidak |
| `integrity.run` | Ya | Tidak |


## Recurring occurrence dan preferensi notifikasi

- Melewati atau memulihkan satu occurrence (`recurring.cancelOccurrence` / `recurring.restoreOccurrence`) adalah keputusan planning Administrator-only. Aksi ini tidak membuat ledger entry dan tidak mengubah saldo.
- Administrator dan Member boleh membaca serta mengubah **preference notifikasi miliknya sendiri**. `user_id`, actor, role, timestamp, dan audit identity tetap ditentukan backend; client tidak dapat mengubah preference pengguna lain.
- Administrator dan Member boleh membuat, membaca, mengubah, dan membatalkan **pengingat manual miliknya sendiri** untuk entity yang memang boleh diakses actor. Backend menentukan `user_id`, memvalidasi ownership/assignee, waktu, `row_version`, audit, dan status entity; client tidak dapat membuat reminder untuk scope pengguna lain.
- Hak menerima alert tidak memperluas hak membaca data. Push detail hanya dibuat dari data yang sudah lolos guard backend dan hanya dikirim ke subscription milik penerima; preference tetap memfilter tipe alert otomatis sebelum queue dibuat.

## Guard recovery kantong

- Archive/restore aturan kantong tetap Administrator-only karena mengubah master planning.
- Member boleh membatalkan `envelopes.reverseMovement` hanya untuk movement miliknya dan tetap tunduk pada ownership scope, `row_version`, ketersediaan nominal di kantong tujuan, idempotency, dan audit backend.
- Movement kantong tidak pernah hard-delete. Envelope rule baru boleh memakai `envelopes.deleteUnusedRule` hanya bila server membuktikan rule belum pernah dipakai dan satu-satunya child adalah initial empty period; selain itu gunakan archive/restore.

## Ownership penting

- Kedua pengguna aktif yang lolos Firebase session, outer allowlist, dan binding tabel `users` dapat **membaca seluruh rekening serta ledger**: shared, personal milik sendiri, dan personal milik pasangan. Transparansi baca ini mencakup saldo, nomor rekening, transaksi pembentuk saldo, laporan, dashboard, dan riwayat rekonsiliasi.
- Rekening personal selalu membawa `owner_name` dari join backend serta capability server-side. Frontend tidak boleh menentukan pemilik atau hak akses dari nama rekening, email client, atau role yang dikirim browser.
- Hak operasi tetap lebih sempit: member hanya dapat bertransaksi dan merekonsiliasi rekening shared atau rekening personal miliknya. Rekening personal pasangan memiliki `read_only=true`, `can_transact=false`, dan `can_reconcile=false`.
- Member hanya dapat mengubah/cancel transaksi yang dibuatnya sendiri **dan** berada pada scope yang dapat dioperasikan. Request manual tetap ditolak backend.
- Kantong memiliki dimensi `assignee_user_id` terpisah dari ownership ledger. `NULL` berarti Jatah Bersama. Member hanya boleh memakai atau memindahkan Jatah Bersama dan jatah miliknya sendiri; jatah pengguna lain ditolak backend. Rekening personal hanya boleh menjadi sumber jatah untuk pemilik rekening tersebut.
- `accounts.create/update/previewLifecycle/archive/restore/deleteUnused` tetap Administrator-only. `accounts.deleteUnused` hanya pengecualian sempit untuk rekening saldo awal dan saldo saat ini Rp0 yang belum pernah digunakan. `categories.deleteUnused`, `envelopes.deleteUnusedRule`, `recurring.deleteUnusedRule`, `goals.deleteUnused`, dan `budgets.deleteUnused` juga Administrator-only dan hanya boleh berjalan setelah server membuktikan entity history-free; purge umum tetap dilarang. Adjustment dan pemulihan transaksi cancelled tetap Administrator-only.
- User management, master create/update/archive, budget management, period close/reopen, mirror/calendar manual sync, backup/import/restore/bersihkan data testing/integrity adalah Administrator-only sesuai action matrix.
- Export lengkap Administrator-only melalui `/api/export`. Sheets mirror tetap shared-only.
- Read model rekening/ledger wajib memakai policy readable; write dan reconciliation create wajib memakai policy operable. Jangan mengandalkan filtering atau disabled button frontend.
- `totalBalance` adalah metrik readable/transparan. `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` adalah metrik actionable sehingga hanya boleh memakai rekening/scope operable actor.

## Keputusan role pasangan

UI menggunakan role **Administrator** dan **Member**. Untuk kompatibilitas data/session existing, key internal database/permission untuk Administrator tetap `owner`; konfigurasi `ALLOWED_USERS_JSON` menerima `administrator` dan menormalisasinya ke key internal tersebut. Member tidak dapat membuat rekening atau mengubah master planning selama permission source tetap Administrator-only. Perubahan `envelopes.create`, `budgets.upsert`, `goals.create/update`, atau recurring rule management memerlukan RFC-0016, review backend/frontend, dan test authorization.

## Privasi data turunan

- Filter dan laporan hanya boleh dibangun dari transaksi/rekening yang lolos scope backend.
- `creatorExpenses` adalah aktivitas pencatatan, bukan kontribusi biaya.
- Mode balance-only/contribution-only/private penuh belum ada; jangan menyembunyikan detail hanya di frontend. Rencana berada pada RFC-0015.

# Authorization Matrix

> **Status:** Canonical  
> **Purpose:** Role/capability authorization contract current.

## Prinsip

- Default deny.
- Firebase identity diverifikasi backend.
- Tabel `users` di Turso adalah registry authorization canonical. `ALLOWED_USERS_JSON` hanya mengizinkan bootstrap/recovery Administrator pertama ketika database masih kosong.
- Role dan actor tidak dipercaya dari client.
- Permission action diperiksa di `api/_lib/security.js`.
- Ownership/scope diperiksa lagi di service dan query.
- Frontend guard hanya UX; backend guard adalah keputusan keamanan.
- Session cookie v2 hanya credential opaque; backend wajib resolve registry `user_sessions`, user aktif dengan Firebase UID terikat, dan role terbaru dari tabel `users` sebelum action. `ALLOWED_USERS_JSON` tidak ikut menentukan validitas session runtime; ia hanya bootstrap/recovery Administrator pertama. User hanya dapat list/revoke session miliknya; IDOR antar-user ditolak.

## Provisioning anggota

1. Administrator menjalankan `users.upsert` dengan email, nama, dan role. Backend membuat row `users` aktif dengan `firebase_uid = NULL`; UI menampilkannya sebagai **Menunggu login**.
2. Pada login pertama, Firebase ID token diverifikasi server-side. Email terverifikasi harus cocok dengan row `users` aktif; role diambil dari database, bukan dari client atau environment.
3. Backend mengikat Firebase UID satu kali di dalam transaction, menaikkan `row_version`, dan menulis audit `identity.firebase.bind` tanpa menyimpan UID pada payload audit/API.
4. Login berikutnya wajib cocok dengan UID yang sudah terikat. UID berbeda ditolak `IDENTITY_CONFLICT`; akun inactive ditolak `ACCOUNT_INACTIVE`.
5. `users.reactivate` adalah satu-satunya jalur aktivasi ulang akun inactive dan tidak memerlukan perubahan environment. Administrator tidak dapat mengubah role atau menonaktifkan akunnya sendiri melalui action normal.
6. `ALLOWED_USERS_JSON` tidak menjadi registry anggota. Ia hanya gate bootstrap/recovery Administrator pertama ketika tabel `users` dan data bisnis masih kosong.

## Action permission

| Action | Administrator | Member |
|---|---:|---:|
| `system.health` | Ya | Ya |
| `sync.state` | Ya | Ya |
| `app.initialState` | Ya | Ya |
| `bootstrap.get` | Ya | Ya |
| `users.list` | Ya | Tidak |
| `users.upsert` | Ya | Tidak |
| `users.deactivate` | Ya | Tidak |
| `users.reactivate` | Ya | Tidak |
| `sessions.listOwn` | Ya | Ya |
| `sessions.revokeOwn` | Ya | Ya |
| `sessions.revokeAllOwn` | Ya | Ya |
| `archive.list` | Ya | Tidak |
| `audit.list` | Ya | Tidak |
| `dashboard.overview` | Ya | Ya |
| `investments.overview` | Ya | Ya |
| `investments.instruments.list` | Ya | Ya |
| `investments.assets.create` | Ya | Ya |
| `investments.portfolios.create` | Ya | Ya |
| `investments.instruments.upsert` | Ya | Tidak |
| `investments.openingPositions.create` | Ya | Ya |
| `investments.trades.buy` | Ya | Ya |
| `investments.trades.sell` | Ya | Ya |
| `investments.valuations.update` | Ya | Ya |
| `investments.reconciliations.create` | Ya | Ya |
| `investments.corrections.create` | Ya | Tidak |
| `accounts.list` | Ya | Ya |
| `accounts.create` | Ya | Tidak |
| `accounts.requestCreate` | Tidak | Ya |
| `accounts.update` | Ya | Tidak |
| `accounts.previewLifecycle` | Ya | Tidak |
| `accounts.archive` | Ya | Tidak |
| `accounts.restore` | Ya | Tidak |
| `accounts.deleteUnused` | Ya | Tidak |
| `categories.list` | Ya | Ya |
| `categories.create` | Ya | Tidak |
| `categories.requestCreate` | Tidak | Ya |
| `categories.update` | Ya | Tidak |
| `categories.previewArchive` | Ya | Tidak |
| `categories.archive` | Ya | Tidak |
| `categories.deleteUnused` | Ya | Tidak |
| `categories.restore` | Ya | Tidak |
| `masterDataRequests.list` | Ya | Ya |
| `masterDataRequests.review` | Ya | Tidak |
| `transferRequests.list` | Ya | Ya |
| `transferRequests.request` | Tidak | Ya |
| `transferRequests.review` | Ya | Tidak |
| `transactions.list` | Ya | Ya |
| `transactions.create` | Ya | Ya |
| `transactions.update` | Ya | Ya |
| `transactions.cancel` | Ya | Ya |
| `transactions.restore` | Ya | Tidak |
| `envelopes.list` | Ya | Ya |
| `envelopes.create` | Ya | Ya |
| `envelopes.adjustAllocation` | Ya | Ya |
| `envelopes.move` | Ya | Ya |
| `envelopes.close` | Ya | Tidak |
| `envelopes.previewRuleLifecycle` | Ya | Tidak |
| `envelopes.archiveRule` | Ya | Tidak |
| `envelopes.deleteUnusedRule` | Ya | Tidak |
| `envelopes.restoreRule` | Ya | Tidak |
| `envelopes.reverseMovement` | Ya | Ya |
| `recurring.list` | Ya | Ya |
| `recurring.createRule` | Ya | Ya |
| `recurring.updateRule` | Ya | Ya |
| `recurring.previewRuleLifecycle` | Ya | Tidak |
| `recurring.archiveRule` | Ya | Tidak |
| `recurring.deleteUnusedRule` | Ya | Tidak |
| `recurring.cancelOccurrence` | Ya | Tidak |
| `recurring.restoreOccurrence` | Ya | Tidak |
| `recurring.payOccurrence` | Ya | Ya |
| `recurring.reversePayment` | Ya | Ya |
| `recurring.restoreRule` | Ya | Tidak |
| `budgets.list` | Ya | Ya |
| `budgets.upsert` | Ya | Ya |
| `budgets.batchCreate` | Ya | Ya |
| `budgets.previewLifecycle` | Ya | Ya |
| `budgets.remove` | Ya | Ya |
| `budgets.archive` | Ya | Tidak |
| `budgets.deleteUnused` | Ya | Tidak |
| `budgets.restore` | Ya | Tidak |
| `goals.list` | Ya | Ya |
| `goals.create` | Ya | Ya |
| `goals.update` | Ya | Ya |
| `goals.previewLifecycle` | Ya | Tidak |
| `goals.archive` | Ya | Tidak |
| `goals.deleteUnused` | Ya | Tidak |
| `goals.move` | Ya | Ya |
| `goals.reverseMovement` | Ya | Ya |
| `goals.restore` | Ya | Tidak |
| `reports.monthly` | Ya | Ya |
| `reconciliations.list` | Ya | Ya |
| `reconciliations.create` | Ya | Ya |

Catatan rekonsiliasi: `reconciliations.create` tetap dapat dipanggil Administrator/Member untuk rekening non-Investasi yang operable. RDN/Investasi tidak memiliki capability generic tersebut dan wajib memakai `investments.reconciliations.create`, dengan ownership/capability portfolio diperiksa kembali di backend.
| `periods.list` | Ya | Tidak |
| `periods.previewClose` | Ya | Tidak |
| `periods.close` | Ya | Tidak |
| `periods.reopen` | Ya | Tidak |
| `calendar.sync` | Ya | Tidak |
| `mirror.sync` | Ya | Tidak |
| `mirror.rebuild` | Ya | Tidak |
| `integrations.status` | Ya | Ya |
| `notifications.center` | Ya | Ya |
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


## Authorization investasi

- Kedua role boleh membaca `investments.overview` dan registry instrumen. Portfolio mengikuti readability rekening existing; portfolio personal pasangan dapat dibaca karena transparency policy dua pengguna, tetapi backend menandai capability operasional secara terpisah.
- Administrator dan Member boleh membuat portfolio hanya pada rekening `investment` yang **operable** bagi actor. Saat onboarding pertama memakai `auto_create_rdn=true`, backend membuat rekening RDN canonical secara atomik dengan saldo Rp0: Administrator mendapat RDN `shared`, sedangkan Member mendapat RDN `personal` milik actor. Jalur internal ini tidak memberikan permission `accounts.create` generik kepada Member. Member tidak memperoleh capability atas RDN personal pasangan hanya karena mengetahui ID-nya.
- Buy, sell, valuation, dan reconciliation boleh dilakukan Administrator atau Member hanya bila portfolio/RDN shared atau personal milik actor. Setiap mutation membaca ulang portfolio + ownership backend, memerlukan idempotency, dan memakai `row_version`; frontend `can_operate` hanya affordance UX.
- Registry instrumen (`investments.instruments.upsert`) dan correction reguler (`investments.corrections.create`) Administrator-only. `investments.openingPositions.create` tersedia bagi actor yang dapat mengoperasikan portfolio hanya selama fase kondisi awal masih terbuka; backend menolak penggunaan opening position sebagai backdoor untuk menulis ulang histori setelah aktivitas reguler. Correction tidak boleh menjadi backdoor Member untuk menambah holding/cash atau menulis ulang histori.
- Status instrumen `inactive` melarang buy baru tetapi tidak menghapus hak menjual holding existing yang memang sudah dimiliki actor pada portfolio operable.
- Rekonsiliasi hanya membandingkan snapshot as-of tanggal yang diminta dan tidak memperluas authorization atau melakukan auto-adjust. Mismatch harus tetap eksplisit sampai Administrator memilih correction yang diaudit.

## Recurring occurrence dan preferensi notifikasi

- Melewati atau memulihkan satu occurrence (`recurring.cancelOccurrence` / `recurring.restoreOccurrence`) adalah keputusan planning Administrator-only. Aksi ini tidak membuat ledger entry dan tidak mengubah saldo.
- Administrator dan Member boleh membaca serta mengubah **preference notifikasi miliknya sendiri**. `user_id`, actor, role, timestamp, dan audit identity tetap ditentukan backend; client tidak dapat mengubah preference pengguna lain.
- Administrator dan Member boleh membuat, membaca, mengubah, dan membatalkan **pengingat manual miliknya sendiri** untuk entity yang memang boleh diakses actor. Backend menentukan `user_id`, memvalidasi ownership/assignee, waktu, `row_version`, audit, dan status entity; client tidak dapat membuat reminder untuk scope pengguna lain.
- Hak menerima alert tidak memperluas hak membaca data. Push detail hanya dibuat dari data yang sudah lolos guard backend dan hanya dikirim ke subscription milik penerima; preference tetap memfilter tipe alert otomatis sebelum queue dibuat.

## Guard recovery Alokasi Dana

- Archive/restore/delete-unused aturan Alokasi Dana tetap Administrator-only. Member boleh membuat/mengelola Alokasi Dana shared yang dapat diakses serta Alokasi Dana personal yang bersumber dari rekening pribadinya sendiri, termasuk add/release dana; pada shared allocation, guard `assignee_user_id` tetap membatasi Member ke Jatah Bersama atau jatahnya sendiri. Planning personal anggota lain tetap read-only.
- Member boleh membatalkan `envelopes.reverseMovement` hanya untuk movement miliknya dan tetap tunduk pada ownership scope, `row_version`, ketersediaan nominal di Alokasi Dana tujuan, idempotency, dan audit backend.
- Movement Alokasi Dana tidak pernah hard-delete. Envelope rule baru boleh memakai `envelopes.deleteUnusedRule` hanya bila server membuktikan rule belum pernah dipakai dan satu-satunya child adalah initial empty period; selain itu gunakan archive/restore.

## Ownership penting

- Kedua pengguna aktif yang lolos verifikasi Firebase, signed session, status/role canonical tabel `users`, dan binding identitas dapat **membaca seluruh rekening serta ledger**: shared, personal milik sendiri, dan personal milik pasangan. Transparansi baca ini mencakup saldo, nomor rekening, transaksi pembentuk saldo, laporan, dashboard, dan riwayat rekonsiliasi.
- Rekening personal selalu membawa `owner_name` dari join backend serta capability server-side. Frontend tidak boleh menentukan pemilik atau hak akses dari nama rekening, email client, atau role yang dikirim browser.
- Hak operasi tetap lebih sempit: member hanya dapat bertransaksi dan merekonsiliasi rekening shared atau rekening personal miliknya. Rekening personal pasangan memiliki `read_only=true`, `can_transact=false`, dan `can_reconcile=false`.
- Transfer dari rekening personal milik Member → shared atau rekening personal lain dapat dilakukan langsung; authority debit tetap hanya pada rekening sumber milik Member. Transfer shared → rekening personal mana pun memerlukan `transferRequests.request` dan approval Administrator; direct mutation ditolak `TRANSFER_APPROVAL_REQUIRED`. Approval membaca ulang requester/rekening, memakai idempotency + `row_version`, dan membuat tepat satu ledger transaksi canonical dalam transaksi database yang sama.
- Frontend menerima route transfer server-side (`direct`/`approval_required`) dari bootstrap hanya untuk menentukan affordance dan action API yang tepat. Route tersebut bukan authorization token; setiap mutation tetap membaca ulang actor/rekening/status/period dan menjalankan guard backend canonical.
- Target shared dapat didanai dari rekening shared atau rekening personal actor yang operable. Target personal hanya kompatibel dengan rekening shared atau personal pemilik Target yang sama; backend tetap menentukan capability dan account access.
- Member hanya dapat mengubah/cancel transaksi yang dibuatnya sendiri **dan** berada pada scope yang dapat dioperasikan. Request manual tetap ditolak backend.
- Alokasi Dana memiliki dimensi `assignee_user_id` terpisah dari ownership ledger. `NULL` berarti Jatah Bersama. Setiap Alokasi Dana canonical juga terikat pada tepat satu `source_account_id`; **rekening Investasi/RDN bukan sumber operasional yang valid untuk Alokasi baru**. Transaksi yang memakai Alokasi Dana wajib memakai rekening sumber yang sama dan realokasi baru hanya boleh antar Alokasi Dana dari rekening sumber yang sama. Member hanya boleh memakai atau memindahkan Jatah Bersama dan jatah miliknya sendiri; jatah pengguna lain ditolak backend. Rekening personal hanya boleh menjadi sumber jatah untuk pemilik rekening tersebut.
- `accounts.create/update/previewLifecycle/archive/restore/deleteUnused` tetap Administrator-only; Member hanya dapat mengajukan create lewat `accounts.requestCreate`. `categories.create/update/archive/restore/deleteUnused` tetap Administrator-only; Member hanya dapat mengajukan create lewat `categories.requestCreate`. Review master-data request dan transfer request tetap Administrator-only. `accounts.deleteUnused` hanya pengecualian sempit untuk rekening saldo awal dan saldo saat ini Rp0 yang belum pernah digunakan. `categories.deleteUnused`, `envelopes.deleteUnusedRule`, `recurring.deleteUnusedRule`, `goals.deleteUnused`, dan compatibility `budgets.deleteUnused` tetap Administrator-only dan hanya boleh berjalan setelah server membuktikan entity history-free; purge umum tetap dilarang. Untuk penggunaan harian, `budgets.previewLifecycle` dan `budgets.remove` boleh dipakai Member hanya pada Kebutuhan shared/owned-personal yang lolos guard scope serta assignee; service tidak memberi Member kemampuan hard-delete histori. Adjustment dan pemulihan transaksi cancelled tetap Administrator-only.
- User management, rekening/kategori master, lifecycle destruktif planning selain flow `budgets.remove` yang scope-guarded, period close/reopen, mirror/calendar manual sync, backup/import/restore/bersihkan data testing/integrity adalah Administrator-only sesuai action matrix. Member dapat create/update Alokasi Dana dan Jadwal Rutin pada scope `shared` atau `personal` miliknya sendiri; Kebutuhan (`budgets.upsert` dan `budgets.batchCreate`) mengikuti batas yang sama. Batch create tidak memperluas authority: seluruh item harus mengikuti scope/owner Alokasi yang dapat dikelola actor dan kegagalan ownership salah satu item/jadwal membatalkan batch. Target baru tetap wajib scope `shared`. Planning personal pengguna lain tetap ditolak backend. Disabled button frontend bukan boundary keamanan.
- Export lengkap Administrator-only melalui `/api/export`. Export dokumen laporan `kind:"report"` boleh dipakai Administrator/Member dan tetap dibatasi oleh read scope `reports.monthly`; client tidak dapat memperluas ledger dengan parameter export. Sheets mirror tetap shared-only.
- Read model rekening/ledger wajib memakai policy readable; write dan reconciliation create wajib memakai policy operable. Jangan mengandalkan filtering atau disabled button frontend.
- `totalBalance` tetap metrik readable/transparan seluruh rekening yang dapat dibaca, termasuk Cash RDN, untuk backward compatibility. `nonInvestmentBalance` adalah metrik readable **Saldo rekening** non-investasi dan menjadi konteks sekunder Beranda. `safeToSpend` adalah metrik actionable untuk angka utama **Dana Tersedia**, sedangkan `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` juga hanya boleh memakai rekening/scope operable actor **dan** selalu mengecualikan rekening Investasi/RDN.

## Keputusan role pasangan

UI menggunakan role **Administrator** dan **Member**. Untuk kompatibilitas data/session existing, key internal database/permission untuk Administrator tetap `owner`. Seluruh permission maintenance `reset.*`/`fullReset.*` berbasis role tersebut, sehingga berlaku untuk setiap Administrator aktif dan tidak dibatasi pada akun bootstrap pertama. `ALLOWED_USERS_JSON` menerima `administrator` dan menormalisasinya ke key internal tersebut hanya untuk bootstrap/recovery Administrator; role anggota aktif berasal dari tabel `users`. RFC-0016 amandemen 2026-08-25 mengizinkan Alokasi Dana, Kebutuhan, dan Jadwal Rutin Member pada scope `shared` atau `personal` miliknya sendiri; Target baru tetap wajib `shared`. Rekening, kategori, user management, archive/delete/restore planning, recovery, import/restore, schema, dan maintenance tetap Administrator-only. Backend memvalidasi scope/ownership pada setiap write dan default authorization tetap deny.

## Transparansi data keluarga

- Filter dan laporan hanya boleh dibangun dari transaksi/rekening yang lolos scope backend.
- `creatorExpenses` adalah aktivitas pencatatan keluarga, bukan kontribusi biaya. `costShareExpenses` tetap response compatibility untuk histori cost-share legacy dan tidak menjadi surface laporan canonical.
- Kedua pengguna terotorisasi membaca seluruh data finansial keluarga. `personal` membatasi siapa yang dapat mengoperasikan rekening, bukan siapa yang dapat melihatnya. Mode balance-only/contribution-only/private tidak masuk roadmap; RFC-0015 berstatus Rejected.

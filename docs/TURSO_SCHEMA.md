# Turso Schema

Schema canonical merupakan hasil berurutan `database/migrations/001_initial_schema.sql`, `database/migrations/002_account_number.sql`, `database/migrations/003_account_bank_template.sql`, `database/migrations/004_notification_deliveries.sql`, `database/migrations/005_notification_preferences.sql`, `database/migrations/006_account_ewallet_template.sql`, `database/migrations/007_envelope_assignee.sql`, `database/migrations/008_manual_reminders.sql`, `database/migrations/009_transaction_cost_sharing.sql`, `database/migrations/010_environment_sessions.sql`, `database/migrations/011_distributed_rate_limits.sql`, dan `database/migrations/012_member_collaboration.sql`, lalu dicatat pada `schema_migrations`. Migration production dijalankan eksplisit, bukan otomatis pada setiap request.

## Kelompok tabel

### Identity dan master

- `users`
- `accounts`
- `categories`
- `master_data_requests` — pengajuan create rekening/kategori oleh Member; payload sudah dinormalisasi backend, pending duplicate dicoalesce, review memakai `row_version`.
- `system_config`

### Finance dan planning

- `transactions`
- `envelope_rules`
- `envelope_periods`
- `envelope_movements`
- `recurring_rules`
- `recurring_occurrences`
- `budgets`
- `savings_goals`
- `goal_movements`
- `reconciliations`
- `period_closures`
- `transfer_requests` — pengajuan transfer shared → personal Member yang memerlukan approval Administrator; approval menautkan tepat satu `approved_transaction_id`.

### Guard dan operasional

- `audit_log`
- `idempotency_keys`
- `request_nonces` — nonce persisten untuk mencegah replay request scheduler/bridge bertanda tangan.
- `user_sessions` — registry session perangkat server-side; hanya menyimpan hash verifier, metadata perangkat coarse, expiry/revoke state, dan FK user. Raw session secret/cookie tidak disimpan.
- `rate_limit_buckets` — bucket ephemeral shared lintas instance untuk throttle backend; key sudah berupa hash+scope dan tabel tidak masuk logical backup. Bucket expired dibersihkan housekeeping dan restore terkontrol mengosongkannya.
- `integration_outbox`
- `integration_links`
- `notification_queue`
- `notification_deliveries`
- `notification_preferences` — preference tujuh tipe alert otomatis canonical per pengguna; row yang belum ada berarti aktif secara default.
- `manual_reminders` — pengingat one-shot milik pengguna yang terikat ke Jadwal Rutin, Kebutuhan, periode Alokasi Dana, atau Target.
- `push_subscriptions`
- `backup_runs`
- `import_previews`
- `restore_previews`
- `integrity_runs`
- `schema_migrations`

## Constraint utama

- Semua nominal memakai `INTEGER`; tidak ada `REAL` untuk Rupiah.
- `users.photo_url` kosong atau URL HTTPS Google profile yang diawali `https://lh3.googleusercontent.com/`; browser tidak menentukan authority user dari foto.
- `master_data_requests` dan `transfer_requests` menyimpan status lifecycle + `row_version`; request pending tidak boleh di-hard-delete sebagai jalan pintas review.
- `transactions.cost_share_mode` hanya `unspecified`, `equal`, atau `percentage`; `transactions.cost_share_json` menyimpan snapshot split integer untuk expense shared dan default `[]` untuk histori/non-split.
- Tabel bisnis memakai `STRICT`.
- Foreign key diaktifkan pada setiap koneksi dan diverifikasi oleh integrity check.
- `system_config.timezone` wajib tetap `Asia/Jakarta` dan `system_config.currency` wajib tetap `IDR`; business integrity melaporkan drift kedua nilai canonical tersebut.
- Ownership ledger shared wajib tanpa `owner_user_id`; personal wajib memiliki `owner_user_id`. `envelope_rules.assignee_user_id` adalah penerima jatah dan terpisah dari ownership ledger.
- Bentuk transaksi ditegakkan database: income/refund hanya rekening tujuan, expense hanya rekening sumber, transfer sumber/tujuan berbeda, adjustment hanya rekening sumber; link envelope/goal dibatasi pada tipe yang benar.
- Metadata cancellation harus konsisten dengan status transaksi.
- Saldo awal negatif hanya diizinkan ketika `allow_negative=1`.
- `accounts.account_number` kosong untuk data legacy/non-bank atau berisi 6–34 digit; service mewajibkannya untuk rekening bank baru dan menolak karakter selain angka, spasi, atau tanda hubung sebelum normalisasi.
- `accounts.bank_template` menyimpan template visual kartu bank secara terpisah dari nama rekening. Nilai rekening bank dibatasi ke `generic`, `bca`, `bni`, `btn`, `mandiri`, atau `permata`; rekening non-bank wajib `generic`.
- `accounts.ewallet_template` menyimpan provider visual E-wallet secara terpisah dari nama rekening. Nilai rekening E-wallet dibatasi ke `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, atau `linkaja`; rekening non-E-wallet wajib `generic`.
- Data finansial menggunakan `ON DELETE RESTRICT`.
- Audit dicegah dari update/delete melalui trigger append-only.
- Status transaksi normal berubah melalui soft cancel/archive, bukan hard delete.
- Idempotency unik per actor dan key.
- Antrean outbox dan Web Push menyimpan identitas worker; worker lama tidak boleh menyelesaikan row yang sudah direbut worker baru.
- Satu pengguna hanya boleh memiliki satu `manual_reminders` berstatus `scheduled` untuk satu objek. Waktu disimpan UTC setelah input divalidasi sebagai waktu Asia/Jakarta; perubahan memakai `row_version`. Service juga menolak penjadwalan baru selama dispatch reminder sebelumnya masih nonterminal di `notification_queue`, sehingga partial unique index tidak menjadi satu-satunya guard duplikasi delivery.

## Enum penting

Account type:

```text
cash, bank, ewallet, savings, emergency_fund, sinking_fund, investment, other
```

Transaction type:

```text
income, expense, transfer, refund, adjustment
```

Goal movement:

```text
deposit, withdrawal, adjustment
```

## Schema version

Versi aktif: `14`. API menolak operasi ketika schema belum dimigrasikan atau version tidak cocok. Setiap perubahan schema berikutnya wajib memiliki migration baru, backup, rollback plan, dan parity test.

### Migration v14 dan rollback

- `012_member_collaboration.sql` bersifat additive: menambah `users.photo_url`, `master_data_requests`, `transfer_requests`, index pending/status, lalu menaikkan `schema_version` ke 14. Migration tidak mengubah nominal, transaksi, saldo, account balance formula, atau audit append-only.
- Member dapat mengajukan rekening/kategori baru tanpa mendapat capability create master langsung. Approval Administrator menjalankan create canonical di transaction yang sama; reject hanya mengubah lifecycle request.
- Transfer shared → personal milik Member memakai `transfer_requests`; approval Administrator revalidates requester/rekening dan membuat satu transaksi canonical atomik. Transfer antar dua rekening personal dengan owner berbeda tetap tidak direpresentasikan dan ditolak.
- Logical backup v14 mencakup kedua tabel request dan `photo_url`; runtime v14 tetap menerima backup v3-v13 secara additive. Production migration tetap memerlukan backup verified schema v13, lalu `npm run db:migrate -- production` dan `npm run db:integrity -- production`.
- Rollback cepat dengan DROP/DELETE tidak diizinkan. Gunakan forward-fix atau restore backup pra-migration ke database terisolasi, integrity check, lalu repoint setelah approval.

### Migration v13 dan rollback

- `011_distributed_rate_limits.sql` bersifat additive: menambah `rate_limit_buckets` STRICT + expiry index lalu menaikkan `schema_version` ke 13. Ledger, saldo, transaksi, session registry, dan binding environment tidak diubah.
- Gateway, export, login Firebase, serta Google OAuth valid memakai process-local limiter sebagai lapisan murah dan bucket Turso sebagai counter lintas instance. Invalid OAuth callback tetap ditolak dari signed state sebelum external token exchange.
- `rate_limit_buckets` adalah state ephemeral security, tidak masuk `BACKUP_TABLES`, dibersihkan ketika expired, dan dihapus pada controlled restore. Runtime v14 tetap menerima logical backup v3-v13.
- Migration Production tetap memerlukan backup terverifikasi, `npm run db:migrate -- production`, `npm run db:integrity -- production`, dan parity evidence. Pemisahan live Development/Production tetap mengikuti ADR-0007 dan **belum dianggap selesai hanya karena schema v14**.
- Rollback schema tidak dilakukan dengan `DROP TABLE`; prioritaskan forward-fix. Jika rollback data diperlukan, restore backup pra-migration ke database terisolasi lalu repoint setelah integrity verification dan approval.

### Migration v12 dan rollback

- `010_environment_sessions.sql` bersifat additive: menambah `user_sessions`, `database_environment`, dan scheduler heartbeat di `system_config`, lalu menaikkan `schema_version` ke 12. Ledger, transaksi, saldo, kategori, rekening, dan cost-sharing tidak diubah.
- `database_environment` dimulai `unbound` dan harus di-bind eksplisit dengan `npm run db:bind-environment -- development|production`. Runtime fail-closed bila `VERCEL_ENV`, `DATABASE_ENVIRONMENT`, dan binding database tidak konsisten; Preview tidak boleh memakai database aktif.
- Session v2 memakai `session_id` + secret acak pada cookie signed/HttpOnly dan hanya SHA-256 verifier hash di `user_sessions`. Legacy cookie v1 tidak diterima sehingga cutover memerlukan login ulang.
- Backup logical v12 tidak membawa `user_sessions`, `database_environment`, maintenance flag, atau scheduler heartbeat. Runtime v14 tetap menerima backup v12; restore sukses menghapus session registry agar credential lama tidak hidup kembali.
- Sebelum migration Production wajib ada backup teknis terverifikasi. Setelah migration jalankan binding environment dan integrity check. Rollback ke runtime yang menerima legacy cookie dilarang; gunakan forward-fix atau restore pra-migration ke database terpisah lalu repoint setelah approval.

### Migration v11 dan rollback

- `009_transaction_cost_sharing.sql` bersifat additive. Migration menambah `transactions.cost_share_mode` dengan default `unspecified`, menambah `transactions.cost_share_json` dengan default `[]`, lalu menaikkan `schema_version` ke 11. Tidak ada backfill 50:50 dan tidak ada perubahan nilai saldo/ledger historis.
- Runtime v14 tetap menerima backup schema v3-v13 melalui normalisasi additive. Backup v10 dan lebih lama mendapat `cost_share_mode=unspecified` dan `cost_share_json=[]` saat restore; backup v11 menyimpan snapshot split canonical. Field v12/v13 yang bersifat runtime/security tidak diambil dari backup lama.
- Sebelum migration production wajib ada backup teknis terverifikasi. Setelah migration jalankan integrity check. Bila perilaku cost-sharing dari migration v11 bermasalah pada runtime v14, prioritaskan forward-fix; rollback data dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment setelah approval. Jangan `DROP COLUMN`, `DROP TABLE`, atau mengedit data produksi langsung sebagai rollback cepat.

### Migration v10 dan rollback

- Sebelum migration, buat backup teknis terverifikasi dan catat database target. Development memakai `npm run db:migrate`; Production wajib eksplisit dengan `npm run db:migrate -- production`.
- `008_manual_reminders.sql` bersifat additive. Migration hanya menambah tabel `manual_reminders`, unique partial index untuk satu pengingat aktif per user+objek, due index untuk scheduler, lalu menaikkan `schema_version` ke 10.
- Pengingat manual hanya mendukung `recurring_occurrence`, `budget`, `envelope_period`, dan `goal`. Transaksi, laporan, kategori, serta rekening tidak mendapat reminder manual generik karena tidak sesuai lifecycle domain.
- Waktu pengingat dipilih user dalam Asia/Jakarta, dikonversi server ke UTC, wajib future, dan maksimal 366 hari. Queue internal dapat membentuk title/body dari data objek terbaru, tetapi transport Web Push tidak membawa detail tersebut. Client tidak boleh mengirim actor, title, body, nominal, atau audit field sebagai sumber kebenaran.
- Archive/delete/complete/close/cancel pada entity membatalkan reminder `scheduled` terkait dalam transaction lifecycle yang sama; restore entity tidak menghidupkan reminder lama otomatis. Integrity check memverifikasi user/entity/access reminder `scheduled` serta parity queue untuk reminder `queued`.
- Runtime v10 tetap menerima backup schema v3-v9. Backup lama tidak memiliki `manual_reminders`; tabel tersebut diperlakukan kosong saat restore. Backup v10 menyertakan `manual_reminders`.
- Migration v9 `007_envelope_assignee.sql` tetap menjadi dasar penerima jatah. Migration v8 `006_account_ewallet_template.sql`, v7 `005_notification_preferences.sql`, dan v6 `004_notification_deliveries.sql` tetap menjadi dasar field sebelumnya.
- Bila deployment runtime v10 gagal, prioritaskan forward-fix. Rollback data dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment setelah approval. Jangan `DROP TABLE` atau mengubah data produksi langsung sebagai rollback cepat.

Arti dan lifecycle tabel didokumentasikan di `DATA_DICTIONARY.md`; kebijakan perubahan schema berada di `DATABASE_MIGRATION_POLICY.md`.

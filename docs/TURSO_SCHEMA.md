# Turso Schema

Schema canonical merupakan hasil berurutan `database/migrations/001_initial_schema.sql`, `database/migrations/002_account_number.sql`, `database/migrations/003_account_bank_template.sql`, `database/migrations/004_notification_deliveries.sql`, `database/migrations/005_notification_preferences.sql`, `database/migrations/006_account_ewallet_template.sql`, `database/migrations/007_envelope_assignee.sql`, dan `database/migrations/008_manual_reminders.sql`, lalu dicatat pada `schema_migrations`. Migration production dijalankan eksplisit, bukan otomatis pada setiap request.

## Kelompok tabel

### Identity dan master

- `users`
- `accounts`
- `categories`
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

### Guard dan operasional

- `audit_log`
- `idempotency_keys`
- `request_nonces` — nonce persisten untuk mencegah replay request scheduler/bridge bertanda tangan.
- `integration_outbox`
- `integration_links`
- `notification_queue`
- `notification_deliveries`
- `notification_preferences` — preference tujuh tipe alert otomatis canonical per pengguna; row yang belum ada berarti aktif secara default.
- `manual_reminders` — pengingat one-shot milik pengguna yang terikat ke jadwal rutin, anggaran, periode kantong, atau target.
- `push_subscriptions`
- `backup_runs`
- `import_previews`
- `restore_previews`
- `integrity_runs`
- `schema_migrations`

## Constraint utama

- Semua nominal memakai `INTEGER`; tidak ada `REAL` untuk Rupiah.
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
- Satu pengguna hanya boleh memiliki satu `manual_reminders` berstatus `scheduled` untuk satu objek. Waktu disimpan UTC setelah input divalidasi sebagai waktu Asia/Jakarta; perubahan memakai `row_version`.

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

Versi aktif: `10`. API menolak operasi ketika schema belum dimigrasikan atau version tidak cocok. Setiap perubahan schema berikutnya wajib memiliki migration baru, backup, rollback plan, dan parity test.

### Migration v10 dan rollback

- Sebelum `npm run db:migrate`, buat backup teknis terverifikasi dan catat database target.
- `008_manual_reminders.sql` bersifat additive. Migration hanya menambah tabel `manual_reminders`, unique partial index untuk satu pengingat aktif per user+objek, due index untuk scheduler, lalu menaikkan `schema_version` ke 10.
- Pengingat manual hanya mendukung `recurring_occurrence`, `budget`, `envelope_period`, dan `goal`. Transaksi, laporan, kategori, serta rekening tidak mendapat reminder manual generik karena tidak sesuai lifecycle domain.
- Waktu pengingat dipilih user dalam Asia/Jakarta, dikonversi server ke UTC, wajib future, dan maksimal 366 hari. Title/body Push dibuat server dari data objek terbaru. Client tidak boleh mengirim actor, title, body, nominal, atau audit field sebagai sumber kebenaran.
- Runtime v10 tetap menerima backup schema v3-v9. Backup lama tidak memiliki `manual_reminders`; tabel tersebut diperlakukan kosong saat restore. Backup v10 menyertakan `manual_reminders`.
- Migration v9 `007_envelope_assignee.sql` tetap menjadi dasar penerima jatah. Migration v8 `006_account_ewallet_template.sql`, v7 `005_notification_preferences.sql`, dan v6 `004_notification_deliveries.sql` tetap menjadi dasar field sebelumnya.
- Bila deployment runtime v10 gagal, prioritaskan forward-fix. Rollback data dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment setelah approval. Jangan `DROP TABLE` atau mengubah data produksi langsung sebagai rollback cepat.

Arti dan lifecycle tabel didokumentasikan di `DATA_DICTIONARY.md`; kebijakan perubahan schema berada di `DATABASE_MIGRATION_POLICY.md`.

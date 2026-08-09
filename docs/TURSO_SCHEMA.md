# Turso Schema

Schema canonical merupakan hasil berurutan `database/migrations/001_initial_schema.sql`, `database/migrations/002_account_number.sql`, `database/migrations/003_account_bank_template.sql`, `database/migrations/004_notification_deliveries.sql`, `database/migrations/005_notification_preferences.sql`, dan `database/migrations/006_account_ewallet_template.sql`, lalu dicatat pada `schema_migrations`. Migration production dijalankan eksplisit, bukan otomatis pada setiap request.

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
- `notification_preferences` — preference tujuh tipe alert canonical per pengguna; row yang belum ada berarti aktif secara default.
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
- Ownership shared wajib tanpa owner; personal wajib memiliki `owner_user_id`.
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

Versi aktif: `8`. API menolak operasi ketika schema belum dimigrasikan atau version tidak cocok. Setiap perubahan schema berikutnya wajib memiliki migration baru, backup, rollback plan, dan parity test.

### Migration v8 dan rollback

- Sebelum `npm run db:migrate`, buat backup teknis terverifikasi dan catat database target.
- `006_account_ewallet_template.sql` bersifat additive: menambah `accounts.ewallet_template` dengan default `generic`, enum provider yang dibatasi, dan constraint bahwa provider non-generic hanya valid untuk `account_type='ewallet'`.
- Migration melakukan backfill hanya pada rekening E-wallet existing untuk provider yang sudah dikenali oleh presentation layer (ShopeePay, DANA, GoPay, OVO, LinkAja). Nama rekening, saldo, ownership, transaksi, dan `bank_template` tidak diubah.
- Runtime v8 memakai `ewallet_template` sebagai sumber canonical. Deteksi nama hanya dipertahankan untuk object/backup legacy tanpa field tersebut.
- Backup schema v8 menyertakan `notification_preferences` dan `ewallet_template`. Runtime v8 tetap menerima backup schema v3, v4, v5, v6, dan v7; backup lama dinormalisasi dengan field additive dan preference notifikasi default aktif bila tabel preference belum ada.
- Migration v7 `005_notification_preferences.sql` tetap menjadi dasar preference tujuh jenis notifikasi per pengguna, sedangkan migration v6 `004_notification_deliveries.sql` tetap menjadi dasar retry Web Push per perangkat.
- Bila deployment runtime v8 gagal, gunakan forward-fix bila memungkinkan. Rollback data dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment setelah approval. Jangan menjatuhkan kolom/tabel secara langsung pada database produksi.

Arti dan lifecycle tabel didokumentasikan di `DATA_DICTIONARY.md`; kebijakan perubahan schema berada di `DATABASE_MIGRATION_POLICY.md`.

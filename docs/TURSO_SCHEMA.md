# Turso Schema

Schema canonical merupakan hasil berurutan `database/migrations/001_initial_schema.sql`, `database/migrations/002_account_number.sql`, dan `database/migrations/003_account_bank_template.sql`, lalu dicatat pada `schema_migrations`. Migration production dijalankan eksplisit, bukan otomatis pada setiap request.

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
- `accounts.bank_template` menyimpan template visual kartu secara terpisah dari nama rekening. Nilai rekening bank dibatasi ke `generic`, `bca`, `bni`, `btn`, `mandiri`, atau `permata`; rekening non-bank wajib `generic`.
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

Versi aktif: `5`. API menolak operasi ketika schema belum dimigrasikan atau version tidak cocok. Setiap perubahan schema berikutnya wajib memiliki migration baru, backup, rollback plan, dan parity test.

### Migration v5 dan rollback

- Sebelum `npm run db:migrate`, buat backup teknis terverifikasi dan catat database target.
- `003_account_bank_template.sql` bersifat additive; row lama memperoleh `bank_template='generic'`, lalu rekening bank dengan suffix nama legacy yang dikenali dipetakan ke template sesuai bank tanpa mengubah `name`, saldo, atau transaksi.
- Setelah migration, deploy runtime v5. Runtime v4 tidak boleh dipakai pada database yang sudah melaporkan schema v5 karena runtime lama tidak memahami kontrak template terpisah.
- Restore runtime v5 tetap menerima backup schema v3/v4; field yang belum ada dinormalisasi saat restore dan schema hasil restore ditutup pada version v5 sebelum integrity check.
- Bila deployment runtime gagal, utamakan forward-fix v5. Rollback ke runtime v4 hanya melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment secara terjaga. Jangan mencoba menghapus kolom langsung pada database produksi.
- Bila template sudah diubah setelah migration, rollback yang membuang kolom memerlukan preview dampak data dan approval baru. Nama rekening tidak boleh dipakai lagi sebagai storage template.


Arti dan lifecycle tabel didokumentasikan di `DATA_DICTIONARY.md`; kebijakan perubahan schema berada di `DATABASE_MIGRATION_POLICY.md`.

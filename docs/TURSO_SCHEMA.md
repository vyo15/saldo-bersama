# Turso Schema

Schema canonical berada di `database/migrations/001_initial_schema.sql` dan dicatat pada `schema_migrations`. Migration production dijalankan eksplisit, bukan otomatis pada setiap request.

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

Versi aktif: `3`. API menolak operasi ketika schema belum dimigrasikan atau version tidak cocok. Setiap perubahan schema berikutnya wajib memiliki migration baru, backup, rollback plan, dan parity test.


Arti dan lifecycle tabel didokumentasikan di `DATA_DICTIONARY.md`; kebijakan perubahan schema berada di `DATABASE_MIGRATION_POLICY.md`.

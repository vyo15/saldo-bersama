# Schema Google Sheets

Schema canonical berada di `apps-script/Schema.gs`.

```text
schema_version = 2
timezone = Asia/Jakarta
currency = IDR
```

Jumlah sheet canonical tetap 21:

- Identitas/config: `System_Config`, `Users`.
- Ledger/master: `Accounts`, `Categories`, `Transactions`.
- Rutin: `Recurring_Rules`, `Recurring_Occurrences`.
- Alokasi: `Budgets`, `Envelope_Rules`, `Envelope_Periods`, `Envelope_Movements`.
- Target: `Savings_Goals`, `Goal_Movements`.
- Closing: `Reconciliations`, `Period_Closures`.
- Integrasi: `Calendar_Sync`, `Notification_Queue`, `Push_Subscriptions`.
- Guard: `Audit_Log`, `Idempotency`, `Backup_Log`.

## Perubahan version 2

Version 2 menambahkan dua kolom pada:

- `Recurring_Rules`: `scope`, `owner_user_id`.
- `Budgets`: `scope`, `owner_user_id`.
- `Savings_Goals`: `scope`, `owner_user_id`.

Kolom ditambahkan melalui migration, bukan edit header manual.

## Aturan ownership

- `scope=shared` wajib memiliki `owner_user_id` kosong.
- `scope=personal` wajib memiliki owner aktif.
- Account memakai `owner_scope` dan `owner_user_id`.
- Transaction scope/owner diturunkan dari rekening; client tidak boleh menentukan nilai bebas.
- Transfer hanya di antara rekening dengan ownership sama.
- Envelope, recurring, budget, dan goal harus konsisten dengan rekening/rule referensinya.
- Owner adalah administrator; member hanya dapat membaca shared dan personal miliknya.

## Aturan data

- Rupiah integer; tidak ada float.
- ID UUID stabil; row number bukan ID.
- Entity editable memakai `row_version`.
- Transaksi normal memakai soft cancel.
- Formula-like input `= + - @` dinetralkan.
- Saldo, budget usage, envelope remaining, dan goal progress dihitung dari ledger aktif.
- Transfer bukan income/expense.
- Header dan sheet sistem diproteksi.

## Setup baru

`setupSaldoBersama()` memakai LockService, menyimpan `SPREADSHEET_ID` otomatis, membuat schema v2, memvalidasi header/version, melindungi sheet, lalu menandai `SETUP_STATUS=ready`. Sheet bawaan kosong dapat dihapus setelah validasi.

## Migration version 1 ke 2

1. Jalankan `previewSchemaMigrationV2()` sebagai owner aktif.
2. Preview wajib memiliki `ambiguous=0` untuk recurring, budget, dan goal.
3. Set Script Property sementara `MIGRATION_CONFIRMATION=MIGRATE_V2`.
4. Jalankan `runSchemaMigrationV2()`.
5. Safety backup v1 diverifikasi sebelum write.
6. Apply memakai maintenance + LockService.
7. Schema v2 dan integrity diperiksa sebelum sukses.
8. Gagal apply memicu rollback terverifikasi; gagal rollback memicu recovery lock.

Data dianggap ambigu bila rekening referensi hilang, rekening personal tidak memiliki owner, atau budget tidak memiliki envelope rule valid. Migration tidak akan mengubah data ambigu menjadi shared secara diam-diam.

## Larangan

Jangan mengubah nama sheet, urutan header, schema version, atau ID secara manual. Perubahan schema berikutnya wajib approval, backup tervalidasi, version baru, preview, migration, rollback, integrity check, dan compatibility test.

# Schema Google Sheets

Schema canonical berada di `apps-script/Schema.gs`. Jangan mengubah nama sheet, urutan header, atau tipe makna kolom secara manual.

Versi awal:

```text
schema_version = 1
timezone = Asia/Jakarta
currency = IDR
```

## Kelompok sheet

- Identitas: `Users`.
- Ledger: `Accounts`, `Categories`, `Transactions`.
- Jadwal: `Recurring_Rules`, `Recurring_Occurrences`.
- Alokasi: `Envelope_Rules`, `Envelope_Periods`, `Envelope_Movements`, `Budgets`.
- Target: `Savings_Goals`, `Goal_Movements`.
- Penutupan: `Reconciliations`, `Period_Closures`.
- Integrasi: `Calendar_Sync`, `Notification_Queue`, `Push_Subscriptions`.
- Guard: `System_Config`, `Audit_Log`, `Idempotency`, `Backup_Log`.

## Aturan data utama

- Nominal rupiah disimpan sebagai integer positif pada transaksi normal.
- ID memakai UUID stabil; nomor baris tidak boleh menjadi ID.
- Entity editable menggunakan `row_version`.
- Transaksi normal dibatalkan melalui status serta metadata pembatalan, bukan menghapus baris.
- `Transactions.overspend_reason` menyimpan alasan ketika kebijakan kantong mengizinkan pengeluaran melewati alokasi.
- Saldo berjalan, sisa kantong, budget terpakai, dan progress target dihitung dari ledger; nilai tersebut bukan angka bebas edit.
- Transfer internal tidak masuk total pemasukan/pengeluaran.
- Alokasi dan mutasi kantong tidak sama dengan pengeluaran.
- Input teks dinetralkan untuk mencegah formula injection.

## Guard struktur

Saat request masuk, backend memeriksa:

1. seluruh sheet wajib tersedia;
2. jumlah kolom harus sama persis;
3. urutan header harus sama persis;
4. `schema_version` harus didukung;
5. user, account, category, envelope, recurring occurrence, dan goal yang direferensikan harus valid;
6. ID kritis tidak boleh duplikat;
7. minimal satu owner aktif harus tersedia.

Schema yang belum pernah dibuat dapat diinisialisasi oleh owner. Schema yang sudah ada tetapi rusak tidak boleh diperbaiki otomatis; aplikasi masuk mode baca saja sampai dilakukan recovery yang terkontrol.

Header seluruh sheet dilindungi. Sheet sistem seperti `System_Config`, `Audit_Log`, `Idempotency`, dan `Backup_Log` dilindungi secara penuh bila permission API memungkinkan.

## Perubahan schema

Perubahan schema wajib memiliki:

1. approval eksplisit;
2. backup production yang tervalidasi;
3. versi schema baru;
4. migration idempotent;
5. preview dampak;
6. integrity check;
7. rollback plan;
8. dokumentasi kompatibilitas frontend, API, Apps Script, import/export, dan backup lama.

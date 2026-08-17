# Data Dictionary

Schema column-level canonical merupakan hasil seluruh file berurutan di `database/migrations/`, saat ini dari `001_initial_schema.sql` sampai `008_manual_reminders.sql`. Dokumen ini menjelaskan arti dan lifecycle; bila ada perbedaan tipe/constraint, migration menang.

## Aturan lintas tabel

- Rupiah memakai `INTEGER`, bukan float.
- Waktu canonical ISO UTC; tanggal bisnis/timezone mengikuti `Asia/Jakarta`.
- ID dibuat server-side.
- Actor/timestamp/audit field dibuat server.
- `row_version` naik setiap perubahan optimistic.
- `shared` tidak memiliki `owner_user_id`; `personal` wajib memiliki owner.
- Data finansial normal tidak di-hard-delete.
- Foreign key wajib aktif.
- Backup/import/restore mengikuti preview dan integrity guard.

## Tabel

| Tabel | Tujuan | Sensitivitas | Lifecycle |
|---|---|---|---|
| `schema_migrations` | Riwayat migration yang sudah diterapkan. | Sedang | Migration-only |
| `system_config` | Konfigurasi runtime internal seperti schema version, maintenance, timezone, dan currency. | Sedang | Migration-only |
| `users` | Identitas aplikasi yang terikat pada Firebase UID, email, role, dan status. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `accounts` | Rekening shared/personal beserta nomor rekening bank, template visual bank/E-wallet, saldo awal, dan kebijakan saldo negatif. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `categories` | Kategori pemasukan/pengeluaran. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_rules` | Definisi kantong/alokasi berkala, ownership ledger, dan penerima jatah (`assignee_user_id`). | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_periods` | Instance kantong per periode dan alokasi aktual. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `recurring_rules` | Aturan tagihan atau pemasukan rutin. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `recurring_occurrences` | Kejadian per jatuh tempo dari aturan rutin. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `savings_goals` | Target tabungan yang terhubung ke rekening. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `transactions` | Ledger transaksi income, expense, transfer, refund, dan adjustment. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_movements` | Realokasi atau mutasi kantong yang diaudit. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `budgets` | Anggaran kategori per periode. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `goal_movements` | Setoran/penarikan target yang terhubung ke transaksi. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `reconciliations` | Perbandingan saldo sistem dan saldo aktual. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `period_closures` | Snapshot serta status penutupan periode. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `audit_log` | Audit append-only untuk perubahan penting. | Tinggi | Append-only |
| `idempotency_keys` | Hasil write yang dapat diputar ulang secara aman dengan key sama. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `request_nonces` | Nonce anti-replay untuk request bertanda tangan. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `integration_outbox` | Antrean atomik menuju Sheets, Calendar, Drive, atau worker lain. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `integration_links` | Pemetaan entity internal dengan resource integrasi eksternal. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `notification_queue` | Antrean notifikasi per pengguna yang diproses worker. | Sedang | Service/API; data operasional, dibersihkan hanya melalui workflow maintenance |
| `notification_deliveries` | Status pengiriman per notification dan subscription untuk retry tanpa duplikasi perangkat sukses. | Tinggi | Service/API; endpoint tidak disalin ke backup finansial |
| `notification_preferences` | Preferensi tujuh tipe alert otomatis canonical untuk setiap pengguna. Row yang belum ada berarti tipe aktif; perubahan memakai `row_version` dan audit actor server-side. | Sedang | Service/API; ikut backup/restore, tidak menyimpan endpoint/credential Push |
| `manual_reminders` | Pengingat manual one-shot per user untuk jadwal rutin, anggaran, periode kantong, atau target. Menyimpan UTC `scheduled_at`, status, dan `row_version`; queue internal dapat membentuk copy server-side, sedangkan transport Web Push hanya membawa type/id/target privacy-safe. | Sedang | Service/API; ikut backup/restore; cancel melalui soft state; status `queued` ditautkan ke `notification_queue` lewat dedupe `manual-reminder:<reminder_id>`; title/body client tidak dipercaya |
| `push_subscriptions` | Subscription Web Push per pengguna/perangkat. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `backup_runs` | Metadata backup teknis dan statusnya. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `import_previews` | Preview import yang memiliki fingerprint dan masa berlaku. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `restore_previews` | Preview restore yang memiliki fingerprint dan masa berlaku. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `integrity_runs` | Hasil pemeriksaan integritas database. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |

## Field finansial utama

- `transactions.amount`, `accounts.initial_balance`, budget, envelope, goal, occurrence, reconciliation: integer Rupiah.
- `envelope_rules.assignee_user_id`: nullable; `NULL` berarti Jatah Bersama. Jika terisi, wajib menunjuk pengguna aktif pada create/restore dan tidak mengubah `scope`/`owner_user_id` ledger.
- `accounts.account_number`: string 6–34 digit untuk rekening bank. Backend menormalisasi spasi/tanda hubung, UI hanya menampilkan kepada actor yang lolos scope authorization, audit menyimpan empat digit terakhir, dan Sheets/export baca tidak menyertakannya.
- `accounts.bank_template`: template visual kartu bank yang tidak mengubah nama rekening. Enum rekening bank: `generic`, `bca`, `bni`, `btn`, `mandiri`, `permata`; rekening non-bank wajib `generic`. Field divalidasi backend, ikut backup/restore, dan perubahan tercatat pada audit account.
- `accounts.ewallet_template`: provider visual E-wallet yang tidak mengubah nama rekening. Enum E-wallet: `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, `linkaja`; rekening non-E-wallet wajib `generic`. Field divalidasi backend, ikut backup/restore, dan perubahan tercatat pada audit account.
- `transactions.transaction_type`: `income`, `expense`, `transfer`, `refund`, `adjustment`.
- Transfer wajib source dan destination berbeda.
- `transactions.status` menentukan dampak saldo; cancelled/archived tidak dihitung.
- `owner_scope`/`scope`: `shared` atau `personal`.
- `created_by`, `updated_by`, cancellation/reversal actor: server canonical.


## Data turunan tanpa kolom baru

Field berikut dihitung saat read dan tidak disimpan sebagai angka bebas edit:

- `balance`, `safeToSpend`, `unallocatedFunds`;
- `progress_percent`, `remaining_amount`, `required_monthly_amount`, `pace_status` target;
- tren 3/6/12 bulan dan breakdown laporan;
- budget/kantong threshold serta alert rekonsiliasi.

## Model planned — belum ada di schema v10

Nama berikut hanya kebutuhan/RFC dan **bukan** tabel/kolom runtime:

- transaction lifecycle, `used_by`, receipt reference, draft/planned: RFC-0011;
- obligation/debt/receivable/settlement: RFC-0012;
- contribution, payer, beneficiary, cost split: RFC-0013;
- category parent dan goal stage: RFC-0014;
- account visibility policy/backend projection: RFC-0015.

Jangan menambahkan field tersebut ke payload atau UI sebelum migration, API contract, authorization, audit, backup/restore, dan rollback disetujui.


## Schema v10

Migration canonical terbaru: `008_manual_reminders.sql` pada `database/migrations/`. Migration v10 menambah reminder manual one-shot tanpa mengubah tabel ledger finansial existing.

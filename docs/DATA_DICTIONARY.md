# Data Dictionary

Schema column-level canonical merupakan hasil seluruh file berurutan di `database/migrations/`, saat ini dari `001_initial_schema.sql` sampai `011_distributed_rate_limits.sql`. Dokumen ini menjelaskan arti dan lifecycle; bila ada perbedaan tipe/constraint, migration menang.

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
| `user_sessions` | Registry session perangkat server-side dengan verifier hash, expiry/revoke state, dan metadata perangkat coarse. Raw secret/cookie tidak pernah disimpan. | Tinggi | Backend auth/session lifecycle; tidak masuk logical backup |
| `users` | Identitas aplikasi yang terikat pada Firebase UID, email, role, dan status. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `accounts` | Rekening shared/personal beserta nomor rekening bank, template visual bank/E-wallet, saldo awal, dan kebijakan saldo negatif. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `categories` | Kategori pemasukan/pengeluaran. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_rules` | Definisi internal Alokasi Dana berkala, ownership ledger, dan penerima jatah (`assignee_user_id`). | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_periods` | Instance Alokasi Dana per periode dan alokasi aktual. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `recurring_rules` | Aturan tagihan atau pemasukan rutin. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `recurring_occurrences` | Kejadian per jatuh tempo dari aturan rutin. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `savings_goals` | Target tabungan yang terhubung ke rekening. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `transactions` | Ledger transaksi income, expense, transfer, refund, dan adjustment. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_movements` | Realokasi atau mutasi Alokasi Dana yang diaudit. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `budgets` | Anggaran kategori per periode. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `goal_movements` | Setoran/penarikan target yang terhubung ke transaksi. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `reconciliations` | Perbandingan saldo sistem dan saldo aktual. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `period_closures` | Snapshot serta status penutupan periode. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `audit_log` | Audit append-only untuk perubahan penting. | Tinggi | Append-only |
| `idempotency_keys` | Hasil write yang dapat diputar ulang secara aman dengan key sama. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `request_nonces` | Nonce anti-replay untuk request bertanda tangan. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `rate_limit_buckets` | Counter throttle ephemeral lintas instance; hanya key hash+scope, window/count, dan timestamp. | Sedang | Backend-only; tidak masuk logical backup; expired cleanup di-housekeeping; controlled restore mengosongkannya |
| `integration_outbox` | Antrean atomik menuju Sheets, Calendar, Drive, atau worker lain. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `integration_links` | Pemetaan entity internal dengan resource integrasi eksternal. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `notification_queue` | Antrean notifikasi per pengguna yang diproses worker. | Sedang | Service/API; data operasional, dibersihkan hanya melalui workflow maintenance |
| `notification_deliveries` | Status pengiriman per notification dan subscription untuk retry tanpa duplikasi perangkat sukses. | Tinggi | Service/API; endpoint tidak disalin ke backup finansial |
| `notification_preferences` | Preferensi tujuh tipe alert otomatis canonical untuk setiap pengguna. Row yang belum ada berarti tipe aktif; perubahan memakai `row_version` dan audit actor server-side. | Sedang | Service/API; ikut backup/restore, tidak menyimpan endpoint/credential Push |
| `manual_reminders` | Pengingat manual one-shot per user untuk Jadwal Rutin, Kebutuhan, periode Alokasi Dana, atau Target. Menyimpan UTC `scheduled_at`, status, dan `row_version`; queue internal dapat membentuk copy server-side, sedangkan transport Web Push hanya membawa type/id/target privacy-safe. | Sedang | Service/API; ikut backup/restore; cancel melalui soft state; status `queued` ditautkan ke `notification_queue` lewat dedupe `manual-reminder:<reminder_id>`; title/body client tidak dipercaya |
| `push_subscriptions` | Subscription Web Push per pengguna/perangkat. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `backup_runs` | Metadata backup teknis dan statusnya. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `import_previews` | Preview import yang memiliki fingerprint dan masa berlaku. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `restore_previews` | Preview restore yang memiliki fingerprint dan masa berlaku. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `integrity_runs` | Hasil pemeriksaan integritas database. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |

## Field finansial utama

- `transactions.amount`, `accounts.initial_balance`, budget, envelope, goal, occurrence, reconciliation: integer Rupiah.
- `envelope_rules.assignee_user_id`: nullable; `NULL` berarti Jatah Bersama. Jika terisi, wajib menunjuk pengguna aktif pada create/restore dan tidak mengubah `scope`/`owner_user_id` ledger.
- `envelope_rules.source_account_id`: kolom schema tetap nullable untuk kompatibilitas backup/data legacy, tetapi runtime mewajibkannya untuk Alokasi Dana baru, pemakaian transaksi, realokasi baru, dan restore rule. Satu Alokasi Dana aktif canonical terikat pada tepat satu rekening sumber.
- `accounts.account_number`: string 6–34 digit untuk rekening bank. Backend menormalisasi spasi/tanda hubung, UI hanya menampilkan kepada actor yang lolos scope authorization, audit menyimpan empat digit terakhir, dan Sheets/export baca tidak menyertakannya.
- `accounts.bank_template`: template visual kartu bank yang tidak mengubah nama rekening. Enum rekening bank: `generic`, `bca`, `bni`, `btn`, `mandiri`, `permata`; rekening non-bank wajib `generic`. Field divalidasi backend, ikut backup/restore, dan perubahan tercatat pada audit account.
- `accounts.ewallet_template`: provider visual E-wallet yang tidak mengubah nama rekening. Enum E-wallet: `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, `linkaja`; rekening non-E-wallet wajib `generic`. Field divalidasi backend, ikut backup/restore, dan perubahan tercatat pada audit account.
- `transactions.transaction_type`: `income`, `expense`, `transfer`, `refund`, `adjustment`.
- `transactions.cost_share_mode`: `unspecified`, `equal`, atau `percentage`. Hanya expense shared yang boleh memiliki mode selain `unspecified`.
- `transactions.cost_share_json`: JSON snapshot server-side berisi `{user_id,basis_points,share_amount}`. Total `basis_points` wajib 10.000 dan total `share_amount` wajib sama dengan `transactions.amount`; field tidak dipercaya dari client.
- Transfer wajib source dan destination berbeda.
- Expense yang memiliki `envelope_period_id` wajib memakai `source_account_id` yang sama dengan `envelope_rules.source_account_id`; expense tanpa Alokasi Dana dan Transfer tidak boleh memakai dana yang masih berada dalam `allocated_remaining` pada rekening non-`allow_negative`.
- `transactions.status` menentukan dampak saldo; cancelled/archived tidak dihitung.
- `owner_scope`/`scope`: `shared` atau `personal`.
- `created_by`, `updated_by`, cancellation/reversal actor: server canonical.


## Data turunan tanpa kolom baru

Field berikut dihitung saat read dan tidak disimpan sebagai angka bebas edit:

- `balance`: saldo fisik rekening dari saldo awal + transaksi aktif hingga cutoff;
- `allocated_remaining`: total bagian alokasi aktif yang masih tertahan pada rekening sumber. Dana `reserved_amount` tetap bagian dari alokasi dan tidak dibebaskan sebagai dana tersedia; pengeluaran Alokasi Dana hanya mengurangi sisa setelah tanggal transaksi mencapai cutoff;
- `available_balance = balance - allocated_remaining`; membuat Alokasi Dana tidak mengubah `balance`, sedangkan pemakaian Alokasi Dana mengurangi `balance` dan `allocated_remaining` bersamaan;
- `safeToSpend`, `unallocatedFunds`;
- `progress_percent`, `remaining_amount`, `required_monthly_amount`, `pace_status` target;
- tren 3/6/12 bulan dan breakdown laporan;
- Kebutuhan/Alokasi Dana threshold serta alert rekonsiliasi.

## Model planned — belum ada di schema v13

Nama berikut hanya kebutuhan/RFC dan **bukan** tabel/kolom runtime:

- transaction lifecycle, participant role eksplisit (`payer`, `beneficiary`, `liable_party`), receipt reference, draft/planned: RFC-0011;
- obligation/debt/receivable/settlement: RFC-0012;
- payer, beneficiary, actual contribution, settlement, dan template split lanjutan: follow-up RFC-0013;
- category parent dan goal stage: RFC-0014;
- account visibility policy/backend projection: RFC-0015;
- transaction line item multi-kategori/multi-Kebutuhan dengan satu cash movement: RFC-0019.

Jangan menambahkan field tersebut ke payload atau UI sebelum migration, API contract, authorization, audit, backup/restore, dan rollback disetujui.


## Schema v13

Migration canonical terbaru: `011_distributed_rate_limits.sql` pada `database/migrations/`. Migration v13 menambah bucket rate limit durable lintas instance tanpa mengubah ledger/saldo; migration v12 tetap menjadi dasar registry session perangkat, binding environment, dan heartbeat scheduler. Migration v11 `009_transaction_cost_sharing.sql` tetap menjadi dasar field pembagian beban biaya; histori dan backup lama dinormalisasi secara additive.

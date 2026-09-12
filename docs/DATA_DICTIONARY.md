# Data Dictionary

> **Status:** Canonical  
> **Purpose:** Menjelaskan arti, ownership, sensitivitas, dan lifecycle data current.  
> **Update when:** Makna field/table atau lifecycle data berubah.  
> **Boundary:** Tipe/constraint authoritative berada di migration; kronologi migration berada di Git/CHANGELOG.

Schema column-level canonical merupakan hasil seluruh file berurutan di `database/migrations/`, saat ini dari `001_initial_schema.sql` sampai `018_envelope_decoration.sql`. Dokumen ini menjelaskan arti dan lifecycle; bila ada perbedaan tipe/constraint, migration menang.

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
| `sync_revisions` | Revision kecil per read-resource untuk invalidation realtime lintas perangkat; bukan financial authority. | Rendah | Runtime metadata; dapat diregenerasi dan tidak masuk logical backup |
| `system_config` | Konfigurasi runtime internal seperti schema version, maintenance, timezone, dan currency. | Sedang | Migration-only |
| `user_sessions` | Registry session perangkat server-side dengan verifier hash, expiry/revoke state, dan metadata perangkat coarse. Raw secret/cookie tidak pernah disimpan. | Tinggi | Backend auth/session lifecycle; tidak masuk logical backup |
| `users` | Identitas aplikasi yang terikat pada Firebase UID, email, role, dan status. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `master_data_requests` | Pengajuan create rekening/kategori oleh Member. Menyimpan payload canonical, request key, status, reviewer, alasan, entity hasil, dan `row_version`. | Tinggi | Member create request; Administrator review; ikut backup/restore |
| `transfer_requests` | Pengajuan transfer Member dari shared → rekening personal. Menyimpan payload transfer canonical, reviewer, transaction hasil, status, dan `row_version`. | Tinggi | Member request; Administrator review; approval atomik dengan ledger; ikut backup/restore |
| `accounts` | Rekening shared/personal beserta nomor rekening bank, template visual bank/E-wallet, saldo awal, kebijakan saldo negatif, dan flag internal `is_system_hidden` untuk compatibility Investasi. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `categories` | Kategori pemasukan/pengeluaran. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_rules` | Definisi internal Alokasi Dana berkala, ownership ledger, penerima jatah (`assignee_user_id`), dan pemanis visual (`decoration_key`). | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `envelope_periods` | Instance Alokasi Dana per periode dan alokasi aktual. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `recurring_rules` | Aturan tagihan atau pemasukan rutin. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `recurring_occurrences` | Kejadian per jatuh tempo dari aturan rutin. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `savings_goals` | Target tabungan yang terhubung ke rekening. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `transactions` | Ledger transaksi income, expense, transfer, refund, dan adjustment. | Tinggi | Service/API; hard delete dilarang untuk data finansial normal |
| `investment_portfolios` | Compatibility container yang mengikat histori investasi ke satu rekening `account_type=investment`; broker context dipertahankan untuk data lama tetapi tidak menjadi hierarchy UI current. | Tinggi | Service/API; satu RDN per portfolio; ikut backup/restore |
| `investment_instruments` | Registry ticker, nama, exchange, lot size, status, dan `row_version`. | Sedang | Administrator mengelola; readable kedua role; ikut backup/restore |
| `investment_trades` | Histori buy/sell append-only berisi lot, lembar, harga, fee, gross, cash, `cash_effect_enabled`, actor, dan idempotency key. | Tinggi | Financial authority Investment; tidak menjadi income/expense; ikut backup/restore |
| `investment_valuations` | Snapshot harga manual per portfolio/instrumen/tanggal. | Sedang | Append-only valuation; tidak mengubah saldo; ikut backup/restore |
| `investment_reconciliations` | Snapshot recorded vs actual cash/holding pada tanggal rekonsiliasi, status match/mismatch, notes, dan diff JSON. | Tinggi | Tidak auto-adjust; ikut backup/restore |
| `investment_corrections` | Event correction/opening-position append-only dengan share/cost-basis/cash delta, `cash_effect_enabled`, alasan, dan reference price. | Tinggi | Tidak rewrite trade history; ikut backup/restore |
| `envelope_movements` | Realokasi atau mutasi Alokasi Dana yang diaudit. | Sedang | Service/API; hard delete dilarang untuk data finansial normal |
| `budgets` | Kebutuhan operasional per periode terbuka, termasuk metadata penghentian dan total dana yang sudah dilepas. | Sedang | User-facing remove memilih delete history-free atau ended/archive; row periode tertutup dipadatkan |
| `budget_history` | Histori compact Kebutuhan periode tertutup: snapshot nama, nominal, pemakaian, dana dilepas, status akhir, ownership, dan metadata minimum untuk reopen. | Sedang | Dibuat saat period close, dibaca report, direhidrasi lalu dihapus saat reopen; ikut backup/restore |
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

- `users.photo_url`: kosong atau URL profil Google tepercaya `https://lh3.googleusercontent.com/...`; bukan field authorization.
- `transactions.amount`, `accounts.initial_balance`, budget, envelope, goal, occurrence, reconciliation: integer Rupiah.
- `envelope_rules.assignee_user_id`: nullable; `NULL` berarti Jatah Bersama. Jika terisi, wajib menunjuk pengguna aktif pada create/restore dan tidak mengubah `scope`/`owner_user_id` ledger.
- `envelope_rules.decoration_key`: metadata presentasi non-finansial; default `auto`, pilihan eksplisit dibatasi ke template canonical. Tidak mengubah saldo, status, ownership, atau rekonsiliasi.
- `envelope_rules.source_account_id`: kolom schema tetap nullable untuk kompatibilitas backup/data legacy, tetapi runtime mewajibkannya untuk Alokasi Dana baru, pemakaian transaksi, realokasi baru, dan restore rule. Satu Alokasi Dana aktif canonical terikat pada tepat satu rekening sumber.
- `accounts.account_number`: string 6–34 digit untuk rekening bank. Backend menormalisasi spasi/tanda hubung, UI hanya menampilkan kepada actor yang lolos scope authorization, audit menyimpan empat digit terakhir, dan Sheets/export baca tidak menyertakannya.
- `accounts.bank_template`: template visual kartu bank yang tidak mengubah nama rekening. Enum rekening bank: `generic`, `bca`, `bni`, `btn`, `mandiri`, `permata`; rekening non-bank wajib `generic`. Field divalidasi backend, ikut backup/restore, dan perubahan tercatat pada audit account.
- `accounts.is_system_hidden`: integer boolean default `0`; `1` hanya untuk rekening compatibility yang dibuat backend bagi Investasi asset-centric. Row hidden tidak dikembalikan oleh `accounts.list`/picker user-facing dan bukan rekening yang dapat dikelola user.
- `accounts.ewallet_template`: provider visual E-wallet yang tidak mengubah nama rekening. Enum E-wallet: `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, `linkaja`; rekening non-E-wallet wajib `generic`. Field divalidasi backend, ikut backup/restore, dan perubahan tercatat pada audit account.
- `transactions.budget_id`: nullable link eksplisit ke Kebutuhan yang menghasilkan expense. Tidak memakai FK ke `budgets` karena row operasional dapat dipadatkan ke `budget_history`; backend memvalidasi periode, kategori, scope, dan Alokasi sebelum menyimpan.
- `recurring_rules.budget_id`: nullable link jadwal yang lahir dari Kebutuhan; future occurrence tidak otomatis dianggap memakai Kebutuhan bulan lama setelah row operasional dipadatkan.
- `transactions.transaction_type`: `income`, `expense`, `transfer`, `refund`, `adjustment`.
- `investment_portfolios.rdn_account_id`: FK unik ke rekening `account_type=investment`; runtime mewajibkan rekening aktif, operable saat create, dan `allow_negative=0`. `row_version` portfolio menjadi optimistic-lock token seluruh mutation portfolio.
- `investment_instruments.lot_size`: integer positif untuk konversi lot → lembar. Ticker unik uppercase; status `inactive` melarang buy baru tetapi tidak memblok sell holding existing.
- `investment_trades`: `lots`, `share_quantity`, `price_per_share`, `fee_amount`, `gross_amount`, `cash_amount` semuanya integer; `cash_effect_enabled` default `1` untuk histori lama dan bernilai `0` pada Buy/Sell current; `notes` adalah catatan opsional maks. 500 karakter; service/integrity memastikan lembar = lot × lot size, gross = lembar × harga, buy cash = gross + fee, sell cash = gross - fee.
- `investment_valuations.price_per_share`: integer positif; snapshot harga tidak mengubah cash/ledger. Harga read-model paling baru dapat berasal dari valuation atau trade terakhir.
- `investment_reconciliations.recorded_*` adalah snapshot state system **as-of `reconciliation_date`** dan `actual_*` adalah input broker user. `difference_json` hanya diagnosis; tidak mengubah data finansial.
- `investment_corrections.share_delta`, `cost_basis_delta`, `cash_delta`: delta eksplisit append-only. `cash_effect_enabled` default `1` untuk compatibility; direct asset opening-position current memakai `0` agar tidak mengubah saldo rekening. `correction_type` membedakan `correction` vs `opening_position`; opening position juga dapat menyimpan `reference_price` dan `notes`. Untuk baseline Saldo RDN tanpa aset, `instrument_id` boleh `NULL`, share/cost delta tetap nol, dan `cash_delta` wajib nonzero. Correction reguler hanya Administrator, sedangkan opening position mengikuti operability portfolio dan hanya tersedia sebelum aktivitas reguler.
- `transactions.cost_share_mode`: `unspecified`, `equal`, atau `percentage`. Hanya expense shared yang boleh memiliki mode selain `unspecified`.
- `transactions.cost_share_json`: JSON snapshot server-side berisi `{user_id,basis_points,share_amount}`. Total `basis_points` wajib 10.000 dan total `share_amount` wajib sama dengan `transactions.amount`; field tidak dipercaya dari client.
- Transfer wajib source dan destination berbeda.
- Expense yang memiliki `envelope_period_id` wajib memakai `source_account_id` yang sama dengan `envelope_rules.source_account_id`; expense tanpa Alokasi Dana dan Transfer tidak boleh memakai dana yang masih berada dalam `allocated_remaining` pada rekening non-`allow_negative`.
- Rekening `account_type=investment` hanya boleh dipakai oleh transaksi biasa jenis `transfer`; ordinary income/expense/refund/adjustment ditolak. Alokasi Dana/Jadwal Rutin baru juga tidak boleh menunjuk RDN. Data legacy tetap tersimpan/readable tetapi tidak menjadi binding operasional.
- `transactions.status` menentukan dampak saldo; cancelled/archived tidak dihitung.
- `owner_scope`/`scope`: `shared` atau `personal`.
- `created_by`, `updated_by`, cancellation/reversal actor: server canonical.


## Data turunan tanpa kolom baru

Field berikut dihitung saat read dan tidak disimpan sebagai angka bebas edit:

- `balance`: saldo fisik rekening dari saldo awal + cash-impact event canonical hingga cutoff; untuk rekening biasa event berasal dari transaksi aktif, sedangkan rekening Investasi legacy juga memasukkan `investment_account_events` yang hanya berisi event dengan `cash_effect_enabled=1`;
- `allocated_remaining`: total bagian alokasi aktif yang masih tertahan pada rekening sumber non-investasi. Untuk `account_type=investment`, alokasi legacy diperlakukan non-operasional dan read-model mengembalikan `0`; Dana `reserved_amount` pada rekening operasional tetap bagian dari alokasi dan tidak dibebaskan sebagai dana tersedia; pengeluaran Alokasi Dana hanya mengurangi sisa setelah tanggal transaksi mencapai cutoff;
- `available_balance = balance - allocated_remaining`; membuat wadah Alokasi kosong tidak mengubah kedua angka tersebut. Menyimpan/mengubah Kebutuhan atau manual adjustment dapat mengubah `allocated_remaining` tanpa mengubah `balance`; pemakaian Alokasi mengurangi `balance` dan `allocated_remaining` bersama. Pada RDN nilai available sama dengan Cash RDN karena alokasi legacy tidak operasional;
- `nonInvestmentBalance`: jumlah saldo rekening readable non-investasi; `totalBalance` tetap seluruh rekening readable termasuk RDN;
- `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, `allocatedRemaining`, dan reserved recurring operasional mengecualikan RDN dan mengikuti capability actor;
- `progress_percent`, `remaining_amount`, `required_monthly_amount`, `pace_status` target;
- tren 3/6/12 bulan dan breakdown laporan;
- Kebutuhan/Alokasi Dana threshold serta alert rekonsiliasi.
- `investment` holdings, remaining cost basis, average cost, market value, realized P/L, dan unrealized P/L dihitung dari trade/correction history + harga terakhir yang diketahui; tidak disimpan sebagai angka bebas edit.

## Model planned — belum ada di runtime

Nama berikut hanya kebutuhan/RFC dan **bukan** tabel/kolom runtime:

- transaction lifecycle, receipt reference, draft/planned: RFC-0011; participant payer/beneficiary/liable_party hanya dapat dihidupkan kembali bila positioning produk berubah;
- obligation/debt/receivable/settlement: RFC-0012;
- relasi refund ke expense asli dan compatibility split historis: follow-up RFC-0013;
- category parent dan goal stage: RFC-0014;
- transaction line item multi-kategori/multi-Kebutuhan dengan satu cash movement: RFC-0019.

Jangan menambahkan field tersebut ke payload atau UI sebelum migration, API contract, authorization, audit, backup/restore, dan rollback disetujui.


## Current schema marker

Versi runtime aktif: `20`. Latest migration canonical: `018_envelope_decoration.sql`. Migration menambah schema secara berurutan dan dicatat pada `schema_migrations`; arti current tidak memakai section per-version agar dictionary tidak berubah menjadi changelog.

Compatibility penting yang tetap current:

- `budget_history` + link `transactions.budget_id`/`recurring_rules.budget_id` menjaga lifecycle Kebutuhan setelah compaction.
- `sync_revisions` hanya koordinasi realtime dan tidak menjadi financial authority/backup data.
- `accounts.is_system_hidden` serta `cash_effect_enabled` menjaga Investment compatibility tanpa membocorkan hierarchy legacy ke flow user-facing.
- Backup lama yang didukung dinormalisasi secara additive oleh restore service; exact support range mengikuti recovery/schema tests, bukan history paragraph di file ini.

Detail migration/history berada di `database/migrations/` dan `CHANGELOG.md`; struktur/constraint current diringkas di `TURSO_SCHEMA.md`.

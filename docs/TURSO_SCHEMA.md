# Turso Schema

Schema canonical merupakan hasil berurutan `database/migrations/001_initial_schema.sql`, `database/migrations/002_account_number.sql`, `database/migrations/003_account_bank_template.sql`, `database/migrations/004_notification_deliveries.sql`, `database/migrations/005_notification_preferences.sql`, `database/migrations/006_account_ewallet_template.sql`, `database/migrations/007_envelope_assignee.sql`, `database/migrations/008_manual_reminders.sql`, `database/migrations/009_transaction_cost_sharing.sql`, `database/migrations/010_environment_sessions.sql`, `database/migrations/011_distributed_rate_limits.sql`, `database/migrations/012_member_collaboration.sql`, `database/migrations/013_investment_tracking.sql`, `database/migrations/014_investment_opening_position.sql`, `database/migrations/015_investment_asset_centric.sql`, `database/migrations/016_global_sync_revisions.sql`, `database/migrations/017_budget_lifecycle_history.sql`, dan `database/migrations/018_envelope_decoration.sql`, lalu dicatat pada `schema_migrations`. Migration production dijalankan eksplisit, bukan otomatis pada setiap request.

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
- `budgets` — Kebutuhan operasional periode terbuka.
- `budget_history` — representasi compact Kebutuhan setelah periode ditutup; dipakai report/reopen tanpa mempertahankan row operasional aktif.
- `savings_goals`
- `goal_movements`
- `reconciliations`
- `period_closures`
- `transfer_requests` — pengajuan transfer shared → personal Member yang memerlukan approval Administrator; approval menautkan tepat satu `approved_transaction_id`.
- `investment_portfolios` — compatibility container untuk histori investasi; UI v17 tidak menampilkan broker/portfolio sebagai hierarchy utama.
- `investment_instruments` — registry ticker/exchange/lot size global yang dikelola Administrator.
- `investment_trades` — histori buy/sell append-only; v17 menambah `cash_effect_enabled` agar record baru accounting-only tanpa mutasi rekening, sementara histori lama tetap kompatibel.
- `investment_valuations` — snapshot harga manual append-only.
- `investment_reconciliations` — snapshot perbandingan broker vs recorded state; tidak auto-adjust.
- `investment_corrections` — event correction/opening-position append-only; v17 menambah `cash_effect_enabled` untuk membedakan histori cash legacy dari posisi aset accounting-only.

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
- Ownership ledger shared wajib tanpa `owner_user_id`; personal wajib memiliki `owner_user_id`. `envelope_rules.assignee_user_id` adalah penerima jatah dan terpisah dari ownership ledger. `envelope_rules.decoration_key` hanya metadata presentasi kartu dan tidak memengaruhi nominal, ownership, status, atau ledger.
- Bentuk transaksi ditegakkan database: income/refund hanya rekening tujuan, expense hanya rekening sumber, transfer sumber/tujuan berbeda, adjustment hanya rekening sumber; link envelope/goal dibatasi pada tipe yang benar.
- Metadata cancellation harus konsisten dengan status transaksi.
- Saldo awal negatif hanya diizinkan ketika `allow_negative=1`.
- `accounts.account_number` kosong untuk data legacy/non-bank atau berisi 6–34 digit; service mewajibkannya untuk rekening bank baru dan menolak karakter selain angka, spasi, atau tanda hubung sebelum normalisasi.
- `accounts.bank_template` menyimpan template visual kartu bank secara terpisah dari nama rekening. Nilai rekening bank dibatasi ke `generic`, `bca`, `bni`, `btn`, `mandiri`, atau `permata`; rekening non-bank wajib `generic`.
- `accounts.ewallet_template` menyimpan provider visual E-wallet secara terpisah dari nama rekening. Nilai rekening E-wallet dibatasi ke `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, atau `linkaja`; rekening non-E-wallet wajib `generic`.
- `accounts.is_system_hidden` default `0`. Nilai `1` hanya untuk rekening compatibility yang dibuat backend bagi flow Investasi asset-centric; rekening tersebut tidak dikembalikan oleh `accounts.list` dan tidak boleh menjadi pilihan user-facing. Data rekening existing otomatis tetap `0`.
- `investment_portfolios` tetap memiliki FK `rdn_account_id` untuk compatibility v15/v16. Flow v17 dapat memakai portfolio legacy yang operable atau membuat compatibility portfolio baru di atas rekening hidden Rp0; broker selalu metadata legacy, bukan hierarchy produk.
- Trade investasi menyimpan `lots`, `share_quantity`, `price_per_share`, `fee_amount`, `gross_amount`, dan `cash_amount` sebagai INTEGER. Service + integrity checker memastikan `share_quantity = lots × lot_size`, gross = lembar × harga, buy cash = gross + fee, dan sell cash = gross - fee.
- `investment_trades.cash_effect_enabled` dan `investment_corrections.cash_effect_enabled` default `1` agar histori pra-v17 mempertahankan dampak cash. Record Buy/Sell dan direct opening-position yang dibuat runtime v17 memakai `0`; nominal cash/cost tetap tersimpan untuk cost basis/P&L tetapi tidak memutasikan rekening.
- View `investment_account_events` hanya memproyeksikan row dengan `cash_effect_enabled=1`. Karena itu cash RDN legacy tetap dapat direplay tanpa membuat trade v17 baru memengaruhi saldo rekening.
- Event compatibility tidak boleh mendahului `accounts.initial_balance_date` portfolio. Trade tidak boleh future, perubahan holding mengikuti chronology/checkpoint yang sudah ada, dan direct asset position tidak boleh menulis ke periode yang sudah direkonsiliasi.
- Reconciliation legacy bersifat snapshot as-of tanggal yang diminta dan tidak mengubah holding/cash. Correction reguler append-only Administrator-only; hasil holding/cost basis negatif atau tidak konsisten ditolak.
- Harga read-model adalah event harga terakhir yang diketahui antara trade dan valuation manual. Karena itu holding baru memiliki valuation fallback dari harga trade tanpa membuat valuation row sintetis.
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

Versi aktif: `20`

### Schema v20 — pemanis visual Alokasi Dana

- `018_envelope_decoration.sql` menambah `envelope_rules.decoration_key` secara additive dengan default `auto`. Nilai valid: `auto`, `home`, `shopping`, `love`, `education`, `travel`, `gift`, `pet`, `food`, `car`, dan `plant`.
- Field ini presentation-only: tidak mengubah saldo, Dana Tersedia, ownership, status, rekonsiliasi, atau transaksi. Backup lama dinormalisasi ke `auto` saat restore.
- Cutover aktif adalah v19→v20 setelah backup schema v19 verified dan integrity lulus sebelum runtime v20 menerima traffic.

### Schema v19 — lifecycle Kebutuhan dan histori compact

- `017_budget_lifecycle_history.sql` menambah `transactions.budget_id` dan `recurring_rules.budget_id` sebagai relasi eksplisit ke Kebutuhan, metadata penghentian/released amount pada `budgets`, serta tabel `budget_history`. `budget_id` pada transaksi/jadwal sengaja tidak memakai FK ke row operasional karena `budgets` boleh dipadatkan setelah tutup buku.
- `budgets.remove` adalah lifecycle user-facing: Kebutuhan history-free dapat hard-delete oleh Administrator, sedangkan Kebutuhan yang sudah mempunyai transaksi/jadwal historis dihentikan dan tetap terbaca pada report. Dana Alokasi yang dilepas dihitung server dari dana removable aktual dan dibatasi sisa Kebutuhan; saldo fisik rekening tidak bertambah.
- Saat `periods.close`, seluruh Kebutuhan periode dipadatkan ke `budget_history` setelah snapshot final dibuat, reminder terjadwal dibatalkan, lalu row operasional periode tersebut dibersihkan. `periods.reopen` merehidrasi row operasional dan menghapus copy compact agar tidak ada dua authority aktif.
- Logical backup schema v19 memasukkan `budget_history`; restore backup < v19 memperlakukannya sebagai tabel additive optional. Runtime v19 tetap mempertahankan `sync_revisions` v18 sebagai metadata realtime non-authoritative.
- Cutover Production v18→v19 wajib memakai backup v18 verified, migration eksplisit, integrity check, lalu runtime v19 menerima traffic.

### Schema v18 — global realtime synchronization

- `016_global_sync_revisions.sql` menambah `sync_revisions(resource, revision, updated_at)` dan baseline `__global__`. Tabel ini hanya metadata koordinasi runtime; saldo, ledger, Alokasi, Kebutuhan, Investasi, dan read-model bisnis tetap authoritative di tabel domain canonical.
- Setiap mutation yang melalui action dispatcher menaikkan revision resource terdampak di transaction database yang sama. Jalur write di luar dispatcher yang memengaruhi UI (session dan scheduler/job) menaikkan revision secara eksplisit.
- `sync.state` mengembalikan revision global dan per-resource agar client menginvalidasi hanya read yang berubah. Runtime client mengecek saat foreground, reconnect, BroadcastChannel/push signal, polling ringan ketika visible, dan pull-to-refresh.
- `sync_revisions` tidak masuk logical backup/restore karena dapat diregenerasi dan tidak boleh menjadi financial authority. Pada runtime v18, logical backup schema v3-v18 diterima dan cutover v17→v18 wajib memakai backup v17 verified. Runtime aktif v19 mengikuti kontrak v19 di atas.
API menolak operasi ketika schema belum dimigrasikan atau version tidak cocok. Setiap perubahan schema berikutnya wajib memiliki migration baru, backup, rollback plan, dan parity test.

### Migration v17 dan rollback

- `015_investment_asset_centric.sql` bersifat additive: menambah `accounts.is_system_hidden`, `investment_trades.cash_effect_enabled`, dan `investment_corrections.cash_effect_enabled`, lalu membangun ulang view `investment_account_events` agar hanya event dengan cash effect aktif yang memengaruhi saldo. `schema_version` dinaikkan ke 17.
- Existing account/trade/correction mendapat default `is_system_hidden=0` / `cash_effect_enabled=1`, sehingga data dan saldo historis v16 tidak ditulis ulang. Runtime v17 menulis direct asset opening-position dan Buy/Sell baru dengan `cash_effect_enabled=0`; compatibility account baru ditandai `is_system_hidden=1`.
- Logical backup yang diperkenalkan pada schema v17 memuat kolom additive tersebut. Runtime aktif v19 menerima backup schema v3-v19, termasuk **v16/v17/v18**; row backup lama yang tidak membawa kolom baru memperoleh default migration saat restore.
- Untuk cutover historis v16→v17, backup teknis **verified pada schema v16** wajib tersedia. Cutover v17→v18 tetap terdokumentasi sebagai histori; untuk cutover aktif v18→v19 ikuti prosedur deployment v19 dan gunakan backup verified schema v18 sebelum migration.
- Rollback tidak dilakukan dengan DROP column/table. Gunakan forward-fix atau restore backup schema v16 pra-migration ke database terisolasi, jalankan integrity/parity verification, lalu repoint environment setelah approval.

### Migration v16 dan rollback (historis)

- `014_investment_opening_position.sql` bersifat additive: menambah `investment_trades.notes`, `investment_corrections.correction_type`, `reference_price`, `notes`, index type/date, lalu menaikkan `schema_version` ke 16. Existing trade/correction tidak ditulis ulang selain default additive.
- `correction_type` hanya `correction|opening_position`. Opening position tetap append-only, dapat memberi reference-price fallback, dan cash delta tetap masuk view `investment_account_events`; event ini bukan fake Buy dan tidak menjadi income/expense.
- Logical backup v16 wajib memuat enam tabel Investment authoritative beserta field additive v16. Runtime v16 menerima backup v3-v15 dengan normalisasi field default; backup lama tidak diberi opening-position sintetis.
- Sebelum migration Production, backup teknis **verified pada schema v15** wajib tersedia. Jalankan `npm run db:migrate -- production`, lalu `npm run db:integrity -- production` sebelum runtime v16 menerima traffic.
- Rollback cepat dengan DROP/DELETE tidak diizinkan. Gunakan forward-fix atau restore backup schema v15 pra-migration ke database terisolasi, jalankan integrity, lalu repoint environment setelah approval.

### Migration v15 dan rollback

- `013_investment_tracking.sql` bersifat additive: menambah enam tabel Investment + view `investment_account_events`, index terkait, lalu menaikkan `schema_version` ke 15. Existing transaksi, kategori, Alokasi Dana, Target, session, dan audit tidak ditulis ulang.
- RDN memakai rekening canonical `account_type=investment`; tidak ada saldo investasi kedua yang dapat diedit bebas. Buy/sell/correction ber-cash-effect masuk formula saldo rekening melalui view event, sedangkan Bank ↔ RDN tetap transaksi transfer netral income/expense.
- Cost basis dihitung backend dari event history dengan weighted-average integer. Valuation hanya snapshot harga; realized P/L hanya terbentuk pada sell, unrealized P/L hanya read-model dan tidak masuk cashflow.
- Instrumen inactive menolak buy baru tetapi existing holding tetap dapat dijual. Tanggal aktivitas investasi tidak boleh sebelum tanggal saldo awal RDN; reconciliation membandingkan state as-of tanggalnya dan tidak auto-adjust.
- Logical backup v15 wajib memuat `investment_instruments`, `investment_portfolios`, `investment_trades`, `investment_valuations`, `investment_reconciliations`, dan `investment_corrections`. Runtime v16 menerima backup v3-v15 secara additive; keenam tabel dianggap optional hanya pada backup < v15.
- Sebelum migration Production, backup teknis **verified pada schema v14** wajib tersedia. Jalankan `npm run db:migrate -- production`, lalu `npm run db:integrity -- production` sebelum runtime v16 menerima traffic.
- Rollback cepat dengan DROP/DELETE tidak diizinkan. Gunakan forward-fix atau restore backup pra-migration ke database terisolasi, jalankan integrity, lalu repoint environment setelah approval.

### Migration v14 dan rollback

- `012_member_collaboration.sql` bersifat additive: menambah `users.photo_url`, `master_data_requests`, `transfer_requests`, index pending/status, lalu menaikkan `schema_version` ke 14. Migration tidak mengubah nominal, transaksi, saldo, account balance formula, atau audit append-only.
- Member dapat mengajukan rekening/kategori baru tanpa mendapat capability create master langsung. Approval Administrator menjalankan create canonical di transaction yang sama; reject hanya mengubah lifecycle request.
- Transfer shared → personal memakai `transfer_requests`; approval Administrator revalidates requester/rekening dan membuat satu transaksi canonical atomik. Transfer personal lintas pemilik direpresentasikan sebagai satu transaksi dengan `scope`/`owner_user_id` mengikuti rekening sumber/debit.
- Logical backup v14 mencakup kedua tabel request dan `photo_url`; runtime v16 tetap menerima backup v3-v15 secara additive. Production migration tetap memerlukan backup verified schema v13, lalu `npm run db:migrate -- production` dan `npm run db:integrity -- production`.
- Rollback cepat dengan DROP/DELETE tidak diizinkan. Gunakan forward-fix atau restore backup pra-migration ke database terisolasi, integrity check, lalu repoint setelah approval.

### Migration v13 dan rollback

- `011_distributed_rate_limits.sql` bersifat additive: menambah `rate_limit_buckets` STRICT + expiry index lalu menaikkan `schema_version` ke 13. Ledger, saldo, transaksi, session registry, dan binding environment tidak diubah.
- Gateway, export, login Firebase, serta Google OAuth valid memakai process-local limiter sebagai lapisan murah dan bucket Turso sebagai counter lintas instance. Invalid OAuth callback tetap ditolak dari signed state sebelum external token exchange.
- `rate_limit_buckets` adalah state ephemeral security, tidak masuk `BACKUP_TABLES`, dibersihkan ketika expired, dan dihapus pada controlled restore. Runtime v17 tetap menerima logical backup v3-v16.
- Migration Production tetap memerlukan backup terverifikasi, `npm run db:migrate -- production`, `npm run db:integrity -- production`, dan parity evidence. Pemisahan live Development/Production tetap mengikuti ADR-0007 dan **belum dianggap selesai hanya karena schema v16**.
- Rollback schema tidak dilakukan dengan `DROP TABLE`; prioritaskan forward-fix. Jika rollback data diperlukan, restore backup pra-migration ke database terisolasi lalu repoint setelah integrity verification dan approval.

### Migration v12 dan rollback

- `010_environment_sessions.sql` bersifat additive: menambah `user_sessions`, `database_environment`, dan scheduler heartbeat di `system_config`, lalu menaikkan `schema_version` ke 12. Ledger, transaksi, saldo, kategori, rekening, dan cost-sharing tidak diubah.
- `database_environment` dimulai `unbound` dan harus di-bind eksplisit dengan `npm run db:bind-environment -- development|production`. Runtime fail-closed bila `VERCEL_ENV`, `DATABASE_ENVIRONMENT`, dan binding database tidak konsisten; Preview tidak boleh memakai database aktif.
- Session v2 memakai `session_id` + secret acak pada cookie signed/HttpOnly dan hanya SHA-256 verifier hash di `user_sessions`. Legacy cookie v1 tidak diterima sehingga cutover memerlukan login ulang.
- Backup logical v12 tidak membawa `user_sessions`, `database_environment`, maintenance flag, atau scheduler heartbeat. Runtime v17 tetap menerima backup v12; restore sukses menghapus session registry agar credential lama tidak hidup kembali.
- Sebelum migration Production wajib ada backup teknis terverifikasi. Setelah migration jalankan binding environment dan integrity check. Rollback ke runtime yang menerima legacy cookie dilarang; gunakan forward-fix atau restore pra-migration ke database terpisah lalu repoint setelah approval.

### Migration v11 dan rollback

- `009_transaction_cost_sharing.sql` bersifat additive. Migration menambah `transactions.cost_share_mode` dengan default `unspecified`, menambah `transactions.cost_share_json` dengan default `[]`, lalu menaikkan `schema_version` ke 11. Tidak ada backfill 50:50 dan tidak ada perubahan nilai saldo/ledger historis.
- Runtime v17 tetap menerima backup schema v3-v16 melalui normalisasi additive. Backup v10 dan lebih lama mendapat `cost_share_mode=unspecified` dan `cost_share_json=[]` saat restore; backup v11 menyimpan snapshot split canonical. Field v12/v13 yang bersifat runtime/security tidak diambil dari backup lama.
- Sebelum migration production wajib ada backup teknis terverifikasi. Setelah migration jalankan integrity check. Bila perilaku cost-sharing dari migration v11 bermasalah pada runtime v19, prioritaskan forward-fix; rollback data dilakukan melalui restore backup pra-migration ke database terpisah, integrity check, lalu repoint environment setelah approval. Jangan `DROP COLUMN`, `DROP TABLE`, atau mengedit data produksi langsung sebagai rollback cepat.

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

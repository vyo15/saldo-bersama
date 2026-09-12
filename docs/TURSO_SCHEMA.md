# Turso Schema

> **Status:** Canonical  
> **Purpose:** Ringkasan current tables, relationships, constraints, dan schema version.  
> **Update when:** Migration/schema/runtime version berubah.  
> **Boundary:** Detail kronologi migration berada di `database/migrations/` dan `CHANGELOG.md`; file ini menjelaskan bentuk current.

Schema canonical merupakan hasil seluruh migration berurutan di `database/migrations/`; latest migration current adalah `018_envelope_decoration.sql`. Migration yang sudah diterapkan dicatat pada `schema_migrations`. Prefix file adalah ID urutan migration, sedangkan target schema dibaca dari `system_config.schema_version` di SQL. Production update dijalankan eksplisit melalui `npm run prod:update`, bukan otomatis pada request.

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
- `investment_portfolios` — compatibility container untuk histori investasi; UI current tidak menampilkan broker/portfolio sebagai hierarchy utama.
- `investment_instruments` — registry ticker/exchange/lot size global yang dikelola Administrator.
- `investment_trades` — histori buy/sell append-only; `cash_effect_enabled` membedakan record accounting-only current dari histori cash legacy.
- `investment_valuations` — snapshot harga manual append-only.
- `investment_reconciliations` — snapshot perbandingan broker vs recorded state; tidak auto-adjust.
- `investment_corrections` — event correction/opening-position append-only; `cash_effect_enabled` membedakan histori cash legacy dari posisi aset accounting-only.

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
- `investment_portfolios` tetap memiliki FK `rdn_account_id` untuk compatibility histori. Flow current dapat memakai portfolio legacy yang operable atau membuat compatibility portfolio baru di atas rekening hidden Rp0; broker selalu metadata legacy, bukan hierarchy produk.
- Trade investasi menyimpan `lots`, `share_quantity`, `price_per_share`, `fee_amount`, `gross_amount`, dan `cash_amount` sebagai INTEGER. Service + integrity checker memastikan `share_quantity = lots × lot_size`, gross = lembar × harga, buy cash = gross + fee, dan sell cash = gross - fee.
- `investment_trades.cash_effect_enabled` dan `investment_corrections.cash_effect_enabled` mempertahankan `1` pada histori yang memang berdampak cash. Record Buy/Sell dan direct opening-position current memakai `0`; nominal cash/cost tetap tersimpan untuk cost basis/P&L tetapi tidak memutasikan rekening.
- View `investment_account_events` hanya memproyeksikan row dengan `cash_effect_enabled=1`. Karena itu cash RDN legacy tetap dapat direplay tanpa membuat trade current memengaruhi saldo rekening.
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

Latest migration: `018_envelope_decoration.sql`. Runtime version ditentukan oleh `api/_lib/db/schema.js` (`DATABASE_SCHEMA_VERSION`) dan migration yang tercatat pada `schema_migrations`. Production update dijalankan eksplisit sesuai `DATABASE_MIGRATION_POLICY.md` melalui `npm run prod:update`; workflow membuat backup verified fresh dari schema aktif, menjalankan seluruh migration pending secara atomik sampai schema target, menjalankan integrity, lalu mempromosikan candidate runtime yang sama.

Current additive capabilities yang perlu diketahui reader schema:

- `envelope_rules.decoration_key` adalah metadata presentation-only dengan default `auto`; tidak mengubah saldo/ownership/ledger.
- `budget_history` menyimpan representasi compact Kebutuhan setelah period close dan memungkinkan report/reopen tanpa mempertahankan row operasional aktif.
- `transactions.budget_id` dan `recurring_rules.budget_id` menautkan event/jadwal ke Kebutuhan tanpa mengharuskan row operasional tetap hidup selamanya.
- `sync_revisions` adalah metadata invalidation realtime, bukan financial authority dan tidak masuk logical backup.
- Investment compatibility fields (`is_system_hidden`, `cash_effect_enabled`) mempertahankan histori lama sambil menjaga flow asset-centric current.
- Environment/session/rate-limit/collaboration tables tetap bagian current schema meskipun diperkenalkan oleh migration lebih lama.

Urutan/history migration lengkap ada di `database/migrations/`; arti field/lifecycle ada di `DATA_DICTIONARY.md`; rollback/forward-fix mengikuti `DATABASE_MIGRATION_POLICY.md`.

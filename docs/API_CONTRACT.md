# API Contract

## Endpoint canonical

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/session` | GET/POST | Membaca sesi, login Firebase ID token, logout. |
| `/api/gateway` | POST | Seluruh action bisnis. |
| `/api/export` | POST | XLSX owner-only. |
| `/api/health` | GET | Health teredaksi. |
| `/api/jobs` | POST | Worker terjadwal dengan signature. |

Frontend tidak boleh mengakses Turso atau Google bridge secara langsung.

## Gateway envelope

Request:

```json
{
  "action": "transactions.create",
  "payload": {},
  "idempotencyKey": "required-for-write-when-listed",
  "rowVersion": 1
}
```

Header:

```text
Content-Type: application/json
X-Request-ID: random client correlation ID
Cookie: signed HttpOnly session
Origin: allowlisted origin
```

Success:

```json
{ "ok": true, "data": {} }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Pesan aman",
    "status": 409,
    "details": { "requestId": "..." }
  }
}
```

Server tidak menerima actor, role, UID, audit field, scope internal, timestamps, status, atau ownership dari client sebagai kebenaran.

## Action catalog

Permission canonical tetap `api/_lib/security.js`. Handler registry berada di `api/_lib/actions/registry.js`, operational policy di `api/_lib/actions/policy.js`, dan `api/_lib/actionDispatcher.js` hanya melakukan dispatch terjaga.

| Action | Owner | Member | Mode | Idempotency | Source utama |
|---|---:|---:|---|---|---|
| `system.health` | Ya | Ya | Read | Tidak | `api/_lib/actionDispatcher.js` |
| `app.initialState` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `bootstrap.get` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `users.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/users.js` |
| `users.upsert` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `users.deactivate` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `users.reactivate` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `archive.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/masterData.js` |
| `audit.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/audit.js` |
| `dashboard.overview` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `accounts.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData.js` |
| `accounts.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.previewLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/masterData.js` |
| `accounts.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |

| `categories.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData.js` |
| `categories.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.previewArchive` | Ya | Tidak | Read | Tidak | `api/_lib/services/masterData.js` |
| `categories.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `transactions.list` | Ya | Ya | Read | Tidak | `api/_lib/services/finance.js` |
| `transactions.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.update` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.cancel` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `envelopes.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `envelopes.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.move` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.close` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.previewRuleLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/planning/` |
| `envelopes.archiveRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.deleteUnusedRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.restoreRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.reverseMovement` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `recurring.createRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.updateRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.previewRuleLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/planning/` |
| `recurring.archiveRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.deleteUnusedRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.cancelOccurrence` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.restoreOccurrence` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.payOccurrence` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.reversePayment` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.restoreRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `budgets.upsert` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.previewLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/planning/` |
| `budgets.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `goals.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.previewLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/planning/` |
| `goals.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.move` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.reverseMovement` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `reports.monthly` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `reconciliations.list` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `reconciliations.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/reporting/` |
| `periods.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/reporting/` |
| `periods.previewClose` | Ya | Tidak | Read | Tidak | `api/_lib/services/reporting/` |
| `periods.close` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/reporting/` |
| `periods.reopen` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/reporting/` |
| `calendar.sync` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/integrations.js` / dispatcher |
| `mirror.sync` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/integrations.js` / dispatcher |
| `mirror.rebuild` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/integrations.js` / dispatcher |
| `integrations.status` | Ya | Ya | Read | Tidak | `api/_lib/services/integrations.js` / dispatcher |
| `notifications.status` | Ya | Ya | Read | Tidak | `api/_lib/services/notifications.js` |
| `notifications.preferences` | Ya | Ya | Read | Tidak | `api/_lib/services/notifications.js` |
| `notifications.updatePreference` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.register` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.unregister` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.test` | Ya | Ya | External/operation | Wajib | `api/_lib/services/notifications.js` |
| `backup.create` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `import.preview` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance/` |
| `import.apply` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `restore.preview` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `restore.apply` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `integrity.run` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance/` |


### Kontrak idempotency dan outcome mutation

- Setiap `Write/operation` dan `External/operation` yang mensyaratkan idempotency diperlakukan sebagai **satu intent logis**. Double-click dan retry untuk payload + `rowVersion` yang sama wajib memakai idempotency key yang sama sampai server memberi hasil definitif.
- Client membedakan kegagalan definitif dari `OUTCOME_UNKNOWN`. Jika koneksi putus setelah write mungkin sudah mencapai server, intent dipertahankan **hanya di private-memory selama halaman/sesi aktif** dan retry payload yang sama menggunakan key yang sama; UI tidak boleh memulai operasi baru secara diam-diam atau menaruh state finansial pada browser storage.
- External action mereservasi idempotency key **sebelum** side effect. Request same-key yang masih berjalan ditolak sebagai `IDEMPOTENCY_IN_PROGRESS`.
- `notifications.test` tidak boleh diulang otomatis setelah outcome 5xx/unknown karena delivery eksternal mungkin sudah terjadi. `backup.create`, `import.apply`, `restore.preview`, dan `restore.apply` boleh melanjutkan same-key unknown intent hanya karena service masing-masing memiliki durable recovery/idempotent claim.
- Refresh read-model setelah mutation dipisahkan dari konfirmasi write: kegagalan refresh tidak boleh dilaporkan sebagai kegagalan penyimpanan yang sudah dikonfirmasi server.

### Recovery human error planning

- Master/config owner-only memakai server lifecycle preview. `accounts`, `categories`, envelope rule, recurring rule, goal, dan budget hanya boleh hard-delete melalui action `deleteUnused` masing-masing ketika backend membuktikan seluruh histori/dependensi domain = 0. Begitu pernah dipakai, jalurnya hanya archive/restore.
- `envelopes.archiveRule` dan `envelopes.restoreRule` owner-only, memakai alasan + `row_version`, dan tidak menghapus movement/audit. `envelopes.deleteUnusedRule` hanya boleh menghapus rule baru bersama satu initial empty period yang belum pernah menjadi histori.
- `goals.archive`/`goals.restore`, `recurring.archiveRule`/`recurring.restoreRule`, dan `budgets.archive`/`budgets.restore` owner-only; lifecycle eksplisit membutuhkan `row_version` dan alasan. `goals.deleteUnused`, `recurring.deleteUnusedRule`, dan `budgets.deleteUnused` hanya untuk entity history-free sesuai preview backend.
- `recurring.archiveRule` boleh membersihkan future generated projections berstatus `expected` yang reproducible dan belum materialized. Paid/partial/past/cancelled/transaction-linked occurrence adalah histori dan tidak boleh hard-delete.
- `goals.list` mengembalikan `last_movement_row_version` bersama `last_movement_id`; `goals.reverseMovement` wajib membawa versi movement yang dilihat client melalui `rowVersion` atau `payload.row_version` sebelum linked transaction dibatalkan.
- `recurring.cancelOccurrence` melewati tepat satu occurrence tanpa membuat/membatalkan transaksi dan tanpa mengubah saldo. Hanya occurrence tanpa pembayaran aktif/aktual yang boleh dilewati. `recurring.restoreOccurrence` memulihkan occurrence tersebut menjadi `expected` atau `overdue` berdasarkan tanggal saat pemulihan. Keduanya owner-only, beralasan, memakai `row_version`, idempotency, audit, dan tidak menghapus histori.
- `envelopes.reverseMovement` dapat dipakai owner atau member untuk movement yang dibuatnya sendiri, hanya selama kedua kantong masih aktif dan nominal hasil realokasi belum terpakai/reserved. Reversal mengubah status movement menjadi `reversed`; tidak hard delete.

### Kontrak Web Push

- `notifications.status` membandingkan subscription browser dengan registrasi backend milik actor. Status aktif tidak boleh ditentukan hanya dari browser.
- `notifications.preferences` mengembalikan tujuh tipe alert canonical untuk actor. Belum adanya row berarti `enabled=true`. `notifications.updatePreference` hanya dapat mengubah preference milik actor sendiri, wajib `row_version` setelah row pertama tercipta, dan hanya memengaruhi alert terjadwal yang belum diantrikan; notification yang sudah masuk queue dapat tetap terkirim satu kali.
- `notifications.register` menerima endpoint HTTPS publik serta key `p256dh` dan `auth` yang valid. Endpoint milik akun lain, baik aktif maupun nonaktif, hanya dapat dipindahkan ketika client membuktikan subscription browser yang sama melalui kedua key yang persis cocok. Mismatch menghasilkan `PUSH_ENDPOINT_OWNERSHIP_CONFLICT`.
- Endpoint dengan port nonstandar, IP literal, hostname lokal/internal, dan alamat DNS yang mengarah ke jaringan nonpublik ditolak. Lookup terjaga dipakai sebagai agent request agar koneksi tidak melakukan resolusi DNS kedua yang tidak tervalidasi. Jika hostname berubah dan mengarah ke alamat privat saat pengiriman, subscription dinonaktifkan serta seluruh delivery tertundanya diakhiri agar tidak terus di-retry.
- `notifications.test` hanya mengirim ke endpoint aktif milik actor, wajib idempotency key, memakai cooldown, timeout, target `/pengaturan/notifikasi`, dan payload generik tanpa detail finansial. Frontend menjalankannya otomatis setelah registrasi; penerimaan oleh push service tidak membuktikan sistem operasi menampilkan notifikasi.
- `notifications.unregister` menonaktifkan subscription dan menandai delivery tertunda pada perangkat tersebut sebagai `expired`.
- Scheduled delivery memakai satu `notification_deliveries` per subscription. Retry hanya mengulang perangkat gagal dan tidak mengirim ulang ke perangkat yang sudah sukses.


### Kontrak kategori dan transfer

- `transaction_type` kategori hanya `expense`, `income`, atau `refund`. Transfer tidak memakai kategori; pemindahan antar rekening dicatat melalui transaksi `transfer` agar tidak masuk total pemasukan/pengeluaran.
- `nature` hanya bermakna untuk `expense`. Create `income`/`refund` tanpa nature dinormalisasi ke `other`; nature pengeluaran eksplisit pada kedua jenis tersebut ditolak.
- Kategori expense baru dengan nature legacy `savings` ditolak dengan `SAVINGS_CATEGORY_NOT_ALLOWED`. Data legacy tetap dapat dibaca dan mempertahankan nilai lama sampai owner memilih klasifikasi pengeluaran baru.
- Memindahkan dana ke rekening tabungan sendiri harus menggunakan Transfer atau Target. Pengeluaran baru dicatat ketika pembayaran aktual kepada pihak luar terjadi.

### Kontrak rekening dan provider visual

- `accounts.create` untuk `account_type=bank` menerima `account_number` wajib. Input boleh memakai angka, spasi, atau tanda hubung; server menyimpan 6–34 digit hasil normalisasi.
- `accounts.update` menerima `account_number` bersama `row_version`; conflict tetap ditolak dan tidak boleh ditimpa diam-diam.
- `accounts.update` tidak boleh mengubah `account_type`; jenis rekening bersifat immutable setelah create dan backend menolak percobaan perubahan dengan `ACCOUNT_TYPE_IMMUTABLE`. Form edit hanya mengubah field yang memang diizinkan.
- `accounts.create` dan `accounts.update` menerima `bank_template` terpisah dari `name`. Backend hanya menerima `generic`, `bca`, `bni`, `btn`, `mandiri`, atau `permata` untuk rekening bank; rekening non-bank selalu dinormalisasi ke `generic`. Mengubah template tidak boleh mengubah nama rekening.
- `accounts.list` mengembalikan `bank_template` canonical. Client boleh memakai deteksi suffix nama hanya sebagai fallback visual untuk object legacy yang belum melalui normalisasi, bukan sebagai storage baru.
- `accounts.create` dan `accounts.update` menerima `ewallet_template` terpisah dari `name`. Backend hanya menerima `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, atau `linkaja` untuk `account_type=ewallet`; rekening non-E-wallet selalu dinormalisasi ke `generic`.
- `accounts.list` mengembalikan `ewallet_template` canonical. Deteksi provider dari nama hanya boleh dipakai sebagai fallback legacy ketika field belum ada; nilai `generic` yang sudah tersimpan bersifat authoritative dan tidak boleh ditimpa inferensi nama.
- `accounts.list` mengembalikan seluruh rekening shared dan personal kepada dua pengguna aktif yang terotorisasi. Rekening personal membawa `owner_name`, `is_owned_by_actor`, `can_transact`, `can_reconcile`, `can_manage`, dan `read_only` yang dihitung backend.
- Nomor rekening lengkap hanya dikirim setelah authentication dan binding user berhasil. Transparansi baca kepada pasangan tidak memperluas write: member tetap tidak dapat bertransaksi atau merekonsiliasi rekening personal pasangan.
- `transactions.list`, dashboard, laporan, serta `reconciliations.list` memakai ledger readable yang sama agar saldo dapat ditelusuri. Capability edit/cancel transaksi tetap memperhitungkan creator dan scope operable. Label rekening pada filter, breakdown, alert, dan rekonsiliasi menyertakan kepemilikan agar rekening personal pasangan tidak ambigu.
- `dashboard.overview.totalBalance` membaca seluruh rekening transparan. Metrik actionable `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` hanya menghitung rekening/scope yang `can_transact` bagi actor, supaya saldo personal pasangan tidak salah dianggap dapat digunakan atau dialokasikan member.
- Audit create/update hanya mencatat bentuk bertopeng empat digit terakhir. Nomor rekening tidak ditambahkan ke Sheets mirror atau export baca. Backup teknis tetap memuat kolom tersebut untuk recovery terjaga.
- Field ini adalah nomor rekening transfer, bukan nomor kartu debit. PIN, CVV, masa berlaku, serta nomor kartu debit tidak diterima.
- Lifecycle preview (`accounts.previewLifecycle`, `categories.previewArchive`, `envelopes.previewRuleLifecycle`, `recurring.previewRuleLifecycle`, `goals.previewLifecycle`, `budgets.previewLifecycle`) menghitung kondisi terbaru dan dependency semua status sebelum owner memilih hard delete unused atau archive.
- `accounts.deleteUnused` bukan purge umum. Action ini hanya berhasil bila rekening aktif mempunyai saldo awal Rp0, saldo saat ini Rp0, tidak pernah memiliki transaksi dalam status apa pun, tidak memiliki rekonsiliasi, dan tidak pernah direferensikan kantong, tagihan, atau target. Alasan, acknowledgement, frasa konfirmasi, `row_version`, idempotency, dan audit wajib.
- Rekening yang pernah digunakan hanya boleh memakai `accounts.archive`; `accounts.archive` sekarang juga membutuhkan alasan. Prinsip yang sama berlaku pada master/config lain: history memblokir hard delete tetapi tetap dipertahankan saat archive selama future-active dependency domain tidak membuat archive tidak valid.

## Read payload dan response penting

### `transactions.list`

Payload opsional:

```json
{
  "period": "YYYY-MM",
  "query": "teks pencarian",
  "transaction_type": "all|income|expense|transfer|refund|adjustment",
  "allocation": "all|allocated|unallocated",
  "account_id": "all atau account_id",
  "category_id": "all atau category_id",
  "created_by": "all|me|user_id",
  "limit": 100,
  "offset": 0
}
```

Response memakai ledger readable backend dan memuat `items`, pagination, `periodLocked`, serta `filterOptions.accounts`, `filterOptions.categories`, dan `filterOptions.creators`. Filter rekening membawa label pemilik; capability edit/cancel tetap mengikuti creator dan scope operable.

### `reports.monthly`

Payload:

```json
{
  "period": "YYYY-MM",
  "trend_months": 3
}
```

`trend_months` hanya menerima 3, 6, atau 12 dan default-nya 6. Response menambah:

- `trend.items`: income, expense, refund, net, dan totalBalance per bulan;
- `accountExpenses`: expense menurut rekening sumber;
- `creatorExpenses`: expense menurut actor pencatat, **bukan** kontribusi/penanggung biaya;
- `natureExpenses`: expense menurut `categories.nature`;
- `overview.alerts`: peringatan actionable dari budget, kantong, recurring, target, transaksi belum dialokasikan, dan rekonsiliasi.

Field tambahan tersebut backward-compatible; transfer internal tetap tidak masuk income/expense/net.

## Version/conflict

`rowVersion` atau `payload.row_version` wajib untuk update/cancel/reverse yang memodifikasi record versionable. Mismatch menghasilkan HTTP 409; client wajib reload dan tidak boleh overwrite diam-diam.

## Compatibility

Perubahan action name, request/response shape, error code, permission, idempotency, ownership, atau side effect memerlukan RFC, contract/test update, dan release note. Payload detail paling akurat berada pada validator di service source sampai JSON Schema per action tersedia.

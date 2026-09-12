# API Contract

> **Status:** Canonical  
> **Purpose:** Action/API contract current.

## Endpoint canonical

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/session` | GET/POST | Membaca sesi terdaftar, login Firebase ID token terhadap registry `users` canonical, dan logout/revoke session current. |
| `/api/auth/google/start` | GET | Alias rewrite ke session handler untuk memulai Google OAuth production desktop/mobile; membuat signed state/nonce + PKCE S256 dan 302 ke Google. |
| `/api/auth/google/callback` | GET | Alias rewrite ke session handler untuk callback Google OAuth; validasi state/nonce, memakai PKCE `code_verifier` untuk Google→Firebase token exchange, resolve registry `users`/role, membuat registered session, lalu 303 ke route internal yang ditandatangani. |
| `/api/gateway` | POST | Seluruh action bisnis. |
| `/api/export` | POST | XLSX Administrator-only. |
| `/api/health` | GET | Health teredaksi. |
| `/api/jobs` | POST | Worker terjadwal dengan signature. |

Frontend tidak boleh mengakses Turso atau Google bridge secara langsung. Dua route `/api/auth/google/*` bukan Vercel Function tambahan; keduanya rewrite internal ke `api/session.js` agar jumlah endpoint function canonical tetap lima.

`/api/session` mengembalikan identitas terverifikasi minimum `uid`, `email`, `name`, `role`, dan `photoURL` bila Firebase menyediakan foto Google pada host yang diizinkan CSP. `photoURL` hanya metadata presentasi untuk akun yang sedang login; authorization tetap ditentukan credential session opaque bertanda tangan, registry `user_sessions`, status/role/binding Firebase UID pada tabel `users`, dan guard backend. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama pada database kosong, bukan registry anggota runtime.

`/api/health` adalah endpoint HTTP `GET` publik dengan contract minimum `{ status, timestamp, requestId }`; `status` publik hanya `ok` atau `degraded`. Detail database/schema/maintenance/build hanya tersedia melalui action terautentikasi `system.health` di `/api/gateway`; keduanya memiliki handler dan response contract yang berbeda.

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

Daftar exact field transaksi yang server-owned/reserved bersifat canonical di `api/_lib/transactionContract.js`. Gateway dan finance service wajib memakai contract yang sama; daftar tersebut tidak boleh didefinisikan ulang secara independen.

## Action catalog

Permission canonical tetap `api/_lib/security.js`. Handler registry berada di `api/_lib/actions/registry.js`, operational policy di `api/_lib/actions/policy.js`, dan `api/_lib/actionDispatcher.js` hanya melakukan dispatch terjaga.

| Action | Administrator | Member | Mode | Idempotency | Source utama |
|---|---:|---:|---|---|---|
| `system.health` | Ya | Ya | Read | Tidak | `api/_lib/actions/registry.js` |
| `sync.state` | Ya | Ya | Read | Tidak | `api/_lib/syncRevisions.js` |
| `app.initialState` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `bootstrap.get` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `users.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/users.js` |
| `users.upsert` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `users.deactivate` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `users.reactivate` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `sessions.listOwn` | Ya | Ya | Read | Tidak | `api/_lib/services/sessions.js` |
| `sessions.revokeOwn` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/sessions.js` |
| `sessions.revokeAllOwn` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/sessions.js` |
| `archive.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/masterData.js` |
| `audit.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/audit.js` |
| `dashboard.overview` | Ya | Ya | Read | Tidak | `api/_lib/services/reporting/` |
| `investments.overview` | Ya | Ya | Read | Tidak | `api/_lib/services/investments.js` |
| `investments.instruments.list` | Ya | Ya | Read | Tidak | `api/_lib/services/investments.js` |
| `investments.assets.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.portfolios.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.instruments.upsert` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.openingPositions.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.trades.buy` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.trades.sell` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.valuations.update` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.reconciliations.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `investments.corrections.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/investments.js` |
| `accounts.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData.js` |
| `accounts.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.requestCreate` | Tidak | Ya | Write/operation | Wajib | `api/_lib/services/masterData/requests.js` |
| `accounts.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.previewLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/masterData.js` |
| `accounts.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData.js` |
| `categories.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.requestCreate` | Tidak | Ya | Write/operation | Wajib | `api/_lib/services/masterData/requests.js` |
| `categories.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.previewArchive` | Ya | Tidak | Read | Tidak | `api/_lib/services/masterData.js` |
| `categories.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `masterDataRequests.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData/requests.js` |
| `masterDataRequests.review` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData/requests.js` |
| `transferRequests.list` | Ya | Ya | Read | Tidak | `api/_lib/services/transferRequests.js` |
| `transferRequests.request` | Tidak | Ya | Write/operation | Wajib | `api/_lib/services/transferRequests.js` |
| `transferRequests.review` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/transferRequests.js` |
| `transactions.list` | Ya | Ya | Read | Tidak | `api/_lib/services/finance.js` |
| `transactions.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.update` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.cancel` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `envelopes.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `envelopes.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.adjustAllocation` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.move` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.close` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.previewRuleLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/planning/` |
| `envelopes.archiveRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.deleteUnusedRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.restoreRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `envelopes.reverseMovement` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `recurring.createRule` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.updateRule` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.previewRuleLifecycle` | Ya | Tidak | Read | Tidak | `api/_lib/services/planning/` |
| `recurring.archiveRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.deleteUnusedRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.cancelOccurrence` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.restoreOccurrence` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.payOccurrence` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.reversePayment` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `recurring.restoreRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `budgets.upsert` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.batchCreate` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.previewLifecycle` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `budgets.remove` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.deleteUnused` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `budgets.restore` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning/` |
| `goals.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
| `goals.update` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning/` |
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
| `calendar.sync` | Ya | Tidak | Write/operation | Wajib | `api/_lib/actions/registry.js` + `api/_lib/services/integrations.js` |
| `mirror.sync` | Ya | Tidak | Write/operation | Wajib | `api/_lib/actions/registry.js` + `api/_lib/services/integrations.js` |
| `mirror.rebuild` | Ya | Tidak | Write/operation | Wajib | `api/_lib/actions/registry.js` + `api/_lib/services/integrations.js` |
| `integrations.status` | Ya | Ya | Read | Tidak | `api/_lib/services/integrations.js` |
| `notifications.center` | Ya | Ya | Read | Tidak | `api/_lib/services/notifications.js` |
| `notifications.status` | Ya | Ya | Read | Tidak | `api/_lib/services/notifications.js` |
| `notifications.preferences` | Ya | Ya | Read | Tidak | `api/_lib/services/notifications.js` |
| `notifications.updatePreference` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.register` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.unregister` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.test` | Ya | Ya | External/operation | Wajib | `api/_lib/services/notifications.js` |
| `reminders.get` | Ya | Ya | Read | Tidak | `api/_lib/services/reminders.js` |
| `reminders.upsert` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/reminders.js` |
| `reminders.cancel` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/reminders.js` |
| `backup.create` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `import.preview` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance/` |
| `import.apply` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `restore.preview` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `restore.apply` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/` |
| `reset.preview` | Ya | Tidak | Read | Tidak | `api/_lib/services/maintenance/reset.js` (database Development terikat saja) |
| `reset.status` | Ya | Tidak | Read | Tidak | `api/_lib/services/maintenance/reset.js` |
| `reset.apply` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/reset.js` (database Development terikat saja) |
| `fullReset.preview` | Ya | Tidak | Read | Tidak | `api/_lib/services/maintenance/fullReset.js` |
| `fullReset.status` | Ya | Tidak | Read | Tidak | `api/_lib/services/maintenance/fullReset.js` |
| `fullReset.apply` | Ya | Tidak | External/operation | Wajib | `api/_lib/services/maintenance/fullReset.js` |
| `integrity.run` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance/` |


### Kontrak idempotency dan outcome mutation

- Setiap `Write/operation` dan `External/operation` yang mensyaratkan idempotency diperlakukan sebagai **satu intent logis**. Double-click dan retry untuk payload + `rowVersion` yang sama wajib memakai idempotency key yang sama sampai server memberi hasil definitif.
- Client membedakan kegagalan definitif dari `OUTCOME_UNKNOWN`. Mutation biasa menyimpan **hanya metadata intent aman** (`action`, fingerprint hash, idempotency key, timestamp) pada storage browser yang di-namespace per session/user agar reload tetap memakai key yang sama; payload finansial, nominal, deskripsi, rekening, auth token, actor, atau hasil audit tidak dipersist. Payload/fingerprint berbeda diblok dengan `MUTATION_INTENT_LOCKED` sampai intent lama mendapat hasil definitif, lalu metadata dibersihkan. Metadata client bukan sumber kebenaran dan tidak menggantikan idempotency server. Khusus `reset.apply`, UI tetap memakai recovery/status workflow opaque yang terpisah.
- External action mereservasi idempotency key **sebelum** side effect. Request same-key yang masih berada dalam processing lease 15 menit ditolak sebagai `IDEMPOTENCY_IN_PROGRESS`; reservation `processing` yang melewati lease diperlakukan sebagai outcome ambigu, bukan sebagai izin membuat intent baru.
- Stale `processing` pada action yang tidak recovery-safe dipersist menjadi `IDEMPOTENCY_OUTCOME_UNKNOWN`. Hanya action yang policy-nya `retryUnknownSafe` dan mempunyai durable recovery/idempotent claim yang boleh melanjutkan **same key + same fingerprint**; payload/fingerprint berbeda tetap ditolak.
- `notifications.test` dan `reset.apply` tidak boleh diulang otomatis setelah outcome 5xx/unknown karena side effect eksternal/destructive mungkin sudah terjadi. `reset.status` adalah read maintenance-safe yang merekonsiliasi idempotency server, audit append-only, deterministic safety-backup ID, dan maintenance mode. Reset lama yang sudah `committed` tidak boleh dikirim ulang. Intent destructive yang benar-benar baru hanya boleh dibuat dari preview terbaru setelah status menyatakan `canStartNewIntent=true`; client wajib membuang metadata recovery intent lama sebelum memakai idempotency key baru. `backup.create`, `import.apply`, `restore.preview`, dan `restore.apply` boleh melanjutkan same-key unknown intent hanya karena service masing-masing memiliki durable recovery/idempotent claim.
- Refresh read-model setelah mutation dipisahkan dari konfirmasi write: kegagalan refresh tidak boleh dilaporkan sebagai kegagalan penyimpanan yang sudah dikonfirmasi server.

### Recovery human error planning

- `reset.preview` dan `reset.apply` fail-closed kecuali `system_config.database_environment` terikat canonical sebagai `development` atau `production`. Guard backend dijalankan setelah authorization Administrator (`owner`) dan sebelum preview membaca scope reset atau apply membuat safety backup/maintenance side effect. `unbound`/marker asing tetap ditolak; `reset.status` tetap dapat dibaca Administrator untuk outcome/recovery intent yang sudah ada. `reset.preview` menerima `resetScope=activity|activity_and_balances`. Scope saldo memasukkan state rekening (`initial_balance`, tanggal, `row_version`) ke fingerprint dan preview menampilkan saldo saat ini → Rp0. `reset.preview` menghitung data aktivitas/perencanaan sekaligus sisa operasional testing (`notification_deliveries`, `notification_queue`, `integration_links`, `integration_outbox`, dan `import_previews`) dan memasukkan scope yang benar-benar akan dibersihkan ke fingerprint. Queue canonical `system/rebuild` hasil reset sebelumnya tidak dihitung sebagai data testing dan dipertahankan/reuse. `reset.apply` hanya owner, wajib fingerprint yang masih sama, alasan, acknowledgement, frasa `BERSIHKAN DATA TESTING`, safety backup terverifikasi, maintenance lock, purge atomik, integrity check, rebuild integrasi, dan audit. `reset.status` wajib dipakai sebelum retry outcome unknown; bila purge sempat dimulai dan maintenance masih aktif, owner harus menjalankan integrity recovery dan hanya membuka maintenance jika check lulus. Rekening, kategori, pengguna, konfigurasi, audit log, backup, push subscription, dan preference notifikasi dipertahankan. Fitur ini hanya untuk fase setup/trial sebelum transaksi nyata dipakai. Pada masa awal aplikasi, Administrator dapat menjalankannya pada database Development maupun Production yang terikat canonical; setelah data nyata mulai dipakai, gunakan lifecycle/koreksi domain dan bukan pembersihan massal. Tidak ada reset terjadwal otomatis.
- `import.preview` memperlakukan file sebagai input tidak tepercaya: hanya field transaksi canonical yang diteruskan, control field client seperti `confirm_duplicate` diabaikan, dan seluruh baris disimulasikan berurutan dalam transaction yang selalu rollback agar saldo, Alokasi Dana, serta duplicate antarbaris diuji secara kumulatif. Preview hanya `acceptable=true` bila seluruh baris lolos. `import.apply` wajib menolak preview yang tidak acceptable, membuat safety backup, memvalidasi ulang seluruh record dalam satu transaction, menjalankan integrity check, lalu commit audit + status applied secara atomik. Partial import dilarang.
- `restore.preview` mengembalikan identitas backup (`fileName`, `createdAt`, `schemaVersion`, row counts) untuk review user. `restore.apply` hanya owner dan wajib preview valid, alasan minimal, acknowledgement, frasa `RESTORE SALDO BERSAMA`, safety backup, maintenance fail-closed, identity compatibility, transaction restore, integrity check, audit, serta rebuild integrasi. UI Pemulihan dan Audit wajib menawarkan integrity recovery bila maintenance masih aktif.
- Master/config Administrator-only memakai server lifecycle preview. `accounts`, `categories`, envelope rule, recurring rule, goal, dan budget hanya boleh hard-delete melalui action `deleteUnused` masing-masing ketika backend membuktikan seluruh histori/dependensi domain = 0. Begitu pernah dipakai, jalurnya hanya archive/restore.
- `envelopes.archiveRule` dan `envelopes.restoreRule` Administrator-only, memakai alasan + `row_version`, dan tidak menghapus movement/audit. `envelopes.deleteUnusedRule` hanya boleh menghapus rule baru bersama satu initial empty period yang belum pernah menjadi histori.
- `goals.archive`/`goals.restore`, `recurring.archiveRule`/`recurring.restoreRule`, dan compatibility action `budgets.archive`/`budgets.restore` tetap Administrator-only. Flow user-facing Kebutuhan memakai `budgets.previewLifecycle` + `budgets.remove`: backend memilih hard-delete hanya untuk Kebutuhan history-free milik Administrator, sedangkan Kebutuhan yang sudah mempunyai jejak finansial dihentikan tanpa menghapus histori. Member hanya dapat menjalankannya pada scope/assignee yang memang boleh dikelola. `goals.deleteUnused`, `recurring.deleteUnusedRule`, dan compatibility `budgets.deleteUnused` tetap Administrator-only.
- `recurring.archiveRule` boleh membersihkan future generated projections berstatus `expected` yang reproducible dan belum materialized. Paid/partial/past/cancelled/transaction-linked occurrence adalah histori dan tidak boleh hard-delete.
- `goals.list` mengembalikan `last_movement_row_version` bersama `last_movement_id`; `goals.reverseMovement` wajib membawa versi movement yang dilihat client melalui `rowVersion` atau `payload.row_version` sebelum linked transaction dibatalkan.
- `recurring.cancelOccurrence` melewati tepat satu occurrence tanpa membuat/membatalkan transaksi dan tanpa mengubah saldo. Hanya occurrence tanpa pembayaran aktif/aktual yang boleh dilewati. `recurring.restoreOccurrence` memulihkan occurrence tersebut menjadi `expected` atau `overdue` berdasarkan tanggal saat pemulihan. Keduanya Administrator-only, beralasan, memakai `row_version`, idempotency, audit, dan tidak menghapus histori.
- `envelopes.reverseMovement` dapat dipakai Administrator atau Member untuk movement yang dibuatnya sendiri, hanya selama kedua Alokasi Dana masih aktif dan nominal hasil realokasi belum terpakai/reserved. Reversal mengubah status movement menjadi `reversed`; tidak hard delete.

### Kontrak Web Push

- `notifications.center` mengembalikan event user-facing terbaru dari `notification_queue` yang hanya dimiliki actor saat ini. Action ini read-only, membatasi jumlah item, tidak mengekspos subscription endpoint/key, dan tidak mengubah status delivery.
- `notifications.status` membandingkan subscription browser dengan registrasi backend milik actor. Status aktif tidak boleh ditentukan hanya dari browser.
- `notifications.preferences` mengembalikan tujuh tipe alert canonical untuk actor. Belum adanya row berarti `enabled=true`. `notifications.updatePreference` hanya dapat mengubah preference milik actor sendiri, wajib `row_version` setelah row pertama tercipta, dan hanya memengaruhi alert terjadwal yang belum diantrikan; notification yang sudah masuk queue dapat tetap terkirim satu kali.
- `notifications.register` menerima endpoint HTTPS publik serta key `p256dh` dan `auth` yang valid. Endpoint milik akun lain, baik aktif maupun nonaktif, hanya dapat dipindahkan ketika client membuktikan subscription browser yang sama melalui kedua key yang persis cocok. Mismatch menghasilkan `PUSH_ENDPOINT_OWNERSHIP_CONFLICT`.
- Endpoint dengan port nonstandar, IP literal, hostname lokal/internal, dan alamat DNS yang mengarah ke jaringan nonpublik ditolak. Lookup terjaga dipakai sebagai agent request agar koneksi tidak melakukan resolusi DNS kedua yang tidak tervalidasi. Jika hostname berubah dan mengarah ke alamat privat saat pengiriman, subscription dinonaktifkan serta seluruh delivery tertundanya diakhiri agar tidak terus di-retry.
- `notifications.test` hanya mengirim ke endpoint aktif milik actor, wajib idempotency key, memakai cooldown, timeout, target `/pengaturan/notifikasi`, dan payload generik tanpa detail finansial. Frontend menjalankannya otomatis setelah registrasi; penerimaan oleh push service tidak membuktikan sistem operasi menampilkan notifikasi.
- `notifications.unregister` menonaktifkan subscription dan menandai delivery tertunda pada perangkat tersebut sebagai `expired`.
- Scheduled delivery memakai satu `notification_deliveries` per subscription. Retry hanya mengulang perangkat gagal dan tidak mengirim ulang ke perangkat yang sudah sukses.
- Web Push memakai **privacy-safe lock-screen payload**. Queue server boleh menyimpan `title/body` detail untuk konteks internal/audit operasional, tetapi transport ke push service hanya membawa `notificationType`, `targetPath`, dan `notificationId`. Service Worker membentuk copy generik berdasarkan tipe tanpa nominal, nama rekening, merchant, atau nama objek finansial. `notifications.test` tetap generik.
- `reminders.get/upsert/cancel` hanya bekerja untuk actor aktif dan objek yang dapat diakses actor. Reminder manual didukung untuk `recurring_occurrence`, `budget`, `envelope_period`, dan `goal`; satu actor hanya memiliki satu reminder `scheduled` per objek. `reminders.get` juga mengembalikan `lastDispatch` untuk reminder terbaru yang sudah masuk queue agar UI dapat membedakan `pending`, `processing`, `failed`, `sent`, `dead_letter`, atau queue yang tidak lagi ditemukan.
- `reminders.upsert` menerima `scheduled_local` format `YYYY-MM-DDTHH:mm` Asia/Jakarta, future, maksimal 366 hari. Server mengubahnya ke UTC. Update/cancel wajib `rowVersion`; concurrent change ditolak HTTP 409. User tidak boleh mengirim title/body reminder sebagai sumber kebenaran. Reminder baru ditolak dengan `REMINDER_DELIVERY_PENDING` selama dispatch reminder sebelumnya masih nonterminal (`pending`, `processing`, `failed`, atau queue missing); status `sent`/`dead_letter` membuka penjadwalan baru.
- Scheduler mengklaim reminder due secara atomik, membaca ulang entity terbaru, membuat queue server-side, memakai dedupe `manual-reminder:<reminder_id>`, lalu mengubah status reminder menjadi `queued`. Archive/delete/complete/close/cancel pada entity membatalkan reminder `scheduled` terkait dalam transaction lifecycle yang sama; scheduler tetap menjadi guard kedua untuk drift. Entity yang hilang, tidak aktif, atau tidak lagi boleh diakses dibatalkan fail-closed dan diaudit. Transport Web Push tetap privacy-safe dan tidak membawa copy detail queue. Pengingat otomatis tujuh tipe tetap berjalan terpisah.


### Kontrak kategori dan transfer

- `transaction_type` kategori hanya `expense`, `income`, atau `refund`. Transfer tidak memakai kategori; pemindahan antar rekening dicatat melalui transaksi `transfer` agar tidak masuk total pemasukan/pengeluaran.
- `nature` hanya bermakna untuk `expense`. Create `income`/`refund` tanpa nature dinormalisasi ke `other`; nature pengeluaran eksplisit pada kedua jenis tersebut ditolak.
- Kategori expense baru dengan nature legacy `savings` ditolak dengan `SAVINGS_CATEGORY_NOT_ALLOWED`. Data legacy tetap dapat dibaca dan mempertahankan nilai lama sampai owner memilih klasifikasi pengeluaran baru.
- Memindahkan dana ke rekening tabungan sendiri harus menggunakan Transfer atau Target. Pengeluaran baru dicatat ketika pembayaran aktual kepada pihak luar terjadi.

### Kontrak investasi asset-centric dan compatibility RDN/portfolio

- Product surface Investasi bersifat **asset-centric**: saham dan reksa dana ditampilkan langsung sebagai aset, bukan dikelompokkan berdasarkan Ajaib/Bibit/Indodax/broker. Broker/source label tidak menjadi parent UI dan tidak menjadi sumber authority. `investment_portfolios` + rekening `account_type=investment` tetap dipertahankan sebagai compatibility layer agar histori investasi lama, reconciliation, cost basis, audit, backup/restore, dan FK compatibility tidak diputus.
- `investments.assets.create` adalah entry point canonical untuk posisi aset baru. Action menerima `instrument_id` aktif yang sudah ada, atau metadata instrumen (`ticker`, `name`, `exchange`, `lot_size`) bila Administrator membuat instrumen baru; Member hanya dapat memakai instrumen registry existing. Posisi menerima `shares`, `cost_basis`, `reference_price`, optional `position_date`, dan optional `notes`. Mutation wajib idempotency key dan diverifikasi ownership/capability backend.
- Bila actor belum memiliki compatibility portfolio yang dapat dipakai, `investments.assets.create` membuat rekening internal `account_type=investment` dengan saldo awal Rp0 dan `is_system_hidden=1`, lalu membuat portfolio internal `broker=other`. Rekening internal ini bukan rekening user-facing dan dikeluarkan dari `accounts.list`; Administrator mendapat bridge `shared`, sedangkan Member mendapat bridge `personal` miliknya. Jika ada portfolio legacy yang masih operable, backend dapat menggunakannya tanpa mengekspos broker sebagai hierarchy UI.
- Posisi awal dari `investments.assets.create` disimpan append-only sebagai semantic `opening_position` dengan `cash_delta=0` dan `cash_effect_enabled=0`. Karena itu mencatat saham/reksa dana tidak menambah/mengurangi saldo rekening/RDN. Duplicate aset pada compatibility portfolio yang sama ditolak dan user diarahkan ke Beli/Jual/Perbarui nilai.
- `investments.overview` tetap mengembalikan `portfolios[]`, `instruments[]`, dan `summary` untuk backward compatibility. UI canonical meratakan `holdings` menjadi daftar aset dan memakai `summary.market_value` sebagai **Total investasi tercatat**; `summary.rdn_cash` dan `summary.portfolio_value` tetap tersedia untuk histori/compatibility tetapi tidak menjadi hierarchy atau total investasi utama. Holding membawa quantity/share, weighted `average_cost`, `cost_basis`, harga terakhir + sumber, `market_value`, realized/unrealized P/L, serta activity.
- Activity overview mempertahankan `activity_type=trade` + `trade_type=buy|sell` dan `event_type=buy|sell|valuation|opening_position|correction`. Route canonical memakai tab **Aset / Aktivitas** dan filter **Semua / Saham / Reksa Dana**; tidak ada tab broker/portfolio pada user-facing flow.
- `investments.trades.buy` dan `investments.trades.sell` menerima `portfolio_id`, `instrument_id`, `lots`, `price_per_share`, `fee_amount`, optional `trade_date`, dan optional `notes`. Trade current disimpan dengan `cash_effect_enabled=0`: `cash_amount` tetap immutable untuk weighted cost basis/realized P/L, tetapi Buy/Sell baru **tidak memutasikan saldo RDN/rekening dan tidak mensyaratkan dana RDN cukup**. Sell tetap ditolak bila quantity melebihi holding; fee/tanggal/row-version/idempotency tetap divalidasi.
- Histori legacy yang memang memiliki dampak cash mempertahankan `cash_effect_enabled=1`, dan view `investment_account_events` hanya memproyeksikan row dengan flag tersebut. Dengan demikian ledger historis tidak ditulis ulang, sementara record current bersifat accounting-only.
- Cost basis authoritative dihitung backend dari event history dengan weighted-average integer. Buy menambah cost basis sebesar gross + fee; partial/full sell mengurangi proportional remaining cost basis dan membentuk realized P/L dari gross - fee. Harga terakhir yang diketahui berasal dari trade, valuation manual, atau opening position terbaru; unrealized P/L = market value - remaining cost basis. Semua ini bukan income/expense.
- `investments.valuations.update` membuat snapshot harga append-only dan tidak mengubah saldo. Buy/Sell/valuation baru tetap tunduk pada tanggal portfolio compatibility dan checkpoint reconciliation yang relevan; mutation stale ditolak `CONFLICT`.
- `investments.portfolios.create`, `investments.openingPositions.create`, `investments.reconciliations.create`, dan `investments.corrections.create` tetap contract legacy/maintenance untuk data lama dan recovery operasional. UI asset-centric baru tidak memerlukan user membuat broker/RDN/portfolio terlebih dahulu. Rekonsiliasi legacy tetap snapshot-only dan tidak auto-adjust; correction reguler tetap Administrator-only.
- Rekening `account_type=investment` legacy tetap transfer-only pada ledger transaksi biasa: ordinary `income`, `expense`, `refund`, dan `adjustment` ditolak; Bank↔RDN legacy menggunakan Transfer canonical. Rekening internal `is_system_hidden=1` tidak ditawarkan pada rekening, transfer, planning, atau generic reconciliation.
- `investments.instruments.upsert` tetap Administrator-only. Ticker unik dinormalisasi uppercase, `lot_size` integer positif, status `active|inactive`; Buy baru hanya menerima instrumen aktif, sedangkan Sell holding existing tetap boleh untuk instrumen inactive.
- `investments.overview` dan Dashboard memakai read-model backend yang sama. Browser tidak menjadi authority perhitungan finansial. Portfolio personal pasangan tetap readable menurut transparency policy existing tetapi `can_operate=false`; write selalu memeriksa ownership backend.
- Idempotency key mutation investasi mengikuti dispatcher canonical. Retry intent yang sama wajib memakai key yang sama; `OUTCOME_UNKNOWN` tidak boleh menghasilkan posisi/trade/correction kedua dengan key baru.

### Kontrak rekening dan provider visual

- `accounts.create` untuk `account_type=bank` menerima `account_number` wajib. Input boleh memakai angka, spasi, atau tanda hubung; server menyimpan 6–34 digit hasil normalisasi.
- `accounts.update` menerima `account_number` bersama `row_version`; conflict tetap ditolak dan tidak boleh ditimpa diam-diam.
- `accounts.update` tidak boleh mengubah `account_type`; jenis rekening bersifat immutable setelah create dan backend menolak percobaan perubahan dengan `ACCOUNT_TYPE_IMMUTABLE`. Form edit hanya mengubah field yang memang diizinkan.
- `accounts.create` dan `accounts.update` menerima `bank_template` terpisah dari `name`. Backend hanya menerima `generic`, `bca`, `bni`, `btn`, `mandiri`, atau `permata` untuk rekening bank; rekening non-bank selalu dinormalisasi ke `generic`. Mengubah template tidak boleh mengubah nama rekening.
- `accounts.list` mengembalikan `bank_template` canonical. Client boleh memakai deteksi suffix nama hanya sebagai fallback visual untuk object legacy yang belum melalui normalisasi, bukan sebagai storage baru.
- `accounts.create` dan `accounts.update` menerima `ewallet_template` terpisah dari `name`. Backend hanya menerima `generic`, `shopeepay`, `dana`, `gopay`, `ovo`, atau `linkaja` untuk `account_type=ewallet`; rekening non-E-wallet selalu dinormalisasi ke `generic`.
- `accounts.list` mengembalikan `ewallet_template` canonical. Deteksi provider dari nama hanya boleh dipakai sebagai fallback legacy ketika field belum ada; nilai `generic` yang sudah tersimpan bersifat authoritative dan tidak boleh ditimpa inferensi nama.
- `accounts.list` mengembalikan seluruh rekening shared dan personal kepada dua pengguna aktif yang terotorisasi. Rekening personal membawa `owner_name`, `is_owned_by_actor`, `can_transact`, `can_reconcile`, `can_manage`, dan `read_only` yang dihitung backend.
- Read model rekening juga mengembalikan `balance`, `allocated_remaining`, dan `available_balance`. `balance` tetap saldo ledger fisik. Untuk rekening non-investasi, `allocated_remaining` adalah bagian saldo yang masih terikat pada Alokasi Dana aktif dan `available_balance = balance - allocated_remaining`. Untuk RDN/investment, alokasi legacy diperlakukan non-operasional sehingga `allocated_remaining=0` dan Cash RDN tidak tertahan oleh Alokasi Dana lama. Nilai-nilai ini tidak disimpan sebagai angka bebas edit.
- Nomor rekening lengkap hanya dikirim setelah authentication dan binding user berhasil. Transparansi baca kepada pasangan tidak memperluas write: member tetap tidak dapat bertransaksi atau merekonsiliasi rekening personal pasangan.
- `transactions.list`, dashboard, laporan, serta `reconciliations.list` memakai ledger readable yang sama agar saldo dapat ditelusuri. Capability edit/cancel transaksi tetap memperhitungkan creator dan scope operable. Label rekening pada filter, breakdown, alert, dan rekonsiliasi menyertakan kepemilikan agar rekening personal pasangan tidak ambigu.
- `dashboard.overview.totalBalance` tetap backward-compatible sebagai jumlah saldo seluruh rekening readable, termasuk RDN. Field additive `nonInvestmentBalance` dan `nonInvestmentOpeningBalance` menjumlahkan rekening readable non-investasi dan menjadi sumber UI **Saldo rekening**. `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, `allocatedRemaining`, serta reserved recurring operasional hanya memakai rekening non-investasi yang dapat dioperasikan actor; Cash RDN tidak boleh menaikkan dana aman/harian atau dana belum dialokasikan. `unallocatedCount` tetap menghitung transaksi expense tanpa Alokasi Dana sesuai ledger/scope operable existing.
- Tren saldo harian/bulanan laporan menyediakan `totalBalance` (seluruh rekening, termasuk RDN) dan `nonInvestmentBalance` (Saldo utama/non-investasi). `totalBalance` tetap merekonsiliasi `investment_account_events` untuk compatibility, tetapi presentation Saldo utama wajib memakai `nonInvestmentBalance`. Snapshot **Total kekayaan tercatat · saat ini** dihitung sebagai `nonInvestmentBalance + investments.overview.summary.portfolio_value`; `totalBalance + portfolio_value` dilarang karena akan double-count RDN. Historical market-value/net-worth tidak disintesis sebelum tersedia histori valuasi authoritative.
- Audit create/update hanya mencatat bentuk bertopeng empat digit terakhir. Nomor rekening tidak ditambahkan ke Sheets mirror atau export baca. Backup teknis tetap memuat kolom tersebut untuk recovery terjaga.
- Field ini adalah nomor rekening transfer, bukan nomor kartu debit. PIN, CVV, masa berlaku, serta nomor kartu debit tidak diterima.
- Lifecycle preview (`accounts.previewLifecycle`, `categories.previewArchive`, `envelopes.previewRuleLifecycle`, `recurring.previewRuleLifecycle`, `goals.previewLifecycle`) menghitung dependency sebelum lifecycle Administrator. Khusus Kebutuhan, `budgets.previewLifecycle` juga tersedia untuk Member yang berhak mengelola scope/assignee dan mengembalikan `removal_mode`, `remaining_amount`, serta `release_amount`; `budgets.remove` mengeksekusi keputusan server secara atomik.
- `envelopes.close` menerima `envelope_period_id`, `row_version`, dan optional boolean `reuse_needs`. Action tetap write idempotent dan berjalan dalam transaction canonical.
- Penutupan periode Alokasi Dana selalu memastikan periode aktif berikutnya untuk rule yang tetap aktif. Untuk `rollover_policy=unallocated`, periode berikutnya dibuat dengan `allocated_amount=0` dan sisa periode lama dikembalikan sebagai `released_amount`. Untuk `rollover_policy=carry`, hanya `remaining` aktual yang ditambahkan ke periode berikutnya dan movement rollover dibuat hanya bila nominal > 0; sisa Rp0 tetap menghasilkan periode aktif berikutnya.
- Bila `reuse_needs=true` dan periode tujuan berada pada bulan berbeda, backend menyalin Kebutuhan yang berstatus aktif pada akhir bulan sumber—baik row operasional maupun `budget_history` compact setelah tutup buku—ke bulan tujuan memakai identitas kategori + ownership + `envelope_rule_id`. Kebutuhan yang sudah ada di periode tujuan selalu dipertahankan dan dilewati. Copy continuity tidak memindahkan transaksi, saldo, histori pemakaian, atau nominal alokasi. Response `envelopes.close` dapat mengembalikan `next_period`, `released_amount`, `rollover`, dan `needs_continuity`.
- `accounts.deleteUnused` bukan purge umum. Action ini hanya berhasil bila rekening aktif mempunyai saldo awal Rp0, saldo saat ini Rp0, tidak pernah memiliki transaksi dalam status apa pun, tidak memiliki rekonsiliasi, dan tidak pernah direferensikan Alokasi Dana, Jadwal Rutin, atau Target. Alasan, acknowledgement, frasa konfirmasi, `row_version`, idempotency, dan audit wajib.
- Rekening yang pernah digunakan hanya boleh memakai `accounts.archive`; `accounts.archive` sekarang juga membutuhkan alasan. Prinsip yang sama berlaku pada master/config lain: history memblokir hard delete tetapi tetap dipertahankan saat archive selama future-active dependency domain tidak membuat archive tidak valid.

### Kontrak Alokasi Dana account-bound

- `envelopes.create` wajib menerima `source_account_id` rekening aktif non-investasi yang dapat dioperasikan actor. Administrator dapat memakai scope yang memang operable; Member dapat membuat Alokasi Dana pada rekening `shared` atau rekening `personal` miliknya sendiri; rekening personal pengguna lain tetap ditolak backend. Pilihan tanpa rekening sumber atau rekening `account_type=investment` tidak valid untuk Alokasi Dana baru (`INVESTMENT_ACCOUNT_NOT_OPERATIONAL`). Alokasi legacy yang pernah menunjuk RDN tetap readable/archivable tetapi capability operasional (`can_adjust`, `can_manage_needs`, `can_move`, `can_record_expense`) false dan tidak mengikat Cash RDN.
- `recurring.createRule`/`recurring.updateRule` hanya menerima `default_account_id` non-investasi yang aktif dan dapat dioperasikan. Jadwal Rutin legacy yang menunjuk RDN tetap readable tetapi `can_pay=false`; frontend juga tidak menawarkan RDN pada selector pembayaran/rule baru.
- `budgets.upsert` mengizinkan Member membuat/mengubah Kebutuhan pada scope `shared` atau scope `personal` milik actor sendiri. `budgets.batchCreate` memakai boundary authorization yang sama untuk membuat maksimal 20 Kebutuhan dalam satu Alokasi/periode. Batch wajib memiliki kategori unik, scope/owner harus sama dengan Alokasi, legacy budget tanpa `envelope_rule_id` membutuhkan `row_version`, dan Jadwal Rutin opsional yang dibuat bersama item harus memakai rekening sumber/ownership yang kompatibel; dispatcher menjalankan seluruh batch dalam satu transaction sehingga satu kegagalan me-rollback Kebutuhan serta jadwal lain di request tersebut. Bila Kebutuhan dihubungkan ke Alokasi Dana melalui `envelope_rule_id`, scope dan `owner_user_id` harus sama dengan Alokasi Dana tersebut. Scope personal milik pengguna lain tetap ditolak backend. Hak yang sama berlaku untuk Alokasi Dana dan Jadwal Rutin personal milik Member; Target baru tetap wajib memakai rekening Bersama.
- Read model planning membawa capability server-side untuk rendering UI. `envelopes.list` mengembalikan capability action-specific seperti `can_manage`, `can_adjust`, `can_manage_needs`, `can_move`, `can_set_reminder`, dan `can_record_expense` berdasarkan role, ownership, assignee, dan status. `budgets.list` mengembalikan `can_manage`, termasuk guard assignee dari Alokasi terkait. `recurring.list` mengembalikan capability lifecycle/action nyata dan `reverse_transaction_id` hanya untuk transaksi occurrence yang benar-benar boleh dibatalkan actor; frontend tidak boleh membangun authorization paralel dari role/scope.
- `dashboard.overview` memakai resolver capability Alokasi canonical yang sama untuk `overview.envelopes`, sehingga setup checklist serta composer transaksi/Jadwal Rutin dapat membaca `can_manage_needs`/`can_record_expense` tanpa menghitung ulang policy assignee di frontend.
- Membuat, menambah, melepas, atau memindahkan alokasi tidak membuat transaksi ledger dan tidak mengubah `balance`. Alokasi hanya mengikat atau melepas sebagian saldo rekening sehingga `available_balance` berubah secara realtime.
- `envelopes.adjustAllocation` menerima `envelope_period_id`, `direction=fund|release`, `amount`, dan `row_version`. `fund` memindahkan dana tersedia ke Alokasi Dana existing; `release` mengembalikan hanya bagian yang belum `used`/`reserved` ke dana tersedia. Backend memvalidasi rekening sumber, scope, penerima jatah, dana bebas, optimistic version, idempotency, dan audit.
- Pengeluaran yang memakai `envelope_period_id` wajib memakai `source_account_id` yang sama dengan rekening sumber rule Alokasi Dana. Mismatch ditolak backend dengan `ENVELOPE_SOURCE_ACCOUNT_MISMATCH`.
- Pengeluaran tanpa Alokasi Dana dan transaksi `transfer` memakai dana bebas. Untuk rekening yang tidak mengizinkan saldo negatif, server menolak write dengan `UNALLOCATED_FUNDS_INSUFFICIENT` bila write tersebut akan memakai dana yang masih dialokasikan. Overspend Alokasi Dana hanya memakai dana bebas untuk bagian nominal yang melampaui sisa Alokasi Dana, sesuai `overspend_policy` existing.
- `envelopes.move` hanya boleh memindahkan alokasi antar Alokasi Dana dengan rekening sumber yang sama. Pemindahan nilai antar rekening harus dicatat sebagai transaksi `transfer`. `envelopes.reverseMovement` tetap dapat membalik movement legacy sebagai recovery agar realokasi lintas rekening lama dapat dikoreksi.
- `envelopes.restoreRule` memerlukan rekening sumber aktif dan memeriksa ulang dana bebas sebelum mengaktifkan kembali alokasi arsip. Rule legacy tanpa rekening sumber tidak dapat dipulihkan atau dipakai untuk transaksi/realokasi; owner harus mengarsipkan lalu membuat ulang Alokasi Dana dengan sumber yang jelas.
- Update/cancel/restore transaksi wajib menjaga proyeksi `balance >= allocated_remaining` pada rekening non-`allow_negative`. Integrity check juga mendeteksi sumber Alokasi Dana invalid, transaksi Alokasi Dana beda rekening, realokasi aktif lintas rekening, dan alokasi yang melebihi saldo fisik.

### Transfer lintas shared/personal dan mutasi Target

- `transactions.create/update` untuk `transfer` memvalidasi rekening sumber sebagai rekening yang dapat dioperasikan actor dan rekening tujuan sebagai rekening aktif yang readable. Sumber dan tujuan tidak boleh sama. Ownership ledger transfer mengikuti rekening sumber/debit, sehingga personal A → personal B dapat direpresentasikan tanpa memberi actor hak debit atas rekening tujuan.
- Administrator dapat melakukan transfer shared ↔ personal secara langsung bila rekening valid. Member yang memindahkan dana dari **personal miliknya → shared/personal lain** dapat melakukan transfer langsung, tetapi **shared → personal mana pun** wajib membuat `transferRequests.request`; direct `transactions.create` ditolak `TRANSFER_APPROVAL_REQUIRED`. `transferRequests.review` hanya Administrator, memakai `row_version` + idempotency, membaca ulang requester/rekening, dan membuat satu transaksi canonical secara atomik ketika approve.
- `app.initialState`/bootstrap mengembalikan `transferRoutes` untuk pasangan rekening aktif/readable yang relevan bagi actor dengan `mode=direct|approval_required`; pasangan yang tidak boleh dipakai sebagai source tidak diekspos sebagai route. Field ini hanya mengarahkan affordance/pemilihan mutation frontend. `transactions.create` dan `transferRequests.request/review` tetap melakukan authorization serta revalidation backend dan tidak mempercayai route dari client.
- `accounts.requestCreate` dan `categories.requestCreate` hanya untuk Member. Payload dinormalisasi backend sebelum disimpan sebagai request; Administrator mereview melalui `masterDataRequests.review`. Approval membuat entity canonical dalam transaksi yang sama, sedangkan reject tidak membuat master data. Pending duplicate intent dikoaleskan oleh request key server-side.
- Transfer **personal A → personal B** memakai ownership rekening sumber A pada row transaksi. `owner_user_id` transaksi selalu merepresentasikan pihak debit/sumber, bukan pemilik rekening tujuan.
- Member tetap tidak memperoleh hak operasi rekening personal pasangan: rekening tersebut tidak boleh menjadi source/debit Member, walaupun boleh menjadi destination transfer. Owner/role dari client tidak menjadi authority.
- `goals.move` memakai aturan representability yang sama. Untuk Target shared, sumber setoran boleh rekening shared atau rekening personal actor yang operable; rekening Target tetap harus menjadi destination pada deposit dan source pada withdrawal. Target personal hanya dapat dipasangkan dengan shared atau rekening personal pemilik Target yang sama. Read model `goals.list` hanya memberi `can_withdraw=true` bila ada rekening tujuan lain yang valid untuk actor; bila progress ada tetapi destination tidak tersedia, response membawa alasan presentasi aman dan UI tidak boleh menawarkan penarikan dead-end.
- Transfer dan mutasi Target tetap neutral terhadap income/expense; tidak boleh dihitung sebagai pemasukan/pengeluaran laporan.

### Pembagian beban biaya transaksi shared (compatibility)

- `transactions.create` dan `transactions.update` menerima `cost_share_mode=unspecified|equal|percentage` hanya untuk `expense` dengan `scope=shared`. Transaksi lain dinormalisasi ke `unspecified`.
- `recurring.payOccurrence` menerima kontrak cost sharing yang sama ketika occurrence aktual adalah `expense` shared. Rule jadwal tidak menyimpan split sebagai asumsi permanen; pembagian dipilih saat transaksi aktual dicatat.
- Mode `equal` membagi nominal integer Rupiah secara deterministik ke seluruh pengguna aktif. Mode `percentage` menerima `cost_share_percentages: [{ "user_id": "...", "percentage": 50 }]`, wajib mencakup seluruh pengguna aktif, tidak duplikat, integer 0–100, dan total tepat 100%.
- Backend menyimpan snapshot participant, basis points, dan nominal hasil split pada `transactions.cost_share_json`. Edit biasa atau edit nominal dengan mode yang sama mempertahankan participant/basis snapshot transaksi, termasuk bila daftar user aktif kemudian berubah. Mengubah mode atau persentase berarti keputusan split baru dan wajib divalidasi terhadap pengguna aktif saat itu. Histori lama tetap `unspecified` dan tidak di-backfill 50:50.
- Pembagian beban hanya metadata analitis. Ia tidak menambah ledger entry, tidak mengubah `balance`, dan tidak mengganti `created_by` sebagai actor pencatat. Payer, beneficiary, settlement, dan kontribusi aktual tetap belum dimodelkan.
- Refund belum mengembalikan alokasi Alokasi Dana atau cost split expense asli secara otomatis. Relasi refund-ke-expense asli tetap keputusan produk terpisah dan tidak boleh disimulasikan dengan memilih Alokasi Dana sembarang.

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
- `costShareExpenses`: response compatibility untuk expense shared historis yang memiliki snapshot `equal` atau `percentage`; UI canonical baru tidak lagi menawarkan split atau menampilkan panel ini sebagai analitik utama;
- `natureExpenses`: expense menurut `categories.nature`;
- `overview.alerts`: peringatan actionable dari Kebutuhan, Alokasi Dana, Jadwal Rutin, Target, transaksi belum dialokasikan, dan rekonsiliasi.

Field tambahan tersebut backward-compatible; transfer internal tetap tidak masuk income/expense/net.

## Version/conflict

`rowVersion` atau `payload.row_version` wajib untuk update/cancel/reverse yang memodifikasi record versionable. Mismatch menghasilkan HTTP 409; client wajib reload dan tidak boleh overwrite diam-diam.

## Compatibility

Perubahan action name, request/response shape, error code, permission, idempotency, ownership, atau side effect memerlukan RFC, contract/test update, dan release note. Payload detail paling akurat berada pada validator di service source sampai JSON Schema per action tersedia.

- `envelopes.create` menerima `assignee_user_id` nullable. Nilai kosong berarti Jatah Bersama; user ID aktif berarti jatah pengguna tersebut. Field ini terpisah dari `scope`/`owner_user_id` ledger. Rekening personal hanya boleh membuat jatah untuk pemilik rekening. Member hanya dapat memakai atau memindahkan Jatah Bersama dan jatah miliknya sendiri; backend menolak jatah pengguna lain.

- `fullReset.preview` mengembalikan ringkasan domain/master/operasional yang akan dihapus serta backbone yang dipertahankan. `fullReset.apply` hanya owner, wajib fingerprint terbaru, alasan, acknowledgement, exact phrase `RESET SEMUA DATA SALDO BERSAMA`, verified safety backup, maintenance lock, purge atomik, integrity check, audit, dan rebuild projection. `fullReset.status` merekonsiliasi outcome unknown menggunakan idempotency, deterministic safety backup, audit append-only, dan maintenance.

### Realtime sync contract

`sync.state` adalah read-only action Administrator/Member yang mengembalikan revision global dan revision per read-resource. Nilainya hanya sinyal cache invalidation; ia tidak memuat atau menggantikan saldo/ledger/domain state. Mutation publik, termasuk `budgets.batchCreate`, wajib dipetakan di `api/_lib/syncRevisions.js`; revision untuk mutation database dinaikkan di transaction yang sama. Client boleh memakai revision untuk menentukan resource yang perlu direload, tetapi hasil read canonical backend tetap sumber kebenaran.

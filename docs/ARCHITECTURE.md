# Arsitektur Saldo Bersama

## Ringkasan

Turso adalah satu-satunya **source of truth**. React tidak berkomunikasi langsung dengan Turso, Google Sheets, Calendar, atau Drive. Semua akses data melewati Vercel Functions yang memverifikasi session Firebase, role, ownership, payload, idempotency, dan versi row.

```text
PWA React/Vite
  -> Localhost/device emulation Firebase popup
  -> Production desktop/mobile Google OAuth server callback
       -> Google ID token -> Firebase Identity Toolkit -> verified Firebase identity
  -> HttpOnly signed session
  -> Vercel Functions
  -> Turso Database
       -> integration_outbox
       -> Apps Script bridge
            -> Sheets mirror
            -> Calendar shared
            -> Drive backup
```


## Kebijakan environment

Runtime lokal memakai `.env.local` yang dapat di-bootstrap secara guarded dari Vercel Development. Vercel Production adalah runtime deployment, sedangkan Preview tetap kosong. Lokal dan Production saat ini memakai satu database Turso sesuai keputusan pemilik. Nama environment canonical dan lokasi setiap secret didokumentasikan di `ENVIRONMENT_VARIABLES.md`.

## Trust boundaries

1. Browser dianggap tidak tepercaya.
2. Firebase ID token diverifikasi server-side sebelum session dibuat. Production memperoleh Firebase ID token untuk desktop dan mobile melalui Google OAuth Authorization Code callback server; signed state/nonce, callback origin, dan allowlist tetap diverifikasi sebelum session dibuat.
3. `ALLOWED_USERS_JSON` adalah outer allowlist; tabel `users` adalah binding internal. Keduanya harus konsisten.
4. UID, role, email actor, timestamp, audit, scope internal, dan status tidak diterima dari client sebagai kebenaran.
5. Turso URL/token hanya berada di server environment.
6. Apps Script bridge hanya menerima request HMAC dengan timestamp dan nonce.

## Data flow write

1. Client membuat idempotency key.
2. Gateway memeriksa session, origin, rate limit, action, dan reserved fields. Daftar exact reserved field transaksi bersifat canonical di `api/_lib/transactionContract.js`; gateway authorization dan finance service menegakkan contract yang sama secara independen sebagai defense in depth.
3. Backend membaca actor canonical dari Turso.
4. Service melakukan validasi dan optimistic version check.
5. Perubahan utama, audit, idempotency response, dan outbox commit dalam transaction yang sama.
6. Response sukses baru dikirim setelah commit.
7. Worker memproses Sheets/Calendar/Drive secara terpisah. Kegagalan integrasi tidak membatalkan transaksi finansial.

## Internal code boundaries

- Lima endpoint di `api/` hanya melakukan HTTP/session orchestration.
- Handler action canonical berada di `api/_lib/actions/registry.js`; operational metadata berada di `api/_lib/actions/policy.js`; authorization role/scope tetap canonical di `api/_lib/security.js`.
- Business service besar dibagi ke `services/planning/`, `services/reporting/`, dan `services/maintenance/`; `index.js` pada masing-masing area menjadi stable public barrel untuk import lintas service.
- Frontend feature memakai `*.api.js`; transport/cache/error hanya berada di `frontend/src/services/api/`.
- Dependency frontend mengalir `app -> feature/layout`, lalu `feature -> app context/shared/services`. `shared` dan `domain` tidak boleh mengimpor implementation `feature`.
- Presentation murni yang dipakai lintas feature berada di `frontend/src/shared/presentation/`. Wrapper presentation lama di feature telah dipensiunkan dan harus tetap tidak ada; governance test menjaga agar helper lintas feature tidak kembali terduplikasi.
- Quick transaction composer dimiliki application context (`TransactionComposerContext`) sehingga layout dan dashboard tidak mengimpor `TransactionForm` secara langsung.
- Feature yang memerlukan action domain feature lain membuat adapter lokal ke `services/api/client.js`, bukan mengimpor `*.api.js` milik feature lain. Reuse komponen visual lintas feature harus eksplisit dan tidak boleh membawa business rule atau write API.
- Feature/page tidak boleh mengimpor transport global untuk write dan tidak boleh mengimpor toolkit UI langsung.
- `test/governance/source-architecture.test.js` menjaga relative-import cycle, dependency direction, dan canonical helper yang rawan copy-paste.
- `test/governance/data-deletion-policy.test.js` menjaga inventaris exact seluruh hard-delete production. DELETE baru di luar allowlist gagal CI; ledger normal, audit, movement, rekonsiliasi, dan period closure tidak boleh memperoleh business hard-delete. Master/config hanya dapat hard-delete melalui server-proven `deleteUnused`, sedangkan histori memakai archive/cancel/reverse.

## Read model

Saldo dihitung dari:

```text
saldo awal + dampak transaksi aktif hingga cutoff date
```

- income/refund menambah rekening tujuan;
- expense mengurangi rekening sumber;
- transfer mengurangi sumber dan menambah tujuan;
- adjustment hanya owner dan mengikuti rekening yang divalidasi;
- cancelled/archived tidak memengaruhi saldo.

`visibleAccounts()` sengaja menghitung aggregate saldo dengan `CASE` SQL untuk menghindari N+1. Subquery transaksi membatasi `status` dan rentang tanggal di `WHERE` agar histori di luar cutoff tidak ikut diagregasi. Validasi point-in-time tetap memakai `transactionImpact()`/`accountBalanceAsOf()`. Kedua implementasi wajib tetap parity dan dijaga oleh regression test di `test/business/business-rules.test.js`.

Alokasi memakai read model account-bound tanpa transaksi sintetis:

```text
allocated_remaining = total sisa Kantong aktif dari rekening sumber
available_balance = balance - allocated_remaining
```

`balance` tetap saldo ledger fisik. Membuat Kantong hanya mengikat dana bebas. Expense berkantong wajib memakai rekening sumber Kantong yang sama; bagian yang ter-cover oleh Kantong menurunkan `balance` dan `allocated_remaining` bersama-sama sehingga dana bebas tidak turun dua kali. Expense tanpa Kantong dan Transfer hanya boleh memakai `available_balance` pada rekening yang tidak mengizinkan saldo negatif.

## Concurrency

- Turso transaction digunakan untuk write atomik.
- Record yang dapat diedit membawa `row_version`.
- SQL update memakai `WHERE id=? AND row_version=?`.
- affected row nol menghasilkan HTTP 409.
- Retry hanya terbatas dan memakai idempotency key yang sama.
- Outbox memakai coalescing pending/failed dan dapat merebut kembali worker macet. Penyelesaian job wajib cocok dengan `locked_by` agar worker lama tidak menutup pekerjaan worker baru.
- Read multi-query penting (`app.initialState`, dashboard, transaksi terfilter, laporan, export, mirror, Calendar snapshot) memakai read transaction agar berasal dari snapshot database yang konsisten. Statement independen di dalam snapshot digabung dengan `tx.batch()` supaya konsistensi snapshot tetap terjaga tanpa satu HTTP round-trip per statement.
- Read action tidak melakukan query `maintenance_mode` karena maintenance memang mengizinkan read. Write tetap memeriksa `maintenance_mode` sebelum dispatch dan membacanya ulang di dalam write transaction untuk menutup race dengan restore/import.
- Telemetry `database.read.metrics` membedakan jumlah SQL statement (`dbQueryCount`) dari jumlah pipeline HTTP Turso (`dbPipelineCount`) agar latency network dapat diaudit tanpa mencatat SQL atau payload finansial.

## Google integrations

Sheets adalah mirror satu arah dan dapat dibangun ulang. Calendar hanya menerima recurring item `shared`. Drive menyimpan backup teknis terkompresi dan ter-checksum. Apps Script tidak memiliki business logic finansial.

## PWA

Service worker hanya meng-cache app shell dan asset statis. `/api/*` tidak pernah dicache. Offline write ditolak agar tidak terjadi transaksi ganda atau status ambigu. Instalasi iOS dilakukan melalui Safari → Share → Add to Home Screen.

## UI architecture

Shared UI primitive memakai CSS Modules dan design tokens project. Feature mengimpor shared wrapper, bukan toolkit secara langsung. Surface responsive yang memiliki implementasi mobile dan desktop terpisah hanya di-mount untuk breakpoint aktif; CSS tidak dipakai sebagai satu-satunya cara menyembunyikan duplikat DOM berat. Mantine telah disetujui sebagai toolkit target untuk perilaku kompleks melalui staged adoption; dependency dan lockfile Mantine tersedia, tetapi runtime adoption tetap bertahap melalui wrapper project. Kontrak lengkap berada di `UI_DESIGN_SYSTEM.md` dan ADR-0009.


## Batas privasi mirror

Google Sheets mirror hanya memuat rekening, transaksi, anggaran, kantong, recurring, target, dan rekonsiliasi dengan scope `shared`. Data personal tetap berada di Turso dan hanya diakses melalui API dengan authorization.


## Keputusan arsitektur

Keputusan dan trade-off canonical dicatat di `docs/adr/`. Perubahan guarded/lintas tim harus melalui RFC pada `docs/rfc/` sebelum ADR diperbarui.

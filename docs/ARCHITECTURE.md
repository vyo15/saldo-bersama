# Arsitektur Saldo Bersama

## Alur utama

```text
React/Vite
  -> Google Identity Services
  -> Firebase ID token
Vercel Functions
  -> verifikasi token, email_verified, allowlist, role
  -> HttpOnly signed session cookie
  -> HMAC + timestamp + nonce
Google Apps Script
  -> role check dari Users
  -> schema/maintenance guard
  -> LockService, idempotency, row_version, audit
Google Sheets
  -> ledger dan master data
Google Calendar / Drive
  -> integrasi non-blocking dan backup/recovery
```

Browser tidak pernah menulis langsung ke Sheets dan tidak dipercaya untuk actor, role, email, timestamp, audit field, scope, owner, atau saldo.

## Boundary source

- `frontend/src/domain` — helper domain murni, termasuk ownership UI.
- `frontend/src/services` — session, API, PWA/notification.
- `api` — internet-facing authentication, authorization, origin/rate/payload guard, dan gateway.
- `apps-script` — authorization kedua, business logic, data integrity, audit, migration, dan recovery.
- `docs` — kontrak operasional dan release gate.

Tidak ada demo storage atau service bisnis kedua.

## Ledger dan saldo

`Transactions` adalah ledger. Saldo rekening dihitung dari saldo awal dan transaksi aktif. Transfer tidak masuk total pemasukan/pengeluaran. Alokasi kantong bukan expense. Target menggunakan transfer yang terhubung ke goal movement.

## Model kepemilikan

Ownership canonical:

```text
shared                -> terlihat owner dan member
personal:<user_id>    -> terlihat pemilik dan owner administratif
```

Owner memiliki visibilitas administratif seluruh data untuk audit, backup, migration, dan recovery. Member hanya melihat shared serta personal miliknya sendiri. Filter diterapkan server-side pada rekening, transaksi, dashboard, laporan, envelope, recurring, budget, goal, notification, dan Calendar sync.

Transfer lintas ownership ditolak. Scope transaksi diturunkan dari rekening. Envelope, recurring payment, dan goal movement wajib satu ownership dengan rekening terkait. Calendar bersama hanya menerima item shared.

## Schema

Schema current adalah version 2. Version 2 menambahkan `scope` dan `owner_user_id` pada `Recurring_Rules`, `Budgets`, dan `Savings_Goals`. Spreadsheet baru dibuat langsung sebagai v2; data v1 memakai migration guarded.

## Atomicity dan fail-closed

Sheets tidak menyediakan transaction lintas banyak sheet/Drive/Calendar. Write majemuk memakai:

1. lock dan baca ulang state terbaru;
2. validasi referensi, ownership, saldo, periode, dan versi;
3. mutasi terarah;
4. audit state final;
5. compensation bila langkah berikutnya gagal;
6. `recovery_required` bila compensation gagal.

Restore/import/migration memakai safety backup dan hanya membuka maintenance setelah schema serta integrity check lulus. Timeout/hasil ambigu tidak boleh di-retry dengan idempotency key baru.

## Read performance

Apps Script menggunakan cache row request-scoped agar sheet yang sama tidak dibaca berulang dalam satu request. `ReadModel.gs` membangun index transaksi per rekening, periode, kategori, envelope, dan ID; saldo seluruh rekening, penggunaan envelope, budget, goal, dan ringkasan report memakai snapshot/index yang sama alih-alih memfilter seluruh ledger berulang kali. Cache diinvalidasi setelah append/update/delete. List transaksi difilter dan dipaginasi server-side serta mengembalikan total sebelum pagination.

Initial state tetap membaca source-of-truth Sheets pada request baru; tidak ada cache lintas pengguna yang dapat mencampur data owner/member. Log aman mencatat jumlah row yang discan, cache hit request-scoped, timing per sheet, dan timing tahap request tanpa payload finansial.

## Rate limiting

Rate limiting Vercel dan Apps Script bersifat best-effort. Security boundary utama tetap token verification, allowlist, HMAC, replay guard, payload limit, LockService, idempotency, dan quota platform.

## Read coordination dan initial state

Frontend menggunakan coordinator in-memory privat untuk read API. Coordinator mempunyai tiga tanggung jawab:

1. request identik yang masih berjalan memakai Promise yang sama;
2. hasil read berumur pendek dapat digunakan kembali selama sesi pengguna yang sama;
3. invalidasi dilakukan berdasarkan action setelah server mengonfirmasi write berhasil.

Cache tidak memakai `localStorage`, service worker, CDN, atau public response cache. Scope cache mengandung identitas sesi dan seluruh cache dibersihkan ketika sesi berubah atau logout. Abort satu komponen tidak boleh membatalkan request identik yang masih dipakai komponen lain.

Initial load memakai action `app.initialState`, yang mengembalikan bootstrap master data dan overview dari satu eksekusi Apps Script serta satu snapshot transaksi. `bootstrap.get` dan `dashboard.overview` tetap dipertahankan untuk refresh terarah dan kompatibilitas operasional. `bootstrap.get` **bukan** read yang boleh dikoaleskan karena pada login pertama action tersebut dapat mengikat Firebase UID melalui mutation lock; read-only `reconciliations.list` dapat dikoaleskan dan dicache privat per sesi.

Bootstrap hanya memuat master data aktif untuk input cepat. Halaman manajemen rekening/kategori tidak di-seed dari bootstrap agar daftar archived tidak tertutup oleh cache aktif-only; halaman tersebut selalu memakai action list canonical.

Setelah write:

- transaksi menginvalidasi ledger, envelope/report terkait, dan overview;
- perubahan rekening/kategori menginvalidasi master data dan initial state;
- write tidak pernah dilayani dari cache dan hasil UI tidak dianggap sukses sebelum respons server berhasil.

## Schema read guard

Read action yang allowlisted dapat menggunakan cache positif validasi schema selama maksimal 300 detik. Hanya hasil valid yang dicache. Hasil rusak, exception, recovery, restore, integrity, dan seluruh write tetap melalui jalur fail-closed yang sesuai. Cache schema diinvalidasi saat inisialisasi atau perubahan struktur terkontrol.

## Period closure dan histori

Closure bulanan bersifat household-global (`scope=shared`). Menutup suatu bulan mengunci seluruh transaksi pada bulan tersebut dan bulan sebelumnya karena saldo akhir bersifat kumulatif. Reopen wajib dilakukan dari closure paling akhir menuju bulan yang lebih lama. Laporan historis dan snapshot closure memakai cutoff akhir bulan, bukan saldo hari ini.

Snapshot closure mempunyai fingerprint atas total finansial, saldo per rekening, pengeluaran kategori, budget, envelope, recurring occurrence, dan progress goal. Integrity check membandingkan ulang state finansial tertutup serta tetap kompatibel dengan snapshot legacy yang belum memiliki dimensi baru. Ledger tetap mempertahankan transaksi `cancelled` untuk histori/audit, sedangkan saldo, report, budget, envelope, dan agregasi hanya memakai transaksi `active`. Integrity check juga menolak entity aktif yang masih bergantung pada rekening, kategori, atau envelope rule yang sudah diarsipkan.

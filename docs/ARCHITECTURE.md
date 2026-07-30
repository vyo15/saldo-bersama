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

Apps Script menggunakan cache row request-scoped agar sheet yang sama tidak dibaca berulang dalam satu request. Cache diinvalidasi setelah append/update/delete. List transaksi difilter dan dipaginasi server-side serta mengembalikan total sebelum pagination.

## Rate limiting

Rate limiting Vercel dan Apps Script bersifat best-effort. Security boundary utama tetap token verification, allowlist, HMAC, replay guard, payload limit, LockService, idempotency, dan quota platform.

# Arsitektur Saldo Bersama

## Ringkasan

Turso adalah satu-satunya **source of truth**. React tidak berkomunikasi langsung dengan Turso, Google Sheets, Calendar, atau Drive. Semua akses data melewati Vercel Functions yang memverifikasi session Firebase, role, ownership, payload, idempotency, dan versi row.

```text
PWA React/Vite
  -> Firebase Google Sign-In
  -> HttpOnly signed session
  -> Vercel Functions
  -> Turso Database
       -> integration_outbox
       -> Apps Script bridge
            -> Sheets mirror
            -> Calendar shared
            -> Drive backup
```

## Trust boundaries

1. Browser dianggap tidak tepercaya.
2. Firebase ID token diverifikasi server-side sebelum session dibuat.
3. `ALLOWED_USERS_JSON` adalah outer allowlist; tabel `users` adalah binding internal. Keduanya harus konsisten.
4. UID, role, email actor, timestamp, audit, scope internal, dan status tidak diterima dari client sebagai kebenaran.
5. Turso URL/token hanya berada di server environment.
6. Apps Script bridge hanya menerima request HMAC dengan timestamp dan nonce.

## Data flow write

1. Client membuat idempotency key.
2. Gateway memeriksa session, origin, rate limit, action, dan reserved fields.
3. Backend membaca actor canonical dari Turso.
4. Service melakukan validasi dan optimistic version check.
5. Perubahan utama, audit, idempotency response, dan outbox commit dalam transaction yang sama.
6. Response sukses baru dikirim setelah commit.
7. Worker memproses Sheets/Calendar/Drive secara terpisah. Kegagalan integrasi tidak membatalkan transaksi finansial.

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

## Concurrency

- Turso transaction digunakan untuk write atomik.
- Record yang dapat diedit membawa `row_version`.
- SQL update memakai `WHERE id=? AND row_version=?`.
- affected row nol menghasilkan HTTP 409.
- Retry hanya terbatas dan memakai idempotency key yang sama.
- Outbox memakai coalescing pending/failed dan dapat merebut kembali worker macet. Penyelesaian job wajib cocok dengan `locked_by` agar worker lama tidak menutup pekerjaan worker baru.
- Read multi-query penting (`app.initialState`, laporan, export, mirror, Calendar snapshot) memakai read transaction agar berasal dari snapshot database yang konsisten.
- `maintenance_mode` diperiksa sebelum dispatch dan dibaca ulang di dalam write transaction untuk menutup race dengan restore/import.

## Google integrations

Sheets adalah mirror satu arah dan dapat dibangun ulang. Calendar hanya menerima recurring item `shared`. Drive menyimpan backup teknis terkompresi dan ter-checksum. Apps Script tidak memiliki business logic finansial.

## PWA

Service worker hanya meng-cache app shell dan asset statis. `/api/*` tidak pernah dicache. Offline write ditolak agar tidak terjadi transaksi ganda atau status ambigu. Instalasi iOS dilakukan melalui Safari → Share → Add to Home Screen.


## Batas privasi mirror

Google Sheets mirror hanya memuat rekening, transaksi, anggaran, kantong, recurring, target, dan rekonsiliasi dengan scope `shared`. Data personal tetap berada di Turso dan hanya diakses melalui API dengan authorization.

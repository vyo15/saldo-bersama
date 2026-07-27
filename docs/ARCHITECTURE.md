# Arsitektur Saldo Bersama

## Alur utama

```text
React/Vite PWA di Vercel
  -> HttpOnly signed session cookie
Vercel Functions
  -> verifikasi Firebase ID token saat login
  -> allowlist dan role deny-by-default
  -> HMAC + timestamp + nonce
Google Apps Script
  -> role check dari sheet Users
  -> schema guard, LockService, idempotency, row_version, audit
Google Sheets
  -> ledger dan master data
Google Calendar / Drive
  -> pengingat dan backup
```

Browser tidak pernah menulis langsung ke Google Sheets. Firebase config dan VAPID public key boleh berada di frontend; secret hanya di Vercel Environment Variables atau Apps Script Properties.

## Sumber kebenaran

`Transactions` adalah ledger. Saldo berjalan, sisa kantong, penggunaan budget, dan progress laporan dihitung dari data aktif. Transfer internal tidak masuk pemasukan/pengeluaran total. Tabungan dan dana darurat menggunakan transfer + target, bukan expense palsu.

## Boundary

- `frontend/src/domain`: perhitungan dan validasi tanpa UI.
- `frontend/src/services`: session/API, demo development, PWA.
- `api`: internet-facing guard dan forwarder.
- `apps-script`: business logic dan storage guard.
- `docs`: setup, schema, QA, dan SOP.

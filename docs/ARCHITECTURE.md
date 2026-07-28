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

## Atomicity, compensation, dan fail-closed

Google Sheets tidak menyediakan transaction lintas beberapa sheet, Calendar, dan Drive. Karena itu write majemuk memakai pola berikut:

1. `LockService` dan baca ulang data terbaru;
2. validasi referensi, saldo, periode, dan `row_version`;
3. mutasi terarah;
4. satu audit sukses untuk state final;
5. compensation bila langkah berikutnya gagal;
6. `recovery_required` bila compensation juga gagal.

Pembayaran recurring dan mutasi target membuat transaksi ledger tanpa audit sukses prematur. Audit final baru ditulis setelah occurrence/movement terkait berhasil. Transaksi linked tidak dapat diedit atau dibatalkan dari ledger umum; koreksi dilakukan melalui action reverse modul asal.

Restore/import mengikat preview ke checksum SHA-256 canonical. Maintenance baru dibuka setelah apply atau rollback lolos schema, checksum, dan integrity check. Ketika schema aktif rusak, restore memakai actor owner bertanda tangan dan idempotency Script Properties agar tidak bergantung pada sheet `Users`/`Idempotency` yang rusak.

## Idempotency

Key diikat ke action, actor, payload canonical, dan `row_version`. Record kedaluwarsa dibersihkan. Kegagalan menyimpan hasil setelah mutasi mengunci aplikasi untuk mencegah retry dengan key baru.

## Rate limiting

`Map` pada Vercel hanya best-effort per warm instance dan bukan security boundary global. Backstop utama adalah HMAC, nonce/timestamp, Apps Script Cache rate guard, LockService, idempotency, payload limit, dan kuota Google. Rate limit global membutuhkan shared storage tambahan dan belum menjadi dependency project.

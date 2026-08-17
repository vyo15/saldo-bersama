# RFC-0017 Manual Reminders

**Status:** Accepted and implemented  
**Owner:** Product owner + security owner  
**Reviewers:** Backend, frontend, QA  
**Date:** 2026-08-17

## Problem

Saldo Bersama sudah mempunyai tujuh smart alert otomatis, preference per pengguna, notification queue, delivery per perangkat, scheduler, dan Web Push. Pengguna juga membutuhkan pengingat yang mereka atur sendiri pada objek keuangan tertentu tanpa membuat sistem reminder umum yang terpisah dari domain finansial.

Pengingat tidak boleh hanya disimpan di browser karena harus sinkron antarperangkat, actor-scoped, dapat diaudit, idempotent, dan tetap diverifikasi backend saat waktunya tiba.

## Decision

Runtime memakai pengingat manual **one-shot** yang terikat pada objek canonical berikut:

- `recurring_occurrence`
- `budget`
- `envelope_period`
- `goal`

Transaksi, rekening, kategori, dan laporan tidak mendapat reminder manual generik. Transaksi adalah ledger kejadian yang sudah terjadi, sedangkan rekening lebih tepat memakai alert kondisi seperti saldo rendah bila fitur tersebut disetujui terpisah.

Satu pengguna hanya boleh mempunyai satu reminder berstatus `scheduled` untuk kombinasi `user_id + entity_type + entity_id`.

Action canonical:

```text
reminders.get
reminders.upsert
reminders.cancel
```

`reminders.upsert` menerima waktu lokal Asia/Jakarta dengan format `YYYY-MM-DDTHH:mm`. Backend memvalidasi waktu future, maksimal 366 hari, lalu menyimpan UTC `scheduled_at`.

## Data model

Migration `database/migrations/008_manual_reminders.sql` menambah schema v10:

```text
manual_reminders
- reminder_id
- user_id
- entity_type
- entity_id
- scheduled_at
- status: scheduled|queued|cancelled
- row_version
- created_at
- updated_at
```

Migration bersifat additive dan tidak mengubah transaksi, saldo, rekening, anggaran existing, target existing, atau ownership ledger.

## Authorization dan integrity

- `user_id` selalu berasal dari actor terverifikasi, bukan payload client.
- Backend membaca ulang linked entity dan memeriksa ownership, scope, serta assignee sebelum create/update dan sebelum dispatch.
- Member tidak dapat membuat reminder pada personal entity milik pengguna lain atau kantong yang ditugaskan kepada pengguna lain.
- Update dan cancel memakai `row_version`; stale edit ditolak sebagai conflict.
- Mutation memakai idempotency key dan audit append-only.
- Entity yang hilang, archived, selesai, cancelled, atau tidak lagi dapat diakses dibatalkan fail-closed saat scheduler memprosesnya.
- Reminder tidak pernah mengubah ledger, saldo, status pembayaran, anggaran, atau progress target.

## Scheduler dan Web Push

Scheduler mencari reminder due secara bounded, mengklaim row secara atomik, membaca ulang entity terbaru, lalu memasukkan notification ke pipeline existing dengan dedupe key:

```text
manual-reminder:<reminder_id>
```

Pengingat manual tidak menggantikan tujuh smart alert otomatis.

Mode notifikasi produk yang disetujui adalah **detail**. Untuk queue normal, `title` dan `body` dibuat serta disanitasi backend dari data entity terbaru dan dapat memuat nama objek, rekening, atau nominal relevan. Client tidak boleh mengirim title/body sebagai sumber kebenaran. Detail dapat terlihat pada lock screen, sehingga real-device QA wajib memeriksa privacy behavior Android/iOS/desktop. `notifications.test` tetap generik.

## UI

Shortcut manual reminder tersedia pada:

- Anggaran periode aktif
- Kantong/Alokasi aktif
- occurrence Jadwal Rutin yang belum selesai atau dibatalkan
- Target aktif

Dialog memakai tanggal dan waktu, menampilkan status reminder existing, mendukung perubahan jadwal, dan soft cancel. Zona waktu ditampilkan sebagai Asia/Jakarta.

## Backup, restore, dan reset

- Backup schema v10 menyertakan `manual_reminders`.
- Runtime v10 tetap menerima backup schema v3-v9; reminder dianggap kosong pada backup lama.
- Reset testing/full reset mengikuti scope maintenance canonical dan tidak boleh menghapus subscription/preference yang memang dipertahankan oleh kontrak reset.
- Rollback schema dilakukan melalui verified backup dan restore ke database terpisah, bukan `DROP TABLE` langsung pada production.

## Acceptance criteria

- create/update/cancel actor-scoped;
- IDOR linked entity ditolak;
- stale `row_version` ditolak;
- same idempotency key tidak menggandakan reminder;
- satu scheduled reminder per user dan entity;
- waktu Asia/Jakarta konsisten dan maksimal 366 hari;
- scheduler tidak menggandakan dispatch;
- entity invalid saat dispatch dibatalkan dan diaudit;
- automatic alert tetap berjalan;
- backup/restore compatibility v3-v10;
- detail Push hanya berasal dari backend;
- Android/iOS/desktop manual smoke sebelum dinyatakan production-verified;
- keyboard, focus, modal, dan tap target tetap aksesibel.

## Risks

- Detail notifikasi dapat terlihat pada lock screen perangkat.
- Backlog scheduler dapat menunda waktu kirim.
- Perubahan entity setelah reminder dibuat dapat membuat copy berubah saat dispatch karena server membaca data terbaru.
- Real-device presentation tetap dikontrol browser dan sistem operasi.

## Links

- `../API_CONTRACT.md`
- `../IMPLEMENTATION_MATRIX.md`
- `../SECURITY_MODEL.md`
- `../TEST_PLAN.md`
- `../TURSO_SCHEMA.md`
- `../../api/_lib/services/reminders.js`
- `../../api/_lib/services/notifications.js`
- `../../api/jobs.js`

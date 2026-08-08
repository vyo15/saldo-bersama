# Google Integrations

## Peran Apps Script

Folder `apps-script/` hanya integration bridge. Ia tidak menyimpan saldo resmi, tidak menerima create/update transaksi, dan tidak memutuskan role pengguna.

Action yang diizinkan:

- `mirror.rebuild`
- `calendar.rebuild`
- `backup.store`
- `backup.read`
- `integration.health`

Semua request memakai HMAC SHA-256, timestamp window, dan nonce replay guard. Request scheduler ke Vercel juga dicatat pada `request_nonces` agar nonce tidak hanya bergantung pada cache Apps Script.

## Environment terpusat

Google bridge tidak dikonfigurasi per laptop/browser. Nilai `GOOGLE_BRIDGE_WEB_APP_URL`, `GOOGLE_BRIDGE_SHARED_SECRET`, dan `JOBS_SHARED_SECRET` disimpan sebagai satu grup pada Vercel Development/Production yang disetujui. Bila grup sudah tersedia pada `.env.local` komputer tepercaya, sinkronkan settings tanpa menyentuh core environment:

```bash
npm run env:push:development:settings
```

`npm run dev` kemudian menarik Development terbaru pada setiap start interaktif. Jika bridge belum diaktifkan secara pusat, halaman Integrasi Google tetap menampilkan status belum siap, sedangkan fitur Turso lain tetap dapat berjalan.

## Readiness dan health check

`integrations.status` tidak lagi menganggap provider siap hanya karena `GOOGLE_BRIDGE_WEB_APP_URL` dan `GOOGLE_BRIDGE_SHARED_SECRET` tersedia. Saat halaman Integrasi Google dibuka, backend memanggil action signed `integration.health` dengan timeout terbatas dan hanya mengembalikan boolean readiness serta timestamp aman. Secret, resource ID, endpoint internal, dan payload finansial tidak dikembalikan ke browser.

Kriteria readiness:

- **Sheets**: bridge dapat dijangkau, `MIRROR_SPREADSHEET_ID` tersedia, konfigurasi scheduled jobs lengkap, dan tepat satu trigger `runScheduledJobs` aktif.
- **Calendar**: bridge dapat dijangkau, `GOOGLE_CALENDAR_ID` tersedia, konfigurasi scheduled jobs lengkap, dan tepat satu trigger `runScheduledJobs` aktif.
- **Drive**: bridge dapat dijangkau dan `BACKUP_FOLDER_ID` tersedia. Trigger tidak menjadi syarat untuk backup manual, tetapi tetap wajib untuk backup terjadwal.

Jika health check gagal, UI harus menampilkan belum siap/gangguan dan tidak menjalankan sinkronisasi. Queue tetap dibedakan menjadi `pending`, `processing`, `failed`, `dead_letter`, dan `completed`; `failed` tidak boleh ditampilkan sebagai sekadar antrean. `lastCompletedAt` adalah waktu sukses terakhir dan tidak boleh diganti oleh timestamp kegagalan terbaru.

## Google Sheets mirror

- Sinkronisasi hanya `Turso -> Sheets`.
- Spreadsheet mirror harus baru, terpisah dari spreadsheet database lama.
- Bagikan hanya kepada dua akun sebagai viewer; editor hanya akun pemilik bridge bila diperlukan.
- Manual edit dapat tertimpa saat reconcile dan tidak pernah diimpor kembali.
- Mirror tidak memuat Firebase UID, token, push endpoint/key, idempotency response, raw audit payload, atau secret.
- Formula-like input dinetralkan sebelum ditulis.

Tab publik: Ringkasan, Transaksi, Rekening, Anggaran, Kantong, Tagihan, Target, Rekonsiliasi.

## Google Calendar

- Hanya recurring item dengan scope `shared`.
- Stable entity ID digunakan untuk mencegah event ganda.
- Detail event dibuat minimal dan tidak memuat saldo/rekening sensitif.
- Kegagalan Calendar masuk outbox retry/dead-letter tanpa membatalkan write Turso.

## Google Drive backup

Backup teknis berupa JSON terkompresi dengan manifest, schema version, row counts, dan checksum. Nama unik dan tidak overwrite. Excel tidak digunakan untuk restore.

## Script Properties

Enam nilai berikut disimpan di Apps Script Properties. `MIRROR_SPREADSHEET_ID`, `GOOGLE_CALENDAR_ID`, `BACKUP_FOLDER_ID`, dan `JOBS_ENDPOINT_URL` hanya boleh berada di Apps Script Properties. `GOOGLE_BRIDGE_SHARED_SECRET` dan `JOBS_SHARED_SECRET` juga harus tersedia di Vercel dengan nilai yang sama untuk autentikasi server-to-server.


```text
GOOGLE_BRIDGE_SHARED_SECRET
MIRROR_SPREADSHEET_ID
GOOGLE_CALENDAR_ID
BACKUP_FOLDER_ID
JOBS_ENDPOINT_URL
JOBS_SHARED_SECRET
```

Jangan menaruh token Turso atau Firebase private credential pada Apps Script.


## Privasi mirror

Mirror bersifat **shared-only**. Data dengan scope `personal`, rekening personal, push subscription, idempotency, serta audit internal tidak dikirim ke spreadsheet. Full rebuild tetap mengikuti filter ini.


## Deployment Web App

Gunakan **Execute as: user deploying** dan **Who has access: anyone/anonymous** untuk panggilan server-to-server dari Vercel. Akses anonim tidak memberi akses finansial langsung: bridge hanya menerima action allowlist yang memiliki HMAC, timestamp, dan nonce valid.

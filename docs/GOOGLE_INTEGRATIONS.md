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

Enam nilai berikut hanya disimpan di Apps Script Properties. Jangan menduplikasi ID resource atau `JOBS_ENDPOINT_URL` di Vercel.


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

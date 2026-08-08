# Google Integrations

## Concurrency dan self-healing Calendar

- `CalendarService.gs` memakai `LockService` agar dua scheduler/sync tidak membangun event managed secara bersamaan.
- Event Saldo Bersama menggunakan stable `entityId`. Jika histori lama sudah memiliki lebih dari satu managed event untuk entity yang sama, sync memilih satu event canonical dan menghapus duplikat managed; event pengguna yang tidak memiliki marker Saldo Bersama tidak disentuh.
- Calendar tetap bukan source of truth pembayaran. Status `paid` berasal dari recurring occurrence/ledger Turso dan sinkronisasi hanya merefleksikannya.

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

`npm run dev` kemudian menarik Development terbaru pada setiap start interaktif. Resource ID Google tetap berada satu kali di Apps Script Properties pada project bridge Production; laptop/PC lain tidak perlu mengisi Spreadsheet/Calendar/Drive ID atau secret secara manual. Jika bridge belum diaktifkan secara pusat, halaman Integrasi Google tetap menampilkan status belum siap, sedangkan fitur Turso lain tetap dapat berjalan.

## Readiness dan health check

`integrations.status` tidak lagi menganggap provider siap hanya karena `GOOGLE_BRIDGE_WEB_APP_URL` dan `GOOGLE_BRIDGE_SHARED_SECRET` tersedia. Saat halaman Integrasi Google dibuka, backend memanggil action signed `integration.health` dengan timeout terbatas dan hanya mengembalikan boolean readiness serta timestamp aman. Secret, resource ID, endpoint internal, dan payload finansial tidak dikembalikan ke browser.

Kriteria readiness:

- **Sheets**: bridge dapat dijangkau, Spreadsheet target benar-benar dapat dibuka oleh akun Apps Script, target merupakan mirror Saldo Bersama yang sudah memiliki metadata canonical atau spreadsheet baru yang benar-benar kosong, konfigurasi scheduled jobs valid, dan tepat satu trigger `runScheduledJobs` aktif.
- **Calendar**: bridge dapat dijangkau, Calendar target benar-benar dapat diakses oleh akun Apps Script, konfigurasi scheduled jobs valid, dan tepat satu trigger `runScheduledJobs` aktif.
- **Drive**: bridge dapat dijangkau dan folder backup benar-benar dapat diakses oleh akun Apps Script. Trigger tidak menjadi syarat untuk backup manual, tetapi tetap wajib untuk backup terjadwal.
- **Jobs**: `JOBS_ENDPOINT_URL` harus berupa HTTPS URL valid dan `JOBS_SHARED_SECRET` minimal 32 karakter; property yang hanya terisi tetapi malformed tidak dianggap siap.

Health check bersifat read-only terhadap resource Google. Jika health check gagal, UI harus menampilkan belum siap/gangguan dan tidak menjalankan sinkronisasi. Secret, resource ID, endpoint internal, dan payload finansial tetap tidak dikembalikan ke browser.

Queue tetap dibedakan menjadi `pending`, `processing`, `failed`, `dead_letter`, dan `completed`. Untuk Sheets/Calendar, successful full snapshot `system:sync`/`system:rebuild` menyupersede kegagalan lama yang terjadi sebelum snapshot tersebut: row historis tetap tersimpan di `integration_outbox`, tetapi tidak lagi dihitung sebagai `failed`/`dead_letter` aktif. Kegagalan yang lebih baru dari full snapshot terakhir tetap tampil sebagai masalah aktif. `lastCompletedAt` selalu berasal dari `completed_at`.

## Google Sheets mirror

- Sinkronisasi hanya `Turso -> Sheets`.
- Spreadsheet mirror harus baru, terpisah dari spreadsheet database lama.
- Bridge hanya mengadopsi target yang benar-benar kosong atau target yang sudah memiliki `_Mirror_Metadata` canonical (`source_of_truth=Turso`, `mode=read-only mirror`). Spreadsheet non-kosong tanpa marker ditolak dengan `MIRROR_TARGET_UNSAFE`.
- Metadata canonical ditulis sebelum tab data pada adopsi pertama agar retry tetap aman bila sinkronisasi terputus di tengah proses.
- `Sheet1` default hanya dihapus setelah sinkronisasi berhasil dan hanya bila benar-benar kosong; custom sheet/non-kosong tidak dihapus.
- Bagikan hanya kepada dua akun sebagai viewer; editor hanya akun pemilik bridge bila diperlukan.
- Manual edit dapat tertimpa saat reconcile dan tidak pernah diimpor kembali.
- Mirror tidak memuat Firebase UID, token, push endpoint/key, idempotency response, raw audit payload, atau secret.
- Formula-like input dinetralkan sebelum ditulis.

Tab mirror canonical: Ringkasan, Transaksi, Rekening, Kategori, Anggaran, Kantong, Tagihan, Target, Rekonsiliasi.

## Google Calendar

- Hanya recurring item dengan scope `shared`.
- Stable entity ID digunakan untuk mencegah event ganda.
- Detail event dibuat minimal dan tidak memuat saldo/rekening sensitif.
- Kegagalan Calendar masuk outbox retry/dead-letter tanpa membatalkan write Turso.

## Google Drive backup

Backup teknis berupa JSON terkompresi dengan manifest, schema version, row counts, dan checksum. Nama canonical adalah `saldo-bersama-backup-v<schema>-YYYYMMDDTHHMMSSZ-<8hex>.json.gz`; validator bridge harus version-aware dan tidak boleh hardcode versi schema lama. Nama unik tidak overwrite; nama sama dengan checksum/backup ID berbeda ditolak. Excel tidak digunakan untuk restore.

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

Source canonical tetap berada di repository `apps-script/`. Untuk sinkronisasi via `clasp`, gunakan working directory di luar repository agar `.clasp.json` tidak pernah masuk Git/clean ZIP. Setelah `clasp push`, verifikasi file tracked hanya enam `.gs` canonical dan `appsscript.json`.

**Penting:** `clasp push` hanya memperbarui source project Apps Script. Web App yang sudah dideploy memakai versi deployment tersendiri. Setelah perubahan source bridge:

1. Buka **Deploy -> Manage deployments**.
2. Pilih deployment Web App existing yang URL `/exec`-nya sama dengan `GOOGLE_BRIDGE_WEB_APP_URL`.
3. **Edit -> Version: New version -> Deploy**.
4. Pertahankan URL `/exec` existing; bila URL berubah, Vercel harus diperbarui dan redeploy Production dilakukan sebelum scheduler diaktifkan.
5. Uji signed `integration.health`, lalu uji `/api/jobs` hingga HTTP 200 sebelum memasang/menjaga trigger scheduler.

Jangan menganggap source yang sudah ter-push otomatis aktif pada deployment `/exec`.

## Verifikasi resource nyata

Readiness health adalah guard konfigurasi, bukan bukti isi resource. Sebelum menyatakan integrasi selesai end-to-end:

- Spreadsheet: pastikan seluruh tab canonical terbentuk, data bersifat shared-only/read-only mirror, dan queue mencapai `completed` tanpa `failed`/`dead_letter`.
- Calendar: pastikan hanya recurring `shared`, tidak ada event personal, dan stable entity ID tidak menghasilkan duplikasi.
- Drive: pastikan file backup canonical versioned benar-benar ada dan backup run server berstatus verified.
- Scheduler: pastikan tepat satu trigger `runScheduledJobs` aktif dan panggilan Production `/api/jobs` lolos HMAC.

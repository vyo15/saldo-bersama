# Observability dan troubleshooting

Tujuan observability adalah menemukan root cause tanpa mencetak token, secret, cookie, identitas lengkap, payload transaksi, nominal, deskripsi, merchant, subscription, atau data keuangan lain.

## Request reference

Setiap request API mempunyai `X-Request-ID`. Nilai yang sama diteruskan ke Apps Script sebagai `requestId`, dicatat pada log API dan Apps Script, serta ditampilkan UI sebagai **Referensi** saat terjadi error.

Gunakan referensi ini untuk mencari satu alur request tanpa membagikan `.env.local`, screenshot Script Properties, token Firebase, atau payload transaksi.

## Structured log API

Log API berbentuk satu JSON per baris, misalnya:

```json
{"timestamp":"2026-07-31T06:00:00.000Z","level":"info","service":"saldo-bersama-api","event":"gateway.request.completed","requestId":"...","action":"bootstrap.get","status":200,"durationMs":842}
```

Field penting:

- `event` — tahap request.
- `requestId` — korelasi API ↔ Apps Script ↔ UI.
- `action` — contract action, tanpa payload.
- `status` dan `code` — hasil terkontrol.
- `durationMs` — waktu proses.
- `attempt` — nomor percobaan konektor.
- `skewMs` — selisih waktu Apps Script terhadap request.

Logger melakukan redaction defense-in-depth. Jangan menambahkan payload bisnis ke field log baru.

## Log Apps Script

Buka **Apps Script → Executions**, pilih eksekusi, lalu cari `requestId`. Event yang tersedia antara lain:

- `request.started`
- `request.completed`
- `request.failed`
- `request.rejected.clock_skew`

Apps Script hanya mencatat metadata aman: request ID, action, role, status, code, durasi, dan clock skew.

## Clock calibration

Replay guard tetap memakai toleransi 120 detik. Jika request bertanda tangan valid ditolak sebagai `REQUEST_EXPIRED`, Apps Script mengembalikan detail waktu aman. API boleh mengkalibrasi offset dan retry **tepat satu kali** dengan:

- request ID yang sama;
- action/payload/idempotency key yang sama;
- nonce dan signature baru;
- tanpa menjalankan mutasi pada percobaan pertama karena penolakan terjadi sebelum nonce disimpan dan sebelum route dipanggil.

Kalibrasi dibatasi maksimal 24 jam dan berlaku 15 menit. NTP Windows tetap harus diperbaiki; kalibrasi bukan pengganti waktu sistem yang sehat.

## Perintah diagnosis

```bash
npm run diagnose
```

Perintah ini aman untuk dibagikan selama output tidak diubah agar menampilkan nilai environment. Output mencakup:

- variable `set`/`MISSING`;
- validitas URL `/exec`;
- HTTP GET Apps Script;
- service/status/schema version;
- latency;
- `Google - PC` clock skew.

## Health endpoint

```text
/api/health
```

Health menampilkan:

- status konfigurasi URL dan shared secret;
- status clock calibration runtime;
- hasil panggilan konektor terakhir;
- Node runtime, environment, commit SHA, deployment ID, dan region.

Endpoint ini tidak menyatakan data bisnis sehat dan tidak mengembalikan secret.

## Lokasi log

### Lokal

Terminal `npm run dev`. Filter berdasarkan request ID:

```bash
npm run dev 2>&1 | tee dev.log
```

`dev.log` adalah file lokal sementara dan tidak boleh di-commit atau dikirim bila belum diperiksa. Validator source mengabaikan file `.log`.

### Vercel

Buka **Project → Logs**, lalu cari `requestId`, `event`, atau `code`. Pastikan deployment yang dibuka memiliki commit SHA sesuai `/api/health`.

### Apps Script

Buka **Executions**, pilih eksekusi yang waktunya sesuai, lalu cari `requestId` yang ditampilkan UI/Vercel.

## Error penting

- `UNAUTHENTICATED` — cookie sesi tidak ada/invalid.
- `CONNECTOR_NOT_CONFIGURED` — URL `/exec` atau secret belum tersedia pada environment deployment aktif.
- `CONNECTOR_AUTH_FAILED` — shared secret API berbeda dari Script Properties.
- `CONNECTOR_REQUEST_EXPIRED` — clock calibration gagal/tidak aman atau retry tetap ditolak.
- `UPSTREAM_TIMEOUT` — hasil write mungkin belum diketahui; retry wajib memakai idempotency key yang sama.

Jangan menambah stack trace, path internal, token, secret, atau payload bisnis ke respons browser.

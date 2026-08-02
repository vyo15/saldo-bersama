# Log Event Catalog

`docs/OBSERVABILITY.md` menetapkan prinsip. Nama event harus konsisten dan tidak menyimpan payload finansial.

## Field minimum

`timestamp`, `level`, `service`, `event`, `environment`, `requestId`, `action/route`, `status`, `durationMs`, `code`, build/deployment metadata yang aman.

## Field terlarang

Token, cookie, secret, email mentah, UID publik, nominal, deskripsi transaksi, request payload, SQL args, push credential, backup body, stack trace ke client, internal path.

## Event aktif/expected

| Event | Level | Pemilik | Alert |
|---|---|---|---|
| `gateway.request.completed` | info | Backend | latency/error trend |
| `gateway.request.failed` | warn/error | Backend | repeated 5xx/4xx security |
| `session.request.completed` | info | Auth | login failure spike |
| `export.request.completed` | info | Backend | owner export failure |
| `jobs.request.completed` | info | Operations | scheduler failure |
| `local.server.started` | info | Development | none |
| `local.api.unhandled` | error | Development | investigate |
| `database.*.failed` | error | Backend | immediate |
| `integration.*.failed` | warn/error | Integration | dead-letter |
| `backup.*.failed` | error | Operations | immediate |
| `integrity.*.failed` | error | Operations | immediate/maintenance |
| `restore.*.failed` | error | Operations | SEV assessment |

Setiap endpoint idealnya menghasilkan tepat satu terminal event. Event baru harus ditambah di sini beserta runbook/owner.

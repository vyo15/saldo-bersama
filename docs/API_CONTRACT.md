# API Contract

## Endpoint canonical

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/session` | GET/POST | Membaca sesi, login Firebase ID token, logout. |
| `/api/gateway` | POST | Seluruh action bisnis. |
| `/api/export` | POST | XLSX owner-only. |
| `/api/health` | GET | Health teredaksi. |
| `/api/jobs` | POST | Worker terjadwal dengan signature. |

Frontend tidak boleh mengakses Turso atau Google bridge secara langsung.

## Gateway envelope

Request:

```json
{
  "action": "transactions.create",
  "payload": {},
  "idempotencyKey": "required-for-write-when-listed",
  "rowVersion": 1
}
```

Header:

```text
Content-Type: application/json
X-Request-ID: random client correlation ID
Cookie: signed HttpOnly session
Origin: allowlisted origin
```

Success:

```json
{ "ok": true, "data": {} }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Pesan aman",
    "status": 409,
    "details": { "requestId": "..." }
  }
}
```

Server tidak menerima actor, role, UID, audit field, scope internal, timestamps, status, atau ownership dari client sebagai kebenaran.

## Action catalog

Permission canonical tetap `api/_lib/security.js`. Handler canonical tetap `api/_lib/actionDispatcher.js` dan service terkait.

| Action | Owner | Member | Mode | Idempotency | Source utama |
|---|---:|---:|---|---|---|
| `system.health` | Ya | Ya | Read | Tidak | `api/_lib/actionDispatcher.js` |
| `app.initialState` | Ya | Ya | Read | Tidak | `api/_lib/services/reports.js` |
| `bootstrap.get` | Ya | Ya | Read | Tidak | `api/_lib/services/reports.js` |
| `users.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/users.js` |
| `users.upsert` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `users.deactivate` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/users.js` |
| `audit.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/audit.js` |
| `dashboard.overview` | Ya | Ya | Read | Tidak | `api/_lib/services/reports.js` |
| `accounts.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData.js` |
| `accounts.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `accounts.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.list` | Ya | Ya | Read | Tidak | `api/_lib/services/masterData.js` |
| `categories.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `categories.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/masterData.js` |
| `transactions.list` | Ya | Ya | Read | Tidak | `api/_lib/services/finance.js` |
| `transactions.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.update` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `transactions.cancel` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/finance.js` |
| `envelopes.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning.js` |
| `envelopes.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `envelopes.move` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `envelopes.close` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `recurring.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning.js` |
| `recurring.createRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `recurring.updateRule` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `recurring.payOccurrence` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `recurring.reversePayment` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `budgets.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning.js` |
| `budgets.upsert` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `budgets.archive` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `goals.list` | Ya | Ya | Read | Tidak | `api/_lib/services/planning.js` |
| `goals.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `goals.update` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `goals.move` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `goals.reverseMovement` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/planning.js` |
| `reports.monthly` | Ya | Ya | Read | Tidak | `api/_lib/services/reports.js` |
| `reconciliations.list` | Ya | Ya | Read | Tidak | `api/_lib/services/reports.js` |
| `reconciliations.create` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/reports.js` |
| `periods.list` | Ya | Tidak | Read | Tidak | `api/_lib/services/reports.js` |
| `periods.close` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/reports.js` |
| `periods.reopen` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/reports.js` |
| `calendar.sync` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/integrations.js` / dispatcher |
| `mirror.sync` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/integrations.js` / dispatcher |
| `mirror.rebuild` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/integrations.js` / dispatcher |
| `integrations.status` | Ya | Ya | Read | Tidak | `api/_lib/services/integrations.js` / dispatcher |
| `notifications.register` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `notifications.unregister` | Ya | Ya | Write/operation | Wajib | `api/_lib/services/notifications.js` |
| `backup.create` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance.js` |
| `import.preview` | Ya | Tidak | Preview | Tidak | `api/_lib/services/maintenance.js` |
| `import.apply` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance.js` |
| `restore.preview` | Ya | Tidak | Preview | Tidak | `api/_lib/services/maintenance.js` |
| `restore.apply` | Ya | Tidak | Write/operation | Wajib | `api/_lib/services/maintenance.js` |
| `integrity.run` | Ya | Tidak | Write/operation | Tidak | `api/_lib/services/maintenance.js` |

## Version/conflict

`rowVersion` atau `payload.row_version` wajib untuk update/cancel/reverse yang memodifikasi record versionable. Mismatch menghasilkan HTTP 409; client wajib reload dan tidak boleh overwrite diam-diam.

## Compatibility

Perubahan action name, request/response shape, error code, permission, idempotency, ownership, atau side effect memerlukan RFC, contract/test update, dan release note. Payload detail paling akurat berada pada validator di service source sampai JSON Schema per action tersedia.

# Security Model

## Trust boundary

Browser, payload, URL, local storage, dan frontend state tidak tepercaya. Vercel Functions memverifikasi session, origin, rate limit, action, payload reserved field, role, ownership, idempotency, dan version. Turso hanya diakses backend.

## Identity

- Firebase Google ID token diverifikasi saat login.
- Backend membuat signed HttpOnly `SameSite=Strict` session.
- Allowlist email+role dan binding user Turso harus konsisten.
- Authorization default deny.
- Apps Script bridge memakai HMAC, timestamp, nonce, dan action allowlist.
- Jobs memakai signature terpisah.

## Secret classes

Server-only: `SESSION_SECRET`, `TURSO_AUTH_TOKEN`, `GOOGLE_BRIDGE_SHARED_SECRET`, `JOBS_SHARED_SECRET`, `VAPID_PRIVATE_KEY`.  
Public client config: key berprefix `VITE_*`; tidak boleh dianggap secret.

Secret tidak boleh masuk source, frontend bundle, log, issue, screenshot, export, atau ZIP. Rotasi harus menilai session invalidation, bridge dual-side update, scheduler, dan redeploy.

## Data protection

- Data finansial privat; minimalkan log dan export.
- Audit bukan tempat token/payload mentah.
- Sheets hanya mirror shared.
- Backup/restore membutuhkan checksum, preview, safety backup, maintenance, integrity, dan audit.
- Formula-like text dinetralisasi untuk export/import spreadsheet.

## Security review trigger

Wajib untuk perubahan auth, role, permission, ownership, schema, transaction, import/export, backup/restore, integration, dependency, log, atau deployment.

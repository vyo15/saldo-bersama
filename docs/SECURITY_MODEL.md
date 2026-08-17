# Security Model

## Trust boundary

Browser, payload, URL, local storage, dan frontend state tidak tepercaya. Vercel Functions memverifikasi session, origin, rate limit, action, payload reserved field, role, ownership, idempotency, dan version. Turso hanya diakses backend.

## Identity

- Firebase Google ID token diverifikasi saat login. Localhost/device emulation dapat mengirim Firebase ID token dari browser; production desktop/mobile memakai Google OAuth Authorization Code callback server, memverifikasi signed `state`/`nonce`, menukar Google ID token melalui Firebase Identity Toolkit, lalu menjalankan verifier Firebase yang sama.
- Backend membuat signed HttpOnly `SameSite=Strict` session.
- Allowlist email+role dan binding user Turso harus konsisten.
- Authorization default deny.
- Apps Script bridge memakai HMAC, timestamp, nonce, dan action allowlist.
- Jobs memakai signature terpisah.

## Request hardening

- Rate-limit key yang berasal dari alamat client atau authenticated identity memakai SHA-256 dan scope prefix; raw UID/alamat tidak menjadi bucket key. Session memakai `clientRateLimitKey()` dan `identityRateLimitKey()`, sedangkan gateway dan export memakai `identityRateLimitKey()` dari `api/_lib/security.js`.
- Rate limiter saat ini bersifat best-effort dan process-local. Distributed throttling/global quota lintas instance bukan jaminan dari control ini.
- Exact reserved transaction-field contract berada di `api/_lib/transactionContract.js` dan ditegakkan kembali pada gateway serta finance service.

## Secret classes

Server-only: `SESSION_SECRET`, `TURSO_AUTH_TOKEN`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_BRIDGE_SHARED_SECRET`, `JOBS_SHARED_SECRET`, `VAPID_PRIVATE_KEY`.
Public client config: key berprefix `VITE_*`; tidak boleh dianggap secret.

Secret tidak boleh masuk source, frontend bundle, log, issue, screenshot, export, atau ZIP. Rotasi harus menilai session invalidation, bridge dual-side update, scheduler, dan redeploy.

## Data protection

- Data finansial privat untuk dua pengguna terotorisasi. Baseline produk bersifat transparan untuk rekening dan ledger pasangan, tetapi authorization write tetap berdasarkan role, account ownership, creator, dan capability backend.
- Nomor rekening dapat dibaca kedua pengguna di aplikasi, tetapi tidak boleh masuk log, audit mentah, URL, metadata, Sheets mirror, atau export baca; audit hanya menyimpan bentuk bertopeng.
- Data finansial privat; minimalkan log dan export.
- Audit bukan tempat token/payload mentah.
- Sheets hanya mirror shared.
- Backup/restore membutuhkan checksum, preview, safety backup, maintenance, integrity, dan audit.
- Formula-like text dinetralisasi untuk export/import spreadsheet.

## Security review trigger

Wajib untuk perubahan auth, role, permission, ownership, schema, transaction, import/export, backup/restore, integration, dependency, log, atau deployment.

## Destructive-action protection

- Data finansial yang pernah dipakai memakai cancel, archive, reverse, atau deactivate; bukan hard delete.
- `accounts.deleteUnused` adalah pengecualian sempit, bukan generic purge. Backend menghitung saldo dan seluruh dependency, memeriksa semua status transaksi, `row_version`, idempotency, acknowledgement, alasan, dan frasa konfirmasi di dalam transaction.
- Preview dari client tidak dipercaya saat apply; service membaca ulang data terbaru sebelum commit.
- Transaksi cancelled hanya dapat dipulihkan owner bila periode terbuka, referensi aktif, balance guard, dan duplicate guard lulus.
- Rekening/kategori arsip serta anggota nonaktif dipulihkan melalui action eksplisit yang diaudit.
- Audit append-only tetap dipertahankan ketika rekening belum dipakai dihapus.
- UI tidak melakukan optimistic removal untuk destructive write dan tidak menyediakan generic purge.

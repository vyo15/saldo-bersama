# Security Model

## Session v2 dan device registry

Cookie session canonical adalah signed/HttpOnly/SameSite credential opaque (`session_id` + secret acak). Database `user_sessions` hanya menyimpan SHA-256 verifier hash dan metadata perangkat coarse; raw secret, cookie, token Firebase, IP, dan raw user-agent tidak disimpan. Row session yang expired/revoked dapat dipurge setelah retention sebagai credential ephemeral; restore terkontrol mengosongkan registry agar credential pra-restore tidak hidup kembali. `api/gateway.js`, `api/export.js`, dan `/api/session` memakai resolver registry authoritative yang sama, lalu memvalidasi user aktif, Firebase UID binding, dan role terbaru pada registry `users` canonical. User hanya dapat list/revoke session miliknya; role change/deactivation mencabut seluruh session user. Google OAuth production memakai state + nonce + PKCE S256.


## Trust boundary

Browser, payload, URL, local storage, dan frontend state tidak tepercaya. Vercel Functions memverifikasi session, origin, rate limit, action, payload reserved field, role, ownership, idempotency, dan version. Turso hanya diakses backend.

## Identity

- Firebase Google ID token diverifikasi saat login. Localhost/device emulation dapat mengirim Firebase ID token dari browser; production desktop/mobile memakai Google OAuth Authorization Code callback server, memverifikasi signed `state`/`nonce`, menukar Google ID token melalui Firebase Identity Toolkit, lalu menjalankan verifier Firebase yang sama.
- Backend membuat signed HttpOnly `SameSite=Strict` session.
- Session v2 memiliki expiry, server-side per-device registry, revalidasi status/role/UID terhadap registry `users`, serta revoke satu/semua perangkat. Signed cookie saja tidak menjadi authority; backend wajib menyelesaikan credential terhadap `user_sessions` dan user canonical pada setiap jalur data.
- Registry `users` adalah authorization canonical. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama; role/status/UID binding operasional tidak berasal dari environment.
- Authorization default deny.
- Apps Script bridge memakai HMAC, timestamp, nonce, dan action allowlist.
- Jobs memakai signature terpisah.

## Request hardening

- Rate-limit key yang berasal dari alamat client atau authenticated identity memakai SHA-256 dan scope prefix; raw UID/alamat tidak menjadi bucket key. Session memakai `clientRateLimitKey()` dan `identityRateLimitKey()`, sedangkan gateway dan export memakai `identityRateLimitKey()` dari `api/_lib/security.js`.
- Rate limiting memakai dua lapisan: `enforceBestEffortRateLimit()` process-local sebagai lapisan murah, lalu `enforceDistributedRateLimit()` dengan bucket Turso v13 sebagai counter shared lintas Vercel Function instance. Bucket hanya menyimpan key yang sudah di-hash/scope, window, count, dan timestamp; bukan raw IP/UID/email. Platform/WAF quota tetap dapat ditambahkan sebagai defense-in-depth dan tidak menggantikan authorization/idempotency.
- Exact reserved transaction-field contract berada di `api/_lib/transactionContract.js` dan ditegakkan kembali pada gateway serta finance service.
- Client anti-error tidak dipercaya sebagai authorization, tetapi mutation biasa memakai intent lock persisten setelah `OUTCOME_UNKNOWN`: hanya metadata aman di-namespace per session/user yang dipertahankan agar retry data sama memakai idempotency key lama; payload finansial tidak disimpan dan payload berbeda ditolak sampai hasil lama definitif. Guard server tetap canonical dan tidak bergantung pada state browser.

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

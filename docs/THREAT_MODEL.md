# Threat Model

| Threat | Control aktif | Gap/aksi |
|---|---|---|
| Broken access control/IDOR | Action permission + service ownership query | Contract test harus mengikuti setiap action/read model baru. |
| Token/session theft | HttpOnly, SameSite Strict, Secure production, expiry, server-side `user_sessions`, own-device revoke, role/deactivation revoke | Real-device revoke/logout-all drill dan external alerting tetap perlu evidence. |
| CSRF/origin abuse | SameSite + strict origin allowlist | Semua state-changing endpoint baru wajib memakai guard sama. |
| Replay/duplicate write | Idempotency, nonce, timestamp, scoped hashed best-effort rate-limit key | Bucket rate limit saat ini process-local; distributed/global throttling lintas instance masih perlu evaluasi. |
| Concurrent overwrite | `row_version` conditional update | UI wajib menampilkan conflict, bukan retry overwrite. |
| SQL injection | Parameterized Turso statements | Jangan membuat dynamic SQL dari input tanpa allowlist. |
| Formula injection | Neutralisasi export/import | Test setiap format baru. |
| XSS | React escaping, larangan raw HTML | Audit dependency dan render HTML baru. |
| Privilege escalation | Firebase verification + canonical `users` role/status/UID binding | Role change Administrator-only, self-role change ditolak, dan perubahan diaudit. |
| Backup disclosure | Private Drive folder, checksum | Enkripsi aplikasi belum menjadi baseline teruji; desain key lifecycle wajib mendahului implementasi encryption. |
| Malicious import/restore | Preview, fingerprint, safety backup, maintenance, integrity | Real-resource drill wajib. |
| Log leakage | Structured redaction | Coverage terminal log/client crash masih perlu ditingkatkan. |
| Supply-chain compromise | Lockfile, CI, source validation | Dependabot/code scanning belum dibuktikan aktif. |
| Development/Production credential blast radius | Vercel scope terpisah + `DATABASE_ENVIRONMENT`/database binding fail-closed | Source guard aktif; live evidence dua database/token terpisah tetap diperlukan sebelum ADR-0007 ditutup. |
| Insider/manual SQL | Service-only policy, audit | Batasi token dan dokumentasikan break-glass. |
| Offline duplicate | Offline write ditolak | Jangan menambah browser write queue. |

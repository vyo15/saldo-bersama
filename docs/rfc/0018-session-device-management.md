# RFC-0018 Session Device Management

**Status:** Proposed, design hardened  
**Owner:** Product owner + security owner  
**Reviewers:** Backend, frontend, QA  
**Date:** 2026-08-17  
**Last reviewed:** 2026-08-21 against current server-session runtime

## Problem

Session canonical saat ini adalah signed HttpOnly cookie berumur terbatas dengan allowlist/role revalidation pada authenticated gateway flow. Session belum mempunyai registry per perangkat. User tidak dapat melihat session aktif, mencabut satu perangkat yang hilang, atau melakukan logout seluruh perangkat secara authoritative tanpa user deactivation atau rotasi `SESSION_SECRET`.

`readSession(request)` saat ini synchronous dan dipakai oleh `api/gateway.js`, `api/session.js`, dan `api/export.js`. Session registry membutuhkan server-side database validation, sehingga auth pipeline harus diubah secara terkoordinasi. Menambah tabel saja tidak cukup.

## Goals

- Backend mengenali session aktif melalui opaque session material tanpa menyimpan raw cookie/token.
- User dapat melihat session miliknya dengan metadata perangkat coarse.
- User dapat revoke satu session atau logout seluruh session miliknya.
- Revoke berlaku server-side pada request yang melakukan auth resolution setelah revoke.
- Role/allowlist/user status tetap dihitung dari canonical server state, bukan registry/client.
- Create/revoke/logout-all tercatat audit tanpa raw secret.
- Registry expired/revoked mempunyai retention bounded.
- Legacy cookie transition fail-safe dan tidak mempertahankan bypass tanpa batas.

## Non-goals

- Tidak membuat device fingerprint invasif.
- Tidak menyimpan Firebase ID token, Google ID token, cookie mentah, IP mentah, exact location, atau user-agent penuh.
- Tidak mengganti Google OAuth/Firebase identity authority.
- Tidak memperpanjang TTL session karena registry tersedia.
- Tidak memberi Administrator hak melihat raw session user lain.
- RFC ini bukan approval migration/auth runtime.

## Session v2 design decision

### Cookie material

Session v2 menggunakan dua opaque value:

- `session_id`: random identifier minimal 128-bit entropy;
- `session_secret`: random verifier secret terpisah.

Cookie tetap signed/HttpOnly/Secure/SameSite sesuai existing policy. Database hanya menyimpan hash/verifier dari `session_secret`, bukan secret mentah atau cookie value.

Cookie tidak perlu menjadi source role/user metadata authoritative. Registry mengikat `session_id` ke `user_id`, lalu runtime resolve user canonical dan authorization seperti existing flow.

### Registry

Concept minimum:

```text
user_sessions
- session_id
- user_id
- verifier_hash
- issued_at
- expires_at
- last_seen_at nullable
- revoked_at nullable
- revoked_reason nullable
- device_label nullable
- client_family nullable
- row_version
- created_at
- updated_at
```

Exact indexes/constraints ditentukan pada migration plan. Raw secret, exact IP, dan full UA tidak disimpan.

### Resolver split

Current `readSession()` tidak boleh diam-diam melakukan async DB call sambil mempertahankan call contract lama.

Future auth pipeline dipisah secara eksplisit:

1. parse + verify signed cookie format/expiry;
2. resolve `session_id` pada registry;
3. constant-time verify secret hash;
4. reject revoked/expired/missing row;
5. resolve canonical user state/allowlist/role;
6. return authenticated session/actor context.

Nama helper final diputuskan saat code plan, tetapi seluruh caller `gateway`, `/api/session`, dan export harus menggunakan resolver authoritative yang sama.

GET `/api/session` tidak boleh menganggap signed cookie saja cukup setelah registry aktif.

## Device metadata

Metadata hanya coarse dan informational:

- `Edge · Windows`
- `Chrome · Android`
- `Safari · iOS`

Label bukan fingerprint keamanan. User-agent mentah tidak disimpan permanen. Exact IP tidak ditampilkan. Security/rate-limit logging mengikuti observability policy existing.

User boleh melihat:

- label perangkat;
- issued time;
- approximate last active time;
- current-session marker.

Tidak ada token/session secret pada response.

## `last_seen_at` policy

Tidak perlu write database pada setiap request. Update `last_seen_at` bersifat best-effort dan dibatasi, misalnya maksimal sekali per 15 menit per session. Failure update last-seen tidak boleh membuat request finansial gagal jika session sendiri valid.

`last_seen_at` bukan authorization input.

## Actions

Proposed canonical actions:

```text
sessions.listOwn
sessions.revokeOwn
sessions.revokeAllOwn
```

Optional future action rename device tidak termasuk MVP.

### `sessions.listOwn`

- hanya session actor sendiri;
- return coarse metadata;
- revoked/expired dapat disembunyikan dari default list atau ditampilkan sebagai recent history menurut UX, tetapi tidak mengandung secret.

### `sessions.revokeOwn`

- target session harus milik actor;
- IDOR user lain selalu ditolak;
- current session boleh direvoke, setelah sukses cookie current harus dihapus dan client kembali login.

### `sessions.revokeAllOwn`

Baseline decision: **revoke seluruh session termasuk current session** lalu clear cookie dan paksa login ulang. Ini paling mudah dipahami dan paling aman untuk perangkat hilang.

Action idempotent. Revoke session yang sudah revoked tetap menghasilkan final state revoked tanpa row duplicate.

## Logout contract

Logout normal setelah registry aktif:

1. resolve current session jika tersedia;
2. mark registry row revoked dengan reason `logout` secara idempotent;
3. clear cookie walaupun registry revoke mengalami "already revoked";
4. audit logout tanpa secret.

Jika registry unavailable, fail behavior ditentukan code plan. Untuk financial app, runtime tidak boleh silently mempertahankan authenticated cookie sebagai valid tanpa registry setelah migration cutover.

## Legacy cookie transition

Rollout memilih **one-time forced re-login**.

- Migration registry diterapkan lebih dulu saat maintenance/deploy window.
- Runtime session v2 hanya menerima cookie format v2 yang mempunyai registry relation.
- Existing legacy cookie tanpa `session_id` ditolak dan dibersihkan.
- User login ulang sekali pada setiap perangkat untuk mendapat session registry canonical.
- Tidak ada compatibility fallback tanpa expiry yang menerima legacy cookie.

Ini lebih aman daripada mixed-mode revoke yang tidak authoritative.

## Revocation semantics and concurrency

Revoke menjamin semua **auth resolution berikutnya** menolak session. Request yang sudah berhasil resolve/auth sebelum revoke commit dapat menyelesaikan request yang sedang in-flight. Runtime tidak mengklaim dapat membatalkan proses yang sudah dieksekusi di server.

Mutation financial tetap menggunakan idempotency/concurrency guard masing-masing. Registry check dilakukan sebelum authorization/action dispatch.

Jika revoke dan request mulai setelah revoke commit, request harus fail closed dengan `UNAUTHENTICATED`/canonical session-revoked code tanpa menjalankan service action.

## Retention and cleanup

Registry revoked/expired disimpan **30 hari** untuk troubleshooting perangkat/incident, lalu cleanup job boleh menghapus row secara guarded. Audit event revoke/login mengikuti retention audit terpisah dan tidak ikut hilang hanya karena registry row dibersihkan.

Cleanup:

- tidak menyentuh active session;
- bounded batch;
- observable count/error tanpa secret;
- idempotent.

## Backup and restore

Logical application backup **tidak memulihkan session sebagai active session**.

Preferred policy:

- `user_sessions` dikecualikan dari user logical backup; atau
- jika technical snapshot menyertakan table, restore workflow harus revoke/purge seluruh restored session sebelum application kembali normal.

Setelah restore/migration besar, safest baseline adalah force login ulang. Restore tidak pernah menghidupkan revoked/expired cookie.

## Authorization

- User hanya list/revoke session sendiri.
- Administrator tidak dapat list session secret atau metadata user lain melalui action normal.
- Role/allowlist tidak dipercaya dari cookie registry.
- Disabled/inactive canonical user ditolak walaupun registry session masih active.
- Default deny untuk unknown session/action.

## Impact

- Frontend: Pengaturan > Keamanan/Perangkat Aktif, current marker, revoke, logout-all confirmation.
- API: session resolver async canonical dan actions own-session.
- Database: additive registry migration.
- Security: server-side revocation pada setiap authenticated resolution.
- Performance: satu registry lookup plus canonical actor resolution per authenticated request.
- Data integrity/saldo: tidak mengubah ledger atau saldo.
- Observability: login/session issued/revoked/rejected tanpa raw secret.

## Migration and rollback

Sebelum migration buat verified technical backup. Deploy harus dikoordinasikan agar migration dan session-v2 runtime tidak meninggalkan window permissive.

Rollback tidak boleh menghidupkan kembali session yang sudah revoked. Setelah cutover v2, rollback ke runtime yang menerima legacy cookie tanpa registry **dilarang**. Gunakan forward-fix.

Destructive DROP registry tidak dilakukan pada Production.

## Test and acceptance criteria

- Session v2 menghasilkan registry active tanpa raw cookie/token di database.
- Random secret hash mismatch ditolak constant-time.
- Missing, expired, atau revoked registry ditolak.
- Legacy cookie tanpa registry ditolak setelah cutover.
- User hanya dapat list/revoke session miliknya.
- IDOR session user lain ditolak.
- `revokeAllOwn` mencabut current + seluruh session lain dan clear cookie.
- Logout revoke current idempotent lalu clear cookie.
- Disabled/inactive user ditolak meskipun registry belum expired.
- GET session, gateway, dan export memakai resolver authoritative yang sama.
- Request yang mulai setelah revoke commit tidak menjalankan action.
- `last_seen_at` throttled dan bukan auth input.
- Registry/log tidak menyimpan raw secret, exact IP, full UA, atau stack trace.
- Logical restore tidak menghidupkan session lama.
- Cleanup 30 hari tidak menghapus active session atau audit event.
- Desktop/mobile real-device smoke mencakup login, current marker, revoke device, logout-all, dan forced legacy re-login.

## Risks

- DB lookup per request menambah latency.
- Mixed-mode legacy/v2 dapat menciptakan session yang tidak dapat direvoke.
- Bug restore dapat menghidupkan session lama.
- Device label dapat disalahartikan sebagai fingerprint kuat.
- `last_seen_at` write terlalu sering dapat menambah load.

## Decision

Design baseline memilih **session_id + secret verifier hash**, **async authoritative resolver**, **one-time forced re-login saat cutover**, **revoke-all termasuk current session**, **30-day registry retention**, dan **logical restore tidak menghidupkan session**.

RFC tetap Proposed. Ini **bukan approval migration/auth runtime**. Implementasi hanya boleh dimulai setelah migration, endpoint/action contract, deploy sequence, rollback/forward-fix, audit event, dan UI confirmation plan disetujui eksplisit.

## Links

- `../SECURITY_MODEL.md`
- `../THREAT_MODEL.md`
- `../INCIDENT_RESPONSE.md`
- `../../api/_lib/security.js`
- `../../api/session.js`
- `../../api/gateway.js`
- `../../api/export.js`

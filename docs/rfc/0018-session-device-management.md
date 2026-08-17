# RFC-0018 Session Device Management

**Status:** Proposed
**Owner:** Product owner + security owner
**Reviewers:** Backend, frontend, QA
**Date:** 2026-08-17

## Problem

Session canonical saat ini adalah signed HttpOnly cookie berumur terbatas dengan allowlist/role revalidation. Model ini belum mempunyai registry session per perangkat, sehingga pengguna tidak dapat melihat session aktif, mencabut satu perangkat yang hilang, atau melakukan logout seluruh perangkat tanpa langkah insiden yang lebih luas seperti user deactivation atau rotasi `SESSION_SECRET`.

Untuk aplikasi finansial yang dipakai dari laptop, PC, tablet, dan ponsel, capability revoke perlu authoritative di backend dan tidak boleh dibuat sebagai state frontend semata.

## Goals

- Backend dapat mengenali session aktif secara opaque tanpa menyimpan raw cookie/token.
- Pengguna dapat melihat daftar session miliknya dengan metadata perangkat minimal yang aman.
- Pengguna dapat revoke satu session lain atau seluruh session miliknya secara eksplisit.
- Administrator tidak mendapat jalur inspeksi secret/token milik pengguna lain.
- Revoke berlaku server-side pada request berikutnya, bukan hanya menghapus cookie lokal.
- Create/revoke/logout-all tercatat audit tanpa menyimpan raw session material.
- Expired/revoked session mempunyai lifecycle retention yang bounded dan terdokumentasi.

## Non-goals

- Tidak membuat device fingerprint invasif.
- Tidak menyimpan Firebase ID token, Google ID token, cookie mentah, IP mentah, atau user-agent penuh sebagai identifier permanen.
- Tidak mengganti Google OAuth/Firebase identity authority.
- Tidak memperpanjang TTL session hanya karena registry tersedia.
- Tidak memberi client hak menentukan actor, user id, role, issued-at, atau revoke timestamp.

## Proposed solution

Setelah RFC Accepted, tambahkan registry server-side dengan identifier random dan secret verifier yang tidak dapat dipakai kembali sebagai cookie mentah. Bentuk final ditentukan pada migration plan, tetapi konsep minimumnya:

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
```

Signed session cookie membawa `session_id` opaque selain identity minimum yang diperlukan. `readSession()` wajib mengecek signature/expiry existing lalu memastikan registry session masih aktif dan terikat ke user yang benar. Session registry tidak boleh menjadi sumber role/allowlist; authorization canonical tetap dihitung dari server configuration/user state.

Action yang diusulkan:

```text
sessions.listOwn
sessions.revokeOwn
sessions.revokeAllOwn
```

Logout normal mencabut session saat ini bila registry tersedia lalu menghapus cookie. Revoke-all harus mempertahankan request/session yang menjalankan aksi hanya jika keputusan UX/security secara eksplisit memilih demikian; default proposal adalah mencabut seluruh session termasuk current dan memaksa login ulang.

Metadata perangkat harus coarse, misalnya `Edge · Windows` atau `Chrome · Android`. IP hanya boleh dipakai sementara untuk security/rate-limit logging yang sudah direduksi/hash sesuai policy, bukan ditampilkan sebagai exact location.

## Alternatives

1. Tetap mengandalkan TTL 12 jam saja: sederhana tetapi tidak memadai untuk perangkat hilang.
2. Rotasi `SESSION_SECRET` untuk insiden satu perangkat: terlalu luas karena mencabut seluruh pengguna/session.
3. Simpan raw signed cookie di database: ditolak karena memperbesar dampak kebocoran database.
4. Firebase client session sebagai authority: ditolak karena aplikasi memakai server session sebagai authorization boundary.
5. Device fingerprint persisten: ditolak karena privacy cost tidak sebanding untuk dua pengguna.

## Impact

- Frontend: halaman Pengaturan/Keamanan atau panel session aktif dengan revoke action guarded.
- API: action list/revoke own melalui registry/policy canonical atau endpoint session yang tetap fail-closed.
- Database: migration additive untuk session registry dan index user/status/expiry.
- Auth/security: `readSession()` mendapat server-side revocation check; raw token tidak disimpan.
- Data integrity/saldo: tidak mengubah ledger atau saldo.
- Backup/restore: session registry sebaiknya tidak dipulihkan sebagai session aktif setelah restore; policy backup harus eksplisit.
- Environment/deployment: rollout terkoordinasi agar cookie lama ditangani fail-safe selama transition.
- Observability: event session issued/revoked/rejected tanpa raw token atau exact IP.
- Compatibility: Google OAuth/Firebase identity dan allowlist/role tetap canonical.

## Migration and rollback

Sebelum migration buat verified technical backup. Rollout harus menetapkan perilaku cookie existing sebelum registry, misalnya migration window yang memaksa login ulang sekali agar semua session mempunyai registry canonical. Jangan membuat fallback yang menerima session tanpa registry tanpa batas waktu.

Rollback tidak boleh menghidupkan kembali session yang sudah revoked. Jika runtime perlu di-forward-fix, registry tetap dipertahankan; destructive DROP pada Production tidak dilakukan manual.

## Test and acceptance criteria

- session baru menghasilkan registry aktif tanpa raw cookie/token di database;
- expired registry ditolak;
- revoked session ditolak pada request berikutnya;
- user hanya dapat list/revoke session miliknya;
- IDOR session user lain ditolak;
- role/allowlist tetap dihitung server-side dan tidak dipercaya dari registry/client;
- revoke-all idempotent dan diaudit;
- concurrent revoke/request mempunyai hasil fail-closed yang deterministik;
- stale `row_version` ditolak bila mutation memakai optimistic concurrency;
- logout menghapus cookie dan mencabut registry sesuai contract;
- backup/restore tidak menghidupkan session lama;
- session metadata/log tidak menyimpan token, exact IP, secret, atau stack trace;
- desktop/mobile real-device smoke setelah deployment.

## Risks

- DB lookup pada setiap authenticated request dapat menambah latency;
- migration yang terlalu permisif dapat mempertahankan session legacy tanpa revoke control;
- device label dapat menyesatkan jika dianggap fingerprint kuat;
- restore yang salah dapat menghidupkan kembali session revoked;
- cleanup session expired yang agresif dapat menghilangkan evidence insiden sebelum retention policy disetujui.

## Decision

Pending keputusan final storage/cookie transition/retention sebelum implementation. RFC ini **bukan approval migration atau perubahan auth runtime**.

## Links

- `../SECURITY_MODEL.md`
- `../THREAT_MODEL.md`
- `../INCIDENT_RESPONSE.md`
- `../../api/_lib/security.js`
- `../../api/session.js`

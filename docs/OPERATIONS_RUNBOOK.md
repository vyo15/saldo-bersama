# Operations Runbook

## Triage awal

1. Catat waktu Asia/Jakarta, deployment/commit, role, route, error code, request ID.
2. Jangan minta token, cookie, payload, atau screenshot data finansial nyata.
3. Periksa `/api/health`, Vercel runtime logs, Turso status/schema, integration queue, maintenance mode.
4. Tentukan apakah write harus dihentikan.
5. Gunakan `docs/INCIDENT_RESPONSE.md` bila ada data/security impact.

## Login gagal

- Verifikasi Firebase provider/domain.
- Verifikasi `VITE_FIREBASE_API_KEY`, client ID, allowlist, role, dan binding `users`.
- Jangan menurunkan backend guard untuk memaksa login.

## Turso/schema gagal

- Hentikan write.
- Jalankan `npm run env:check`, `npm run db:integrity`.
- Jangan menjalankan migration ulang tanpa review.
- Bila schema mismatch, ikuti migration/release plan.

## Saldo berbeda

- Hentikan edit pada entity terkait.
- Catat request/entity ID teredaksi.
- Jalankan integrity check dan hitung ulang dari saldo awal + transaksi aktif.
- Periksa transfer, status, linked recurring/goal, period closure, duplicate idempotency.
- Jangan mengedit saldo langsung.

## Integrasi macet

- Periksa `integrations.status`, pending/failed/dead-letter, lock owner dan retry.
- Transaksi Turso tetap canonical.
- Rebuild mirror/Calendar hanya melalui owner action yang diaudit.

## Backup/restore

Ikuti `RECOVERY_RUNBOOK.md`. Jangan menyatakan sukses sebelum checksum, restore apply, integrity, dan post-restore verification lulus.

## Deployment rusak

- Hentikan promotion.
- Verifikasi env scope dan deployment baru.
- Rollback kode hanya bila kompatibel dengan schema/data.
- Ikuti `ROLLBACK_RUNBOOK.md`.

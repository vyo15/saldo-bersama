# Rollback Runbook

## Prinsip

Rollback kode tidak selalu berarti rollback data. Jangan deploy versi lama bila schema atau write baru tidak kompatibel.

## Sebelum rollback

1. Hentikan promotion/write bila perlu.
2. Catat deployment, commit, schema version, migration, dan waktu.
3. Nilai apakah data baru sudah ditulis.
4. Pastikan backup/snapshot dan integrity evidence tersedia.
5. Tentukan: rollback code, forward-fix, atau restore guarded.

## Code rollback

- Gunakan deployment/commit terakhir yang kompatibel.
- Jangan mengubah env/schema secara improvisasi.
- Redeploy dan smoke test auth, reads, writes, transfer, audit, queue.
- Verifikasi saldo/data setelah rollback.

## Data rollback/restore

Hanya melalui `RECOVERY_RUNBOOK.md`: preview, safety backup, maintenance, apply, integrity, audit, dan verifikasi. Jangan memakai SQL manual atau spreadsheet lama sebagai source setelah Turso menerima write production.

## Setelah rollback

Catat root cause, dampak, data verification, release yang dibatalkan, dan corrective action di handoff/changelog/postmortem.

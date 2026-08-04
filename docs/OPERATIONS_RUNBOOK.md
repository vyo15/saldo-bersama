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

## Salah arsip, salah batal, atau salah nonaktif

1. Jangan mengedit Turso langsung dan jangan melakukan full restore terlebih dahulu.
2. Owner membuka Pengaturan → Arsip dan pemulihan untuk rekening/kategori, atau daftar Transaksi untuk transaksi cancelled.
3. Periksa entity, versi, alasan, periode, serta dependency yang ditampilkan.
4. Jalankan pemulihan satu item. Backend akan menolak konflik, duplicate, periode tertutup, referensi tidak aktif, atau dampak saldo tidak valid.
5. Refresh data, verifikasi saldo/laporan, lalu periksa audit activity.
6. Gunakan full restore hanya bila lifecycle per-item tidak memadai dan prosedur `RECOVERY_RUNBOOK.md` disetujui.

## Hapus rekening belum dipakai

- Hanya owner dapat menjalankan `accounts.deleteUnused` dari detail rekening setelah preview server.
- Pastikan saldo awal/saat ini Rp0 dan seluruh hitungan transaksi, rekonsiliasi, kantong, tagihan, serta target bernilai nol.
- Isi alasan, centang acknowledgement, dan ketik frasa yang diminta.
- Bila muncul conflict, jangan retry dengan data lama; refresh lalu tinjau ulang.
- Hasil hard delete tidak memiliki tombol undo karena row rekening sudah hilang. Audit tetap ada; bila rekening ternyata masih dibutuhkan, buat rekening baru. Jangan restore database hanya untuk rekening kosong yang belum pernah digunakan.

# Operations Runbook

## Triage awal

1. Catat waktu Asia/Jakarta, deployment/commit, role, route, error code, request ID.
2. Jangan minta token, cookie, payload, atau screenshot data finansial nyata.
3. Periksa `/api/health`, Vercel runtime logs, Turso status/schema, integration queue, maintenance mode.
4. Tentukan apakah write harus dihentikan.
5. Gunakan `docs/INCIDENT_RESPONSE.md` bila ada data/security impact.

## Login gagal

- Verifikasi Firebase provider/domain.
- Verifikasi `VITE_FIREBASE_API_KEY`, client ID, bootstrap Administrator bila diperlukan, serta role/status/binding canonical di `users`.
- Jangan menurunkan backend guard untuk memaksa login.

## Turso/schema gagal

- Hentikan write.
- Untuk Development jalankan `npm run env:check`, `npm run db:integrity`; untuk Production gunakan `npm run prod:check` terlebih dahulu dan, bila direct integrity read memang disetujui pada komputer tepercaya, `npm run db:integrity -- production`.
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
2. Administrator membuka Pengaturan → Arsip dan pemulihan untuk rekening/kategori, atau daftar Transaksi untuk transaksi cancelled.
3. Periksa entity, versi, alasan, periode, serta dependency yang ditampilkan.
4. Jalankan pemulihan satu item. Backend akan menolak konflik, duplicate, periode tertutup, referensi tidak aktif, atau dampak saldo tidak valid.
5. Refresh data, verifikasi saldo/laporan, lalu periksa audit activity.
6. Gunakan full restore hanya bila lifecycle per-item tidak memadai dan prosedur `RECOVERY_RUNBOOK.md` disetujui.

## Hapus rekening belum dipakai

- Hanya Administrator dapat menjalankan `accounts.deleteUnused` dari detail rekening setelah preview server.
- Pastikan saldo awal/saat ini Rp0 dan seluruh hitungan transaksi, rekonsiliasi, Alokasi Dana, Jadwal Rutin, serta Target bernilai nol.
- Isi alasan, centang acknowledgement, dan ketik frasa yang diminta.
- Bila muncul conflict, jangan retry dengan data lama; refresh lalu tinjau ulang.
- Hasil hard delete tidak memiliki tombol undo karena row rekening sudah hilang. Audit tetap ada; bila rekening ternyata masih dibutuhkan, buat rekening baru. Jangan restore database hanya untuk rekening kosong yang belum pernah digunakan.

## Reset data testing

Gunakan hanya pada fase setup/trial sebelum transaksi nyata mulai dicatat dan hanya pada database **Development** yang sudah terikat `development`. Source v14 memisahkan Development dan Production secara fail-closed; reset testing tidak boleh dijalankan terhadap database Production. Operasi ini manual dan tidak pernah dijalankan otomatis di background.

1. Administrator membuka **Pengaturan → Reset data testing**. Halaman lebih dulu menjalankan `reset.status` dan health check Google Drive. Jika status reset tidak dapat diverifikasi, operasi destructive tetap diblokir.
2. Pilih preset `Bersihkan aktivitas testing` atau `Bersihkan aktivitas + nolkan saldo`, lalu jalankan preview. Preview harus menunjukkan seluruh data finansial yang akan dibersihkan; untuk preset kedua, preview juga wajib menunjukkan saldo rekening saat ini dan saldo awal yang akan menjadi Rp0.
3. Preview juga menghitung sisa operasional yang ikut dibersihkan: delivery/queue notifikasi, link/outbox integrasi, dan preview import. Queue canonical `system/rebuild` dari reset sebelumnya bukan data testing dan harus dipertahankan/reuse.
4. Rekening, kategori, pengguna, konfigurasi, audit log, backup, push subscription, dan preference notifikasi tidak ikut dihapus.
5. Google Drive wajib berstatus siap. Apply memakai fingerprint preview terbaru, alasan, seluruh acknowledgement checklist, frasa `BERSIHKAN DATA TESTING`, dan safety backup Google Drive yang terverifikasi.
6. Backend mengaktifkan maintenance, menghapus scope testing secara atomik, menjalankan integrity check, menulis audit, lalu mengantrekan/reuse rebuild Sheets/Calendar.
7. Jika client menerima `IDEMPOTENCY_OUTCOME_UNKNOWN`, **jangan kirim reset lagi**. Gunakan **Periksa status operasi**. `reset.status` memeriksa unresolved idempotency milik Administrator, audit `reset.apply`, deterministic safety backup, dan maintenance.
8. Jika status `committed`, perlakukan reset lama sebagai sukses dan jangan kirim ulang. Bila kemudian memang ada data testing baru, jalankan preview baru dan gunakan intent/idempotency key baru hanya ketika `canStartNewIntent=true`. Jika status `not_committed`, jalankan preview baru sebelum membuat intent baru. Jika status `processing`, tunggu lalu periksa lagi.
9. Jika status `recovery_required`, jalankan integrity recovery. Maintenance hanya boleh dibuka kembali bila integrity check `ok`; perubahan ini wajib menghasilkan audit `maintenance.recover`.
10. Setelah pembersihan, cek dashboard, saldo rekening, transaksi, target, jadwal rutin, alokasi, anggaran, Cocokkan Saldo, dan status integrasi sebelum melanjutkan input.
11. Begitu aplikasi mulai dipakai untuk transaksi nyata, hentikan penggunaan pembersihan massal ini. Koreksi data nyata wajib memakai cancel/archive/restore/reverse sesuai lifecycle domain.

## Reset semua data

Gunakan hanya ketika Administrator benar-benar ingin mengembalikan data aplikasi ke kondisi awal. Ini bukan pengganti koreksi transaksi harian dan tidak menghapus identitas login, audit, safety backup, konfigurasi keamanan, idempotency recovery, atau nonce anti-replay yang masih berlaku.

1. Administrator membuka **Pengaturan → Reset semua data** lalu menjalankan preview server.
2. Preview wajib menampilkan ledger/planning, rekening, kategori, state notifikasi/integrasi/preview maintenance yang akan dihapus, serta security/recovery backbone yang tetap disimpan.
3. Google Drive wajib sehat. Apply memerlukan safety backup terverifikasi, alasan, empat acknowledgement, frasa `RESET SEMUA DATA SALDO BERSAMA`, dan countdown 15 detik di UI.
4. Backend memvalidasi fingerprint lagi setelah safety backup, mengaktifkan maintenance, purge sesuai urutan foreign key, menjalankan integrity check, menulis audit `fullReset.apply`, mempertahankan/reuse queue projection canonical, lalu membuka maintenance secara atomik.
5. Queue rebuild `full-reset` bukan data pengguna dan tidak boleh membuat preview pasca-reset terlihat masih kotor. Request nonce yang masih berlaku juga dipertahankan agar request scheduler lama tidak dapat diputar ulang.
6. Jika client menerima outcome unknown, **jangan retry**. Gunakan `fullReset.status` dengan recovery key yang sama. Jika `committed`, anggap selesai; jika `processing`, tunggu; jika `not_committed`, buat preview baru; jika `recovery_required`, jalankan integrity recovery.
7. Jika data yang dihapus perlu dikembalikan, gunakan safety backup melalui workflow Restore guarded. Jangan menulis ulang data langsung ke database.

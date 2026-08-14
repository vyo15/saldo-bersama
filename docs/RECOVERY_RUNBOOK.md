# Recovery Runbook

## Jenis artefak

- Excel: export untuk pengguna, tidak dapat dipakai restore.
- Sheets mirror: laporan read-only, dapat dibangun ulang.
- Technical backup: snapshot recovery terkompresi dan ter-checksum di Google Drive.

## Backup

Backup wajib berisi manifest, schema version, created_at/by, table counts, checksum, dan seluruh tabel recovery-safe. Push subscription tidak ikut backup/restore karena merupakan credential perangkat yang harus didaftarkan ulang setelah recovery. Pembuatan manual/before-import/before-restore dicatat di `backup_runs` dan audit. Nama file unik; file existing hanya boleh digunakan ulang bila backup ID dan checksum cocok.


## Import guarded

Import transaksi maksimal 50 record dan bersifat all-or-nothing. File dianggap input tidak tepercaya; field kontrol internal seperti `confirm_duplicate`, actor, role, audit field, atau reserved linkage tidak boleh dipakai untuk melewati guard backend. Preview mensimulasikan record secara berurutan di transaction rollback-only sehingga dampak saldo, kantong, period lock, reference aktif, dan duplicate antarbaris ikut dihitung secara kumulatif. Satu baris invalid atau duplicate membuat seluruh preview `acceptable=false` dan `import.apply` wajib menolak tanpa membuat transaksi. Apply yang acceptable membuat safety backup, memvalidasi ulang semua record dalam satu transaction, menjalankan integrity check, menulis audit, lalu commit. Kegagalan pada record mana pun harus rollback seluruh record import.

## Restore guarded

1. Administrator memasukkan Drive file ID.
2. Backend membaca melalui signed bridge.
3. Verifikasi ukuran, gzip, JSON, checksum, dan schema version.
4. Buat preview dengan expiry dan tampilkan nama file, waktu backup, schema version, serta row counts utama.
5. User mengisi alasan, menyelesaikan seluruh acknowledgement, dan mengetik frasa `RESTORE SALDO BERSAMA` secara persis.
6. Buat safety backup dari database aktif.
7. Aktifkan maintenance fail-closed.
8. Apply restore dalam transaction database.
9. Jalankan `PRAGMA foreign_key_check` dan business integrity.
10. Perubahan tabel, audit restore, status preview, pembukaan maintenance, dan antrean rebuild commit atomik hanya jika semua lulus.
11. Rebuild Sheets mirror dan reconcile Calendar melalui outbox.

Jika apply atau integrity gagal, transaction rollback dan maintenance tetap aktif sampai owner menjalankan integrity/recovery yang terverifikasi. Restore menolak backup bila email aktif yang sama memiliki `user_id` berbeda, mempertahankan UID/status/role pengguna yang saat ini diizinkan, dan tidak menghidupkan kembali push credential perangkat. Jangan menyatakan restore berhasil sebelum seluruh verifikasi selesai.

## Incident response

- Jangan mengubah data langsung melalui Turso console kecuali prosedur maintenance disetujui.
- Simpan request ID, waktu, actor, error code, dan backup ID.
- Jangan membagikan stack trace/token pada pengguna.
- Uji restore drill berkala pada salinan terisolasi sementara atau branch disposable; jangan gunakan database aktif dan jangan mempertahankannya sebagai database Development permanen.

## Pemulihan satu entity sebelum full restore

Kesalahan pengguna biasa harus ditangani melalui lifecycle per-item:

- rekening/kategori arsip → action restore dengan alasan dan `row_version`;
- transaksi cancelled → restore khusus owner bila period, reference, duplicate, dan balance guard lulus;
- member nonaktif → reaktivasi eksplisit setelah allowlist diverifikasi;
- periode salah ditutup → buka kembali secara berurutan dengan alasan.

Full database restore bukan mekanisme undo harian. Gunakan restore guarded hanya bila kerusakan mencakup banyak data atau lifecycle per-item tidak dapat menjaga konsistensi. Rekening kosong yang dihapus melalui `accounts.deleteUnused` tidak dipulihkan per item; audit tetap tersedia dan rekening baru dapat dibuat kembali tanpa memalsukan histori.


## Full reset

1. Jangan retry `fullReset.apply` setelah timeout/5xx.
2. Gunakan `fullReset.status` dengan opaque idempotency recovery key yang sama.
3. Jika `committed`, anggap reset selesai dan jangan kirim intent yang sama lagi.
4. Jika `processing`, tunggu lalu periksa status ulang.
5. Jika `not_committed` dan maintenance normal, buat preview baru sebelum intent baru.
6. Jika `recovery_required`, jalankan integrity recovery. Maintenance hanya boleh dibuka jika integrity check lulus dan `maintenance.recover` tercatat atomik.
7. Untuk mengembalikan data yang telah di-full-reset, gunakan safety backup yang terverifikasi melalui workflow Restore, bukan menulis ulang data secara manual.

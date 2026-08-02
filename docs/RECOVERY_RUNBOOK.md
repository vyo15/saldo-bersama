# Recovery Runbook

## Jenis artefak

- Excel: export untuk pengguna, tidak dapat dipakai restore.
- Sheets mirror: laporan read-only, dapat dibangun ulang.
- Technical backup: snapshot recovery terkompresi dan ter-checksum di Google Drive.

## Backup

Backup wajib berisi manifest, schema version, created_at/by, table counts, checksum, dan seluruh tabel recovery-safe. Push subscription tidak ikut backup/restore karena merupakan credential perangkat yang harus didaftarkan ulang setelah recovery. Pembuatan manual/before-import/before-restore dicatat di `backup_runs` dan audit. Nama file unik; file existing hanya boleh digunakan ulang bila backup ID dan checksum cocok.

## Restore guarded

1. Owner memasukkan Drive file ID.
2. Backend membaca melalui signed bridge.
3. Verifikasi ukuran, gzip, JSON, checksum, dan schema version.
4. Buat preview dengan expiry.
5. User mengetik confirmation phrase.
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
- Uji restore drill berkala pada database DEV terpisah.

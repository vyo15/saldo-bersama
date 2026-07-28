# Recovery Runbook Saldo Bersama

Dokumen ini dipakai ketika import, restore, audit compensation, atau commit idempotency gagal. Prinsip utama: **fail closed**. Jangan membuka `maintenance_mode` secara manual sebelum data lolos verifikasi.

## Status recovery

State canonical disimpan di Apps Script Properties dan dicerminkan ke `System_Config` bila schema masih dapat ditulis:

- `RECOVERY_REQUIRED=true`
- `RECOVERY_STATUS`
- `RECOVERY_DETAILS_JSON`
- `RECOVERY_UPDATED_AT`

`doGet()` dan `system.health` menampilkan status recovery. Selama recovery aktif, action normal ditolak. Jalur yang tetap tersedia hanya health, restore preview/apply, dan integrity check.

## Restore/import gagal tetapi rollback berhasil

Sistem:

1. tetap menahan maintenance selama apply dan verifikasi;
2. menerapkan safety backup;
3. memverifikasi schema, checksum SHA-256 canonical, dan integrity check;
4. baru membuka maintenance;
5. mengembalikan error `RESTORE_ROLLED_BACK` atau `IMPORT_ROLLED_BACK`.

Data utama sudah kembali ke safety backup. Periksa audit, jalankan integrity check, lalu buat preview baru sebelum mencoba lagi.

## Rollback otomatis gagal

Sistem mengembalikan `RECOVERY_REQUIRED`, menyimpan `safetyBackupFileId`, dan membiarkan aplikasi terkunci.

Jangan:

- mengubah `maintenance_mode` menjadi `false`;
- menghapus Script Properties recovery;
- melanjutkan transaksi;
- menyalin sheet satu per satu tanpa verifikasi.

Langkah pemulihan manual:

1. Buka Apps Script menggunakan akun owner aktif.
2. Ambil `safetyBackupFileId` dari `RECOVERY_DETAILS_JSON` atau respons error.
3. Pastikan file tersebut adalah safety backup yang tercatat pada state recovery.
4. Jalankan dari editor Apps Script:

```javascript
recoverFromSafetyBackup("SAFETY_FILE_ID", "RECOVER SALDO BERSAMA");
```

5. Fungsi memverifikasi bahwa akun editor adalah owner aktif dalam safety backup.
6. Fungsi menerapkan snapshot, memverifikasi checksum/schema/integrity, menulis audit, lalu membuka maintenance.
7. Jalankan `integrity.run` sekali lagi dari aplikasi.
8. Buat backup manual baru.

## Schema aktif rusak

`restore.preview` tidak bergantung pada keberadaan seluruh sheet aktif. Request recovery memakai actor owner yang sudah ditandatangani Vercel dan backup wajib mencatat email actor tersebut sebagai owner aktif.

`restore.apply` memakai idempotency berbasis Apps Script Properties ketika sheet `Idempotency` aktif tidak dapat dipercaya. Retry wajib memakai idempotency key yang sama.

Jika sheet `Users` dan jalur API tidak dapat digunakan sama sekali, gunakan `recoverFromSafetyBackup()` dari editor Apps Script.

## Idempotency commit gagal

Jika mutasi sudah terjadi tetapi hasil idempotency sheet gagal disimpan, sistem masuk status `idempotency_commit_required`. Jangan retry dengan key baru. Gunakan detail recovery untuk memverifikasi entity dan hasil operasi. Pemulihan manual harus memastikan hanya satu mutasi yang benar sebelum recovery state dibersihkan.

## External cleanup

Kegagalan menghapus file export sementara, file backup gagal, atau event Calendar yatim dicatat pada Script Property `EXTERNAL_CLEANUP_REQUIRED_JSON`. Kondisi ini tidak otomatis mengunci ledger karena tidak mengubah saldo, tetapi owner harus membersihkannya secara manual dan mendokumentasikan hasilnya.

## Checklist setelah recovery

- Schema version dan seluruh header valid.
- Tidak ada duplicate ID atau idempotency key aktif ganda.
- Referensi rekening, kategori, kantong, recurring, goal, dan user valid.
- Nilai occurrence sesuai transaksi aktif terkait.
- Goal movement sesuai transfer aktif terkait.
- Tidak ada periode closed ganda.
- Saldo dan alokasi tidak overallocated.
- Audit recovery tersedia.
- Backup baru berstatus `verified`.

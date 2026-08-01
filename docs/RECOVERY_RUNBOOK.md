# Recovery Runbook Saldo Bersama

Dokumen ini dipakai ketika migration, import, restore, audit compensation, atau commit idempotency gagal. Prinsip utama: **fail closed**. Jangan membuka `maintenance_mode` secara manual sebelum data lolos verifikasi.

## Status recovery

State canonical disimpan di Apps Script Properties dan dicerminkan ke `System_Config` bila schema masih dapat ditulis:

- `RECOVERY_REQUIRED=true`
- `RECOVERY_STATUS`
- `RECOVERY_DETAILS_JSON`
- `RECOVERY_UPDATED_AT`

Public `doGet()` hanya menampilkan status service minimal dan tidak mengungkap schema/recovery. Detail recovery hanya tersedia melalui signed action `system.health` dan error terkontrol untuk owner. Selama recovery aktif, action normal ditolak. Jalur yang tetap tersedia hanya health, restore preview/apply, dan integrity check.

## Restore/import gagal tetapi rollback berhasil

Sistem:

1. tetap menahan maintenance selama apply dan verifikasi;
2. menerapkan emergency raw snapshot;
3. memverifikasi schema, checksum SHA-256 canonical, dan integrity check;
4. baru membuka maintenance;
5. mengembalikan error `RESTORE_ROLLED_BACK` atau `IMPORT_ROLLED_BACK`.

Data utama sudah kembali ke raw snapshot sebelum operasi. Periksa audit, jalankan integrity check, lalu buat preview baru sebelum mencoba lagi.

## Rollback otomatis gagal

Sistem mengembalikan `RECOVERY_REQUIRED`, menyimpan `safetyBackupFileId` dari emergency raw snapshot, dan membiarkan aplikasi terkunci.

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

## Migration v1 ke v2 gagal

Status migration berada pada Script Properties `MIGRATION_STATUS`, `MIGRATION_SAFETY_FILE_ID`, dan kode error terkait.

- `failed_before_backup`: tidak ada write migration; perbaiki source/reference lalu preview ulang.
- `rolled_back`: snapshot v1 sudah diterapkan kembali dan schema v1 diverifikasi. Jangan menjalankan aplikasi source v2 terhadap spreadsheet ini sebelum root cause diperbaiki dan migration diulang.
- `recovery_required`: migration dan rollback sama-sama gagal. Aplikasi tetap terkunci.

Untuk `recovery_required`, gunakan file pada `MIGRATION_SAFETY_FILE_ID`/recovery details. Safety backup tersebut harus tetap schema v1 dan tidak boleh terkena retensi otomatis. Pulihkan melalui editor menggunakan prosedur recovery manual, verifikasi schema v1, lalu ulangi preview/migration dengan source yang sudah diperbaiki. Jangan mengubah `schema_version` atau header secara manual.

## Schema aktif rusak

`restore.preview` tidak bergantung pada keberadaan seluruh sheet aktif. Request recovery memakai actor owner yang sudah ditandatangani Vercel dan backup wajib mencatat email actor tersebut sebagai owner aktif.

`restore.apply` membuat raw snapshot seluruh sheet aktif tanpa membaca schema atau menulis `Backup_Log`. Snapshot ini mencatat nama sheet, header/data mentah, dan checksum raw sehingga missing sheet/header dapat dipulihkan. Verified normal backup dan emergency raw snapshot adalah dua jenis artefak berbeda.

Restore memakai state dan idempotency berbasis Apps Script Properties ketika `System_Config`/`Idempotency` aktif tidak dapat dipercaya. Retry wajib memakai idempotency key yang sama.

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
- Closure dibuka kembali dari bulan paling akhir; tidak ada periode reopened yang berada sebelum closure aktif yang lebih baru.
- Saldo dan alokasi tidak overallocated.
- Tidak ada duplicate budget aktif untuk kombinasi periode, kategori, scope, dan owner yang sama.
- Tidak ada formula aktif pada data row sheet canonical.
- Transaksi recurring/goal mempunyai linkage dua arah yang konsisten.
- Audit recovery tersedia.
- Backup baru berstatus `verified`.

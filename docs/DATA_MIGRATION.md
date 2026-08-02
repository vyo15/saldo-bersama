# Migrasi Google Sheets ke Turso

## Tujuan

Memindahkan source of truth dari spreadsheet lama ke Turso tanpa mengubah arti transaksi, saldo, transfer, scope, recurring, budget, envelope, goal, audit, dan period closure.

## Prasyarat

- Database target atau salinan terisolasi sementara telah menerima schema migration.
- Backup spreadsheet lama berhasil diverifikasi.
- Data legacy diekspor ke JSON canonical yang didukung migration tool.
- Kedua akun dan role sudah ditentukan.
- Tidak ada secret di file migrasi.

## Preview dan parity

Catat sebelum import:

- jumlah row tiap entity;
- transaksi active/cancelled;
- saldo setiap rekening pada tanggal cutover;
- total income/expense per bulan;
- transfer count;
- budget used amount;
- sisa envelope;
- progress goal;
- recurring actual amount;
- closed periods.

Jalankan:

```bash
npm run db:migrate
npm run db:import-legacy -- path/to/legacy-export.json
# Setelah preview, backup, dan maintenance aktif:
npm run db:import-legacy -- path/to/legacy-export.json --apply --confirm=MIGRATE_LEGACY_TO_TURSO
npm run db:integrity
```

Import harus dipreview dan diuji pada salinan terisolasi sementara terlebih dahulu. Hasil dianggap lulus hanya jika row count, financial fingerprint, saldo per rekening, dan laporan bulanan cocok. Salinan tersebut bukan database Development permanen dan harus dihapus setelah verifikasi.

## Cutover production

1. Aktifkan maintenance pada source lama.
2. Buat final safety backup.
3. Ambil snapshot final dan checksum.
4. Import ke Turso production.
5. Jalankan schema, FK, dan business integrity check.
6. Bandingkan seluruh saldo dan laporan.
7. Smoke test owner dan member.
8. Deploy API dengan Turso sebagai backend.
9. Buka maintenance setelah verifikasi.
10. Arsipkan spreadsheet lama read-only.
11. Buat spreadsheet baru khusus mirror.

## Batas rollback

Sebelum Turso menerima write production, rollback dapat kembali ke source lama. Setelah write production pertama masuk Turso, spreadsheet lama tidak boleh diaktifkan kembali sebagai database karena akan kehilangan delta baru. Recovery setelah titik itu menggunakan backup Turso atau migration delta yang diaudit.

## Cleanup

Business logic Apps Script lama, connector spreadsheet database, env lama, dan test legacy hanya dihapus setelah parity dan restore drill lulus. Source saat ini sudah memakai bridge minimal; spreadsheet lama tetap disimpan sebagai arsip sampai retention disetujui.

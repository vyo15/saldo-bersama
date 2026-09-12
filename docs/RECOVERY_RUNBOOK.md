# Recovery Runbook

> **Status:** Runbook  
> **Purpose:** Prosedur current untuk backup, import/restore guarded, integrity recovery, dan full reset.  
> **Authority:** Struktur current di `TURSO_SCHEMA.md`; detail perubahan historis berada di migrations/`CHANGELOG.md`.

## Jenis artefak

- **Excel:** export pengguna; bukan artefak restore.
- **Sheets mirror:** read-only mirror dan dapat dibangun ulang.
- **Technical backup:** snapshot recovery terkompresi + checksum yang disimpan pada Drive melalui bridge tepercaya.

## Kontrak backup current

Backup wajib membawa manifest, schema version, `created_at/by`, table counts, checksum, dan seluruh tabel authoritative yang dinyatakan recovery-safe oleh implementation current. Data Investment authoritative (instrument/portfolio/trade/valuation/reconciliation/correction), metadata Alokasi/Kebutuhan yang authoritative, audit/lifecycle yang diwajibkan, dan marker compatibility current harus ikut bila termasuk kontrak backup.

Derived summary seperti holding/market value/P&L tidak dipercaya sebagai state bebas; nilainya harus dapat dihitung kembali dari history canonical. `sync_revisions` tidak diperlakukan sebagai financial authority dan tidak perlu dipulihkan sebagai revision lama. Push subscription juga tidak dipulihkan karena merupakan credential perangkat yang harus didaftarkan ulang.

Pembuatan manual/before-import/before-restore dicatat di `backup_runs` dan audit. Nama file unik; artefak existing hanya boleh dianggap sama bila backup ID dan checksum cocok.

## Import guarded

Import transaksi maksimal 50 record dan **all-or-nothing**. Input dianggap tidak tepercaya; field kontrol internal seperti actor, role, audit, reserved linkage, atau duplicate override tidak boleh mengalahkan backend guard.

Preview menjalankan simulasi berurutan dalam transaction rollback-only sehingga saldo, Dana Tersedia/Alokasi, period lock, reference aktif, dan duplicate antarbaris dihitung kumulatif. Satu row invalid/duplicate membuat seluruh preview tidak acceptable. Apply acceptable membuat safety backup, memvalidasi ulang seluruh record dalam satu transaction, menjalankan integrity check, menulis audit, lalu commit. Kegagalan satu record me-roll back seluruh import.

## Restore guarded

1. Administrator memasukkan Drive file ID.
2. Backend membaca file melalui signed bridge.
3. Verifikasi ukuran, gzip/JSON, checksum, schema/backup compatibility, dan manifest.
4. Buat preview ber-expiry yang menampilkan nama file, waktu backup, schema version, serta row counts utama.
5. User mengisi alasan, menyelesaikan acknowledgement, dan mengetik `RESTORE SALDO BERSAMA` secara persis.
6. Buat safety backup dari database aktif.
7. Aktifkan maintenance fail-closed.
8. Apply restore dalam transaction database menggunakan normalizer compatibility current.
9. Jalankan `PRAGMA foreign_key_check` dan business integrity.
10. Commit data + audit restore + status preview + pembukaan maintenance + antrean rebuild hanya bila seluruh validasi lulus.
11. Rebuild Sheets mirror dan reconcile Calendar melalui outbox.

Jika apply/integrity gagal, transaction rollback dan maintenance tetap aktif sampai recovery terverifikasi. Restore normalizer boleh menerima format backup historis yang memang masih didukung runtime current, tetapi **tidak boleh mengarang histori yang tidak ada**. Identity/user mapping harus mencegah email aktif yang sama dipulihkan dengan canonical user ID berbeda. Push credential lama tidak boleh dihidupkan kembali.

Jangan menyatakan restore berhasil sebelum seluruh verifikasi selesai.

## Recovery objectives dan retention

Sebelum aplikasi dipakai sebagai dependency finansial nyata, owner wajib menetapkan dan mencatat:

- **RPO:** kehilangan data maksimum yang masih dapat diterima.
- **RTO:** durasi maksimum sampai aplikasi dapat dipakai kembali dengan data terverifikasi.
- **Retention backup:** lama penyimpanan backup harian/mingguan/bulanan.

Source tidak menetapkan angka sepihak karena keputusan ini memengaruhi biaya, privacy, kapasitas Drive, dan ekspektasi recovery.

## Evidence restore drill minimum

Drill dilakukan pada database terisolasi/disposable, **bukan Production aktif**, dan minimal mencatat:

- commit + schema/runtime target;
- backup ID/file name tanpa secret;
- checksum verification;
- row counts sebelum/sesudah;
- saldo per rekening dan Dana Tersedia yang relevan;
- `PRAGMA foreign_key_check` + business integrity;
- parity Investment: quantity, remaining cost basis, realized/unrealized P/L dengan harga pembanding yang sama, chronology, cash-effect compatibility, dan hidden-account visibility;
- rebuild Sheets/Calendar;
- waktu mulai/selesai dan hasil akhir.

Mismatch harus menghentikan klaim sukses. Jangan memperbaiki history dengan SQL manual atau summary overwrite.

## Incident response

- Jangan mengubah data langsung melalui Turso console kecuali prosedur maintenance disetujui.
- Simpan request ID, waktu, actor, error code, dan backup ID; jangan simpan secret/token di evidence.
- Jangan membagikan stack trace/token kepada pengguna.
- Uji restore drill pada salinan terisolasi/branch disposable dan jangan mempertahankannya sebagai Development permanen.

## Pemulihan satu entity sebelum full restore

Kesalahan pengguna biasa ditangani melalui lifecycle per-item:

- rekening/kategori arsip → restore dengan alasan dan `row_version`;
- transaksi cancelled → restore owner bila period/reference/duplicate/balance guard lulus;
- member nonaktif → reaktivasi eksplisit Administrator setelah status/role/version diverifikasi;
- periode salah ditutup → buka kembali berurutan dengan alasan;
- mismatch Investment → reconciliation lalu correction eksplisit; trade/valuation lama tidak diedit/hard-delete sebagai mekanisme koreksi.

Full restore bukan mekanisme undo harian. Rekening kosong yang dihapus melalui `accounts.deleteUnused` tidak dipulihkan per-item; audit tetap tersedia dan rekening baru dapat dibuat kembali tanpa memalsukan histori.

## Full reset recovery

1. Jangan retry `fullReset.apply` setelah timeout/5xx.
2. Gunakan `fullReset.status` dengan opaque idempotency recovery key yang sama.
3. `committed` → anggap selesai dan jangan kirim intent yang sama.
4. `processing` → tunggu dan periksa status ulang.
5. `not_committed` + maintenance normal → buat preview baru sebelum intent baru.
6. `recovery_required` → jalankan integrity recovery; maintenance hanya boleh dibuka bila check lulus dan `maintenance.recover` tercatat atomik.
7. Untuk mengembalikan data yang sudah di-full-reset, gunakan safety backup terverifikasi melalui workflow Restore; jangan tulis ulang data manual.

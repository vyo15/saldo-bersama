# Kebijakan Penghapusan dan Pemulihan Data

## Tujuan

Kebijakan ini mencegah kehilangan histori, saldo tidak konsisten, dan kesalahan pengguna pada operasi hapus. Istilah **hapus** tidak boleh dipakai sebagai sinonim untuk semua perubahan lifecycle.

## Prinsip wajib

- Data finansial yang pernah berpengaruh pada saldo tidak dihapus permanen.
- Owner tetap tunduk pada validasi backend, authorization deny-by-default, `row_version`, idempotency, transaction database, dan audit append-only.
- Frontend tidak boleh menganggap operasi berhasil sebelum server mengonfirmasi commit.
- Preview hanya membantu pengguna; backend selalu membaca ulang kondisi terbaru saat apply.
- Audit, rekonsiliasi, penutupan periode, backup, dan histori restore tidak boleh dihapus dari UI harian.
- Purge umum dinonaktifkan. Tidak tersedia action SQL delete bebas atau cascade delete dari frontend.

## Matrix lifecycle

| Entity | Tindakan normal | Pemulihan | Permanent delete |
|---|---|---|---|
| Transaksi termasuk transfer | Batalkan dengan alasan | Owner dapat memulihkan transaksi cancelled yang aman | Dilarang |
| Movement kantong/target | Reverse dengan alasan | Histori original + reversal dipertahankan | Dilarang |
| Rekening | Arsipkan bila pernah dipakai | Owner dapat mengaktifkan kembali | Hanya `accounts.deleteUnused` bila seluruh histori/dependensi = 0 |
| Kategori | Arsipkan bila pernah dipakai | Owner dapat mengaktifkan kembali | Hanya `categories.deleteUnused` bila transaksi/recurring/budget semua status = 0 |
| Kantong/envelope rule | Arsipkan bila pernah dipakai | Owner dapat memulihkan rule | Hanya `envelopes.deleteUnusedRule` bila hanya ada satu initial empty period dan tidak ada transaksi/movement/budget/closed history |
| Tagihan rutin/recurring rule | Arsipkan bila pernah dipakai | Owner dapat memulihkan rule | Hanya `recurring.deleteUnusedRule` bila semua child hanyalah future generated projections yang belum pernah materialized/paid/skipped/cancelled |
| Target tabungan | Arsipkan bila pernah dipakai | Owner dapat memulihkan goal | Hanya `goals.deleteUnused` bila saldo progres = 0 dan tidak ada movement/transaksi semua status |
| Anggaran | Arsipkan bila pernah menjadi histori planning | Owner dapat memulihkan budget | Hanya `budgets.deleteUnused` bila tidak ada transaksi terkait dan tidak ada histori period closure |
| Anggota | Nonaktifkan | Reaktivasi eksplisit setelah allowlist diverifikasi | Dilarang dari UI harian |
| Periode | Tutup | Buka kembali berurutan dengan alasan | Dilarang |
| Audit dan rekonsiliasi | Tambah record koreksi baru | Tidak berlaku | Dilarang |

## Pengecualian: hapus permanen master/config yang benar-benar belum dipakai

Owner boleh menghapus row rekening hanya bila **seluruh** kondisi berikut benar pada pemeriksaan ulang backend:

1. Rekening masih berstatus aktif dan `row_version` cocok.
2. Saldo awal tepat Rp0.
3. Saldo saat ini yang dihitung dari ledger tepat Rp0.
4. Tidak pernah memiliki transaksi dalam status apa pun, termasuk cancelled.
5. Tidak pernah atau sedang direferensikan kantong, tagihan rutin, atau target.
6. Tidak pernah memiliki rekonsiliasi.
7. Actor adalah owner yang terverifikasi.
8. Alasan wajib diisi.
9. Owner mencentang pernyataan pemahaman.
10. Owner mengetik frasa `HAPUS REKENING <NAMA REKENING>` secara persis.
11. Request menggunakan idempotency key dan dijalankan dalam transaction database.

Jika satu syarat gagal, `accounts.deleteUnused` harus ditolak. Rekening yang pernah dipakai hanya boleh mengikuti aturan arsip.

Audit penghapusan tetap disimpan dan minimal mencatat ID lama, snapshot aman sebelum delete, alasan, actor dari session backend, timestamp server, dependency count, request ID, dan bahwa audit dipertahankan. Untuk rekening, nomor rekening penuh tidak boleh masuk audit dan snapshot tetap dimask.

### Guard universal `deleteUnused`

Semua action `deleteUnused` wajib memenuhi aturan berikut:

1. Actor adalah owner yang berasal dari session backend.
2. Record masih aktif dan `row_version` yang dikirim client cocok.
3. Frontend hanya menampilkan keputusan server-side lifecycle preview; frontend tidak menentukan sendiri apakah record unused.
4. Apply membaca ulang record dan seluruh dependency di dalam write transaction sebelum hard delete.
5. **Histori semua status dihitung**, termasuk cancelled, reversed, archived, skipped, completed, closed, atau status historis lain sesuai domain. Record yang pernah dipakai tidak pernah kembali eligible untuk hard delete.
6. Alasan wajib diisi. Rekening memakai acknowledgement + exact typed phrase + countdown; kantong/recurring/target memakai acknowledgement; kategori/anggaran memakai reason + explicit confirm.
7. Mutation memakai idempotency key yang sama untuk retry intent yang sama.
8. Audit append-only ditulis dalam transaction yang sama dengan delete dan menyimpan before snapshot yang aman.
9. `rowsAffected` harus tepat satu untuk row utama; stale version atau dependency yang berubah menghasilkan conflict/validation error, bukan silent success.
10. Hard delete individual tidak memerlukan full backup karena hanya diperbolehkan pada entity yang terbukti belum menjadi histori; backup tetap wajib untuk migration/import besar/full restore.

### Derived child yang bukan histori

Kantong dan recurring mempunyai child yang dapat tercipta otomatis. Child tersebut tidak otomatis dianggap histori:

- envelope rule baru boleh menghapus **satu initial empty period** bersamaan dengan rule bila tidak ada transaksi, movement, budget, reserved amount, closed/archived period, atau histori lain;
- recurring rule boleh membersihkan **future generated projections yang reproducible** hanya bila status masih `expected`, `actual_amount=0`, tidak mempunyai transaction link, belum menjadi keputusan user seperti cancelled/skipped, dan bukan occurrence masa lalu. Paid/partial/past/cancelled/linked occurrence selalu memblokir hard delete rule.

### Global destructive-SQL allowlist

`test/governance/data-deletion-policy.test.js` adalah guard arsitektur wajib. Semua `DELETE FROM` production API harus cocok dengan inventaris exact path/table yang disetujui. `transactions`, `audit_log`, movement finansial, rekonsiliasi, dan period closure tidak boleh memperoleh normal business hard-delete. Controlled full restore dan technical cleanup ephemeral hanya boleh pada path yang sudah di-allowlist. Migration SQL dan operational scripts tidak boleh menjadi jalur hard-delete/`DROP TABLE`/`TRUNCATE` produksi. DELETE baru yang tidak terdaftar harus membuat CI gagal.

## Pemulihan per item

### Master/config yang diarsipkan

Owner dapat memulihkan rekening, kategori, kantong, recurring rule, goal, atau budget yang diarsipkan melalui workflow domain/arsip yang tersedia. Backend wajib memeriksa versi terbaru, duplicate, status pemilik, dan constraint lain sebelum mengaktifkan kembali data.
Master/config yang diarsipkan tidak boleh dipakai untuk transaksi atau workflow baru. Jika histori aktif perlu dikoreksi dan validasinya membutuhkan master aktif, owner harus memulihkan master tersebut terlebih dahulu, melakukan koreksi guarded, lalu mengarsipkannya kembali bila masih diperlukan.

### Transaksi cancelled

Owner hanya dapat memulihkan transaksi bila periode masih terbuka, rekening/kategori masih valid, transaksi tidak terhubung workflow recurring/goal, tidak menciptakan duplicate, dan saldo proyeksi tetap valid. Transaksi linked harus dikoreksi melalui workflow domain asal.

### Anggota nonaktif

Reaktivasi harus memakai action eksplisit. Email dan role wajib masih cocok dengan `ALLOWED_USERS_JSON`; `users.upsert` tidak boleh secara diam-diam mengaktifkan pengguna lama.

## Tingkat konfirmasi UI

- **Reversible ringan:** ringkasan dampak dan label tindakan spesifik.
- **Berdampak finansial:** nominal/entity terlihat, alasan wajib, dan tombol tidak menjadi fokus awal.
- **Tidak dapat dibatalkan atau mengunci data:** typed confirmation, acknowledgement, countdown, preview server, dan validasi ulang saat apply.

Aksi berbahaya tidak boleh hanya berupa ikon tanpa label pada konteks mobile. Tombol harus menyebut tindakan dan entity, misalnya `Hapus permanen rekening ATM BCA`.

## Concurrency dan kegagalan

- Preview yang kedaluwarsa atau versi lama tidak memberi hak untuk apply.
- Jika data berubah pada perangkat lain, backend menolak dengan conflict; frontend mempertahankan item dan meminta refresh.
- Retry memakai idempotency key yang sama agar tidak menggandakan operasi atau audit.
- Destructive write tidak boleh dilakukan saat offline.
- Error tidak boleh menampilkan stack trace, secret, query, atau internal path.

## Operasi yang dilarang

- Hard delete transaksi, audit, rekonsiliasi, atau histori periode.
- SQL manual untuk membersihkan data produksi tanpa maintenance plan yang disetujui.
- Generic purge dari UI harian.
- Menghapus data berdasarkan saldo yang dikirim client.
- Menghapus audit bersama entity.
- Menghilangkan item secara optimistic sebelum respons sukses server.
- Full database restore untuk kesalahan satu item yang dapat dipulihkan melalui lifecycle normal.

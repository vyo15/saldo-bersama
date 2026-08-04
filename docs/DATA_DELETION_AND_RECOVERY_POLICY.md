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
| Transaksi | Batalkan dengan alasan | Owner dapat memulihkan transaksi cancelled yang aman | Dilarang |
| Rekening pernah dipakai | Arsipkan | Owner dapat mengaktifkan kembali | Dilarang |
| Rekening belum pernah dipakai | Arsipkan atau hapus terbatas | Arsip dapat dipulihkan; hasil hard delete tidak dipulihkan per item | Hanya sesuai pengecualian rekening kosong |
| Kategori | Arsipkan | Owner dapat mengaktifkan kembali | Dilarang |
| Anggaran, tagihan, target, kantong | Arsipkan/tutup/reverse sesuai domain | Melalui workflow domain | Dilarang |
| Anggota | Nonaktifkan | Reaktivasi eksplisit setelah allowlist diverifikasi | Dilarang |
| Periode | Tutup | Buka kembali berurutan dengan alasan | Dilarang |
| Audit dan rekonsiliasi | Tambah record koreksi baru | Tidak berlaku | Dilarang |

## Pengecualian: hapus permanen rekening belum dipakai

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

Audit penghapusan tetap disimpan dan minimal mencatat ID lama, data rekening yang sudah dimask, alasan, actor dari session backend, timestamp server, saldo awal, saldo terakhir, dependency count, request ID, dan bahwa audit dipertahankan. Nomor rekening penuh tidak boleh masuk audit.

## Pemulihan per item

### Rekening dan kategori arsip

Owner dapat memulihkan satu item melalui halaman Pengaturan → Arsip dan pemulihan. Backend wajib memeriksa versi terbaru, duplicate, status pemilik, dan constraint lain sebelum mengaktifkan kembali data.

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

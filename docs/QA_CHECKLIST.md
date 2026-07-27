# QA Checklist

## Quality gate otomatis

```bash
npm run check
```

Catat command, exit code, dan bagian yang belum dapat dijalankan. Jangan menyatakan build/lint/test berhasil tanpa eksekusi nyata.

## Ledger dan integritas

- [ ] Nominal nol, negatif, desimal, NaN, Infinity, dan terlalu besar ditolak.
- [ ] Tanggal semu seperti 31 Februari ditolak.
- [ ] Refund memerlukan rekening tujuan dan tidak salah memerlukan rekening sumber.
- [ ] Transfer sumber=tujuan ditolak.
- [ ] Transfer tidak masuk income/expense total.
- [ ] Saldo frontend dan backend konsisten untuk income, expense, transfer, refund, dan adjustment.
- [ ] Pembatalan menghitung ulang saldo dan sisa kantong.
- [ ] Rekening/kategori arsip tidak dapat dipakai untuk transaksi baru.
- [ ] Formula `= + - @` dinetralkan.
- [ ] Duplicate submit memakai idempotency key yang sama.
- [ ] Deteksi transaksi mirip tidak diam-diam membuat duplikat.
- [ ] Edit versi lama ditolak dengan conflict.
- [ ] Member hanya dapat edit/cancel transaksi miliknya sesuai policy.
- [ ] Dua write bersamaan diserialisasi LockService.
- [ ] Periode tertutup menolak perubahan.
- [ ] Pengeluaran tanpa kantong masuk antrean review.
- [ ] Integrity check mendeteksi ID duplikat, referensi hilang, owner hilang, dan over-allocation.

## Alokasi, budget, dan recurring

- [ ] Alokasi tidak melebihi dana belum dialokasikan.
- [ ] Periode aturan yang sama tidak boleh overlap.
- [ ] Harian, mingguan, dua mingguan, bulanan, periode gajian, dan custom menghasilkan rentang benar.
- [ ] Sisa/rollover tidak dihitung sebagai pemasukan.
- [ ] Mutasi kantong tidak mengubah total kekayaan.
- [ ] Over-budget memerlukan alasan sesuai policy.
- [ ] Daily, weekly, biweekly, monthly, bimonthly, quarterly, semiannual, dan annual menghasilkan occurrence yang benar.
- [ ] Occurrence overdue dihitung dari tanggal aktual, bukan status stale.
- [ ] Pembayaran sebagian dan pelunasan terhubung ke transaksi aktual.

## Auth dan security

- [ ] Hanya akun allowlist dapat membuat session.
- [ ] Email belum terverifikasi ditolak.
- [ ] Role Vercel dan sheet `Users` yang berbeda ditolak.
- [ ] Owner terakhir tidak dapat dinonaktifkan atau diturunkan tanpa pengganti.
- [ ] Member tidak dapat menjalankan action owner.
- [ ] Request POST tanpa Origin ditolak.
- [ ] Origin asing ditolak.
- [ ] Cookie HttpOnly, SameSite=Strict, dan Secure pada non-development.
- [ ] Apps Script menolak HMAC salah, timestamp lama, dan nonce replay.
- [ ] Error tidak menampilkan stack trace, secret, Spreadsheet ID, atau internal path.
- [ ] Rate limit dan batas payload menghasilkan error terkontrol.

## Human error

- [ ] Preview rupiah jelas sebelum simpan.
- [ ] Saldo tidak cukup ditolak jika rekening tidak mengizinkan minus.
- [ ] Transaksi mirip memerlukan konfirmasi eksplisit.
- [ ] Over-budget memerlukan alasan.
- [ ] Pembatalan memerlukan alasan.
- [ ] Salah periode/jatah ditolak.
- [ ] Draft offline tidak mengubah saldo maupun sisa kantong.
- [ ] Tombol simpan disabled selama request.
- [ ] Retry timeout memakai idempotency key yang sama.

## Integrasi dan recovery

- [ ] Calendar event tidak duplikat dan hanya event aplikasi yang diubah.
- [ ] Calendar gagal tidak membatalkan transaksi.
- [ ] Push tidak menampilkan nominal/rincian sensitif.
- [ ] Push gagal tidak membatalkan pencatatan.
- [ ] Subscription invalid dapat dinonaktifkan/dibersihkan.
- [ ] Backup harian dijalankan oleh trigger dan nama file unik.
- [ ] Backup berstatus verified hanya setelah schema tervalidasi.
- [ ] Import preview menampilkan invalid, duplicate, referensi hilang, dan dampak data.
- [ ] Import gagal melakukan rollback safety backup.
- [ ] Restore membutuhkan preview token, frasa konfirmasi, safety backup, maintenance, dan integrity check.
- [ ] Restore drill dilakukan pada DEV sebelum production.
- [ ] Retensi backup tidak menghapus backup manual.

## UX, responsive, dan accessibility

- [ ] Keyboard navigation, focus trap, label, error field, kontras, dan tap target.
- [ ] Mobile 320px, 375px, tablet, laptop, dan desktop lebar.
- [ ] Loading, empty, error, offline, unauthorized, conflict, maintenance, dan stale-data state.
- [ ] Grafik memiliki ringkasan teks.
- [ ] Status tidak dibedakan hanya melalui warna.
- [ ] Data sensitif tidak muncul di URL, metadata, title, push, atau Calendar.

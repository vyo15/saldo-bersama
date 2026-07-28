# QA Checklist

## Quality gate otomatis

```bash
npm run check
```

Catat command, exit code, dan bagian yang belum dapat dijalankan. Jangan menyatakan build/lint/test berhasil tanpa eksekusi nyata.

- [ ] `check-apps-script-syntax.mjs` memuat seluruh file dalam shared runtime pada urutan alfabet dan terbalik.
- [ ] Setelah seluruh source ditempel, dropdown editor menampilkan `setupSaldoBersama`, `doGet`, dan `doPost` tanpa startup error.
- [ ] Setup memperoleh lock, menghasilkan `SETUP_STATUS=ready`, dan hanya selesai setelah schema tervalidasi.
- [ ] Setup parsial menghasilkan `SETUP_STATUS=failed`; deployment dihentikan sampai root cause selesai.

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
- [ ] `ALLOWED_USERS_JSON` menolak email invalid, role selain `owner`/`member`, dan duplikat email dengan role konflik.
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

## Environment dan secret

- [ ] `.env.example` hanya berisi placeholder; tidak ada `.env`, token, client secret, private key, atau secret nyata di Git/ZIP.
- [ ] `VITE_` hanya digunakan untuk konfigurasi browser yang memang publik.
- [ ] `SESSION_SECRET` dan `INTERNAL_SHARED_SECRET` berbeda dan minimal 32 karakter.
- [ ] `INTERNAL_SHARED_SECRET` pada Vercel sama persis dengan Script Properties Apps Script.
- [ ] `ALLOWED_ORIGINS` berisi origin exact tanpa wildcard atau slash akhir.
- [ ] `APPS_SCRIPT_WEB_APP_URL` memakai deployment `/exec`, bukan `/dev` atau URL editor.

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

## Hardening behavior tests

- [ ] Restore preview tetap berjalan ketika sheet aktif hilang.
- [ ] Backup dari household/owner lain ditolak.
- [ ] Restore schema-rusak memakai idempotency Script Properties dan key yang sama.
- [ ] Apply utama gagal selalu mencoba rollback safety.
- [ ] Rollback gagal mempertahankan maintenance dan `recovery_required`.
- [ ] Audit gagal mengompensasi create/update; compensation gagal mengunci aplikasi.
- [ ] Pembayaran recurring/mutasi goal tidak meninggalkan audit sukses prematur saat rollback.
- [ ] Linked transaction hanya dapat dibatalkan melalui modul asal.
- [ ] Export CSV/XLSX menetralkan formula dan tidak menyertakan token/subscription/idempotency internal.
- [ ] Integrity check memeriksa seluruh referensi lintas sheet dan over-allocation per rekening.
- [ ] Notification `no_subscription`/`failed` dapat diantrekan ulang setelah kondisi membaik.

# Matriks implementasi

| Fase | Hasil di source | Status |
| --- | --- | --- |
| 0 — Keputusan | Ledger tunggal, role Owner/Member, jatah, buffer, saldo aman, tutup buku | Selesai |
| 1 — Audit base | Pola token, React, responsive, bottom nav, feedback state dipertahankan; domain katalog lama dilepas | Selesai |
| 2 — Foundation | React + Vite, responsive shell, PWA manifest, service worker, dan dark mode | Selesai |
| 3 — Authentication | Login Google client, verifikasi Firebase JWT, email verified, unauthorized state, Apps Script allowlist dan role gate | Selesai di source; perlu kredensial |
| 4 — Backend & Sheets | 21 sheet, schema guard, HMAC, nonce, LockService, idempotency, audit | Selesai |
| 5 — Ledger | Pemasukan, pengeluaran, transfer, refund/adjustment calculation, soft cancel, rekonsiliasi UI | Selesai |
| 6 — Alokasi & jatah | Kantong, harian/mingguan/bulanan, sisa, status, mutasi, rollover workflow | Selesai |
| 7 — Rutin | Rules/occurrences, pembayaran sebagian, due/paid, pemasukan terencana dipisahkan | Selesai di schema/UI |
| 8 — Buffer & target | Buffer bertingkat, sinking fund, tabungan, dana darurat, kontribusi sebagai transfer | Selesai |
| 9 — Dashboard & laporan | Saldo aman, KPI, pertumbuhan keuangan, kategori, pengeluaran kecil | Selesai |
| 10 — Calendar & notifikasi | Calendar sync guard, PWA receiver, izin perangkat, preferensi per jenis, quiet hours Jakarta tanpa menghabiskan retry | Connector selesai; VAPID perlu kredensial |
| 11 — Backup & recovery | Backup Drive, preview restore bertoken, maintenance, safety backup, integrity verification, rollback otomatis, audit kritis | Selesai di source; restore drill wajib di DEV |
| 12 — Hardening | Formula guard, saldo minus, duplicate/high amount confirmation, conflict, accessibility | Selesai dan diuji |
| 13 — Uji berdua | Checklist simulasi dan restore drill | Menunggu akun/resource DEV pengguna |

## Batas yang disengaja

- Demo tidak menyimpan data finansial ke browser sebagai source of truth.
- Penggunaan data nyata diblokir secara prosedural sampai connector dikonfigurasi.
- Calendar dan push bersifat non-blocking terhadap ledger.
- Hard delete transaksi/rekening berhistori tidak tersedia.
- Restore wajib melewati preview bertoken dan frasa konfirmasi; token kedaluwarsa
  dalam 10 menit serta tidak dapat dipakai oleh pengguna lain.

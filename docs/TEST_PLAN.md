# Test plan

## Otomatis

`npm run check` memeriksa:

- lint source;
- rumus saldo rekening;
- transfer internal;
- sisa alokasi;
- parsing integer rupiah;
- saldo minus;
- duplikasi;
- formula injection;
- kelengkapan sheet;
- keberadaan lock, idempotency, row version, HMAC, dan replay guard;
- kebersihan istilah domain lama;
- production build dan artifact hosting.

## Integration pada DEV

1. Firebase token valid, expired, issuer salah, audience salah.
2. Email belum verified dan akun di luar allowlist.
3. Owner vs Member.
4. HMAC salah, timestamp lewat, nonce dipakai ulang.
5. Dua write bersamaan dan lock timeout.
6. Retry dengan `request_id` sama.
7. Edit dengan `row_version` lama.
8. Sheet hilang/header berubah.
9. Rekening/kategori/kantong arsip.
10. Periode sudah ditutup.
11. Calendar API gagal dan retry.
12. Backup Drive gagal/quota habis.

## E2E berdua

1. Owner mencatat pemasukan.
2. Dana masuk ke belum dialokasikan.
3. Owner membagi ke tagihan, jatah, buffer, target.
4. Member mencatat pengeluaran kecil melalui HP.
5. Perangkat kedua melihat pembaruan.
6. Double tap simpan tidak menggandakan transaksi.
7. Transfer tabungan tidak menambah pengeluaran.
8. Pembayaran sebagian memperbarui occurrence.
9. Rekonsiliasi tunai menemukan selisih.
10. Rollover membuat mutasi alokasi.
11. Tutup buku menolak transaksi periode lama.
12. Backup, restore DEV, dan integrity check lulus.

## Behavioral Apps Script di Node VM

Test otomatis benar-benar mengeksekusi service `.gs` menggunakan fake kecil untuk Spreadsheet/Lock/Cache/Properties. Cakupan minimum:

- adjustment positif dan envelope update exclude-current;
- close → reopen → close;
- idempotency payload mismatch, expiry, dan commit failure;
- restore apply failure, rollback failure, owner backup, schema missing, dan recovery idempotency;
- audit compensation;
- recurring/goal reverse dan linked-ledger guard;
- push `sent=0`, backup retention, external cleanup;
- checksum isi dan strict boolean/enumeration.

Source matching tetap dipakai hanya untuk boundary/action parity, bukan sebagai pengganti test perilaku.

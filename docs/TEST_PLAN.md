# Test plan

## Otomatis

```bash
npm run check
```

Mencakup:

- source tree canonical dan secret/dependency exclusion;
- ESLint, Node syntax, Apps Script syntax dan boot dua urutan;
- saldo, transfer, rupiah integer, tanggal, formula injection;
- ownership helper frontend;
- allowlist/role/origin/session/rate guard;
- Apps Script startup, init owner-before-schema, lock, idempotency, row version;
- personal isolation rekening/transaksi/dashboard/recurring/budget/goal/notification/Calendar;
- transfer/envelope ownership consistency;
- pagination/total server-side dan request cache;
- recurring/goal reversal dan compensation;
- recurring pay dan goal move dengan implementasi `createTransaction_` aktual serta linkage internal;
- period lock kumulatif, reopen latest-first, historical as-of, dan snapshot fingerprint;
- mixed global/account envelope availability serta duplicate/reactivation budget;
- import/restore rollback/fail-closed;
- migration v2 safety/confirmation/rollback guard;
- production build.

## Integration DEV

1. Firebase token valid, expired, issuer/audience salah, email unverified.
2. Akun allowlist owner/member dan akun asing.
3. HMAC salah, timestamp lama, nonce replay.
4. Connector missing, unreachable, invalid response, timeout.
5. Dua write bersamaan dan lock timeout.
6. Retry idempotency key sama; payload berbeda harus conflict.
7. Edit `row_version` lama.
8. Schema/header/version rusak dan maintenance/recovery.
9. Account/category/archive/period closure.
10. Calendar/Push/Drive gagal tanpa merusak ledger.

## E2E dua akun

1. Owner membuat rekening shared dan personal.
2. Member hanya melihat shared serta personal miliknya.
3. Transaksi personal owner tidak masuk dashboard/report/notification member.
4. Transfer lintas shared/personal dan antar personal owner berbeda ditolak.
5. Envelope, recurring, budget, dan goal mengikuti ownership referensi.
6. Create/edit/cancel income/expense dan transfer valid.
7. Double submit menghasilkan satu mutasi.
8. Reconciliation dan period close/reopen.
9. Recurring partial/pay/reverse.
10. Goal move/reverse.
11. Offline/error/unauthorized/conflict/maintenance state.
12. Responsive, keyboard, focus, labels, contrast, chart summary.
13. Tutup dua bulan berurutan; buka bulan lama lebih dahulu harus ditolak, lalu buka dari bulan paling akhir.
14. Bandingkan laporan historis, snapshot closure, recurring overdue, dan progress goal terhadap ledger manual.

## Migration DEV

1. Copy schema v1 dengan data uji.
2. Preview menunjukkan hitungan shared/personal dan `ambiguous=0`.
3. Data referensi hilang/personal tanpa owner menghasilkan `MIGRATION_OWNERSHIP_AMBIGUOUS` sebelum backup/apply.
4. Safety backup tervalidasi.
5. Migration sukses menghasilkan schema v2 dan integrity bersih.
6. Simulasi apply gagal menghasilkan rollback v1 terverifikasi.
7. Simulasi rollback gagal menghasilkan `RECOVERY_REQUIRED` dan maintenance tetap aktif.

## Recovery DEV

- Restore preview tetap bekerja saat sheet aktif hilang.
- Backup owner/household lain ditolak.
- Apply gagal selalu mencoba rollback.
- Rollback gagal mempertahankan lock recovery.
- Manual recovery memverifikasi owner dari safety backup.
- Import dan restore tidak dinyatakan sukses sebelum checksum/schema/integrity lulus.

Catat command, environment, exit code, dan bukti manual. Jangan menyatakan lulus untuk test yang tidak dijalankan.

## Regression performance

1. Render provider dalam React Strict Mode; verifikasi satu `session.read` dan satu `app.initialState` di Network.
2. Jalankan dua read identik bersamaan; verifikasi satu fetch dan hasil sama.
3. Batalkan satu subscriber; subscriber lain tetap memperoleh hasil.
4. Ulangi route read dalam TTL; verifikasi memory cache dan tidak ada persistence browser.
5. Invalidasi action; request berikutnya wajib menuju server.
6. Ganti session scope owner ke member; cache lama tidak boleh terbaca.
7. Simpan transaksi; ledger dan overview berubah tanpa reload bootstrap.
8. Ubah rekening/kategori; master, overview, dan page resources konsisten.
9. Simulasikan refresh gagal setelah data tersedia; data lama tetap tampil dengan warning.
10. Rusakkan header pada DEV; cache positif berakhir dan `SCHEMA_INVALID` muncul, sedangkan write tidak pernah memakai cache schema read.
11. Cari request ID di API dan Apps Script; bandingkan `stageTimings` untuk schema/route.
12. Catat `sheetMetrics` dan benchmark dataset DEV 1.000, 5.000, dan 10.000 transaksi untuk `app.initialState`, `transactions.list`, `reports.monthly`, `envelopes.list`, dan `integrity.run`.

## Regression theme dan modal

1. Bandingkan light/dark pada semua breakpoint target.
2. Uji keyboard-only: buka modal, isi field, buka detail tambahan, submit, tutup, dan pastikan fokus kembali.
3. Uji overspend error membuka detail tambahan secara otomatis.
4. Uji modal pada tinggi viewport pendek; header/footer dan tombol submit tetap dapat diakses.
5. Uji reduced motion, focus-visible, contrast teks/helper/border, dan zoom 200%.
6. Uji input tanggal dengan locale browser berbeda; nilai ISO tetap benar dan helper Indonesia sesuai.

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

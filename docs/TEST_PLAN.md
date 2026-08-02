# Test Plan

## Otomatis

```bash
npm run validate:source
npm run lint
npm run test
npm run build
npm run check
```

Cakupan wajib:

- schema STRICT, FK, integer Rupiah, ownership, bentuk transaksi, cancellation metadata, dan saldo awal negatif;
- income/expense/transfer/refund/adjustment;
- saldo historis per urutan transaksi, termasuk saldo minus sementara pada hari yang sama dan edit yang mempertahankan `created_at`;
- row-version conflict dan idempotency replay;
- personal/shared authorization dan IDOR;
- recurring, envelope, budget, goal, reconciliation, close/reopen period;
- read snapshot consistency, maintenance recheck, outbox coalescing, stale worker lock ownership, scheduler replay guard, dan duplicate Calendar prevention;
- formula injection dan valid XLSX;
- backup checksum, preview expiry, safety backup, rollback restore, identity conflict, current allowlist precedence, dan push credential exclusion;
- service worker tanpa API cache dan tanpa offline write queue.

## Manual

Uji dua browser/perangkat dengan owner dan member:

1. Login/logout dan redirect route.
2. Edit record yang sama untuk memastikan 409 conflict jelas.
3. Double-click/retry menggunakan idempotency yang sama.
4. Putus jaringan sebelum write; UI harus menolak tanpa menyatakan sukses.
5. Install PWA iPhone/Android, update app shell, push notification.
6. Sinkronisasi Sheets dan Calendar, termasuk failure/retry.
7. Export Excel dan periksa formula-like input.
8. Backup/restore drill pada DEV.
9. Responsive, keyboard, focus, contrast, loading/empty/error/unauthorized/maintenance.

Tidak boleh mengklaim production-ready hanya berdasarkan unit test; real resource integration dan migration parity wajib lulus.

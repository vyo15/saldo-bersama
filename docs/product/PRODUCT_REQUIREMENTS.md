# Product Requirements

## Tujuan

Saldo Bersama adalah aplikasi keuangan privat untuk dua akun Google agar pencatatan personal dan bersama cepat, konsisten lintas perangkat, dapat diaudit, dan dapat dipulihkan.

## Pengguna

- Owner: mengelola anggota, master data, maintenance, backup/restore, dan operasi administratif.
- Member: memakai fitur finansial sesuai scope dan ownership yang diizinkan.

## Invariant produk

- `REQ-FIN-001` Nominal Rupiah disimpan sebagai integer.
- `REQ-FIN-002` Saldo dihitung dari saldo awal dan transaksi aktif; tidak boleh diedit bebas.
- `REQ-FIN-003` Transfer mengurangi sumber dan menambah tujuan, tetapi tidak masuk total income/expense.
- `REQ-FIN-004` Transaksi normal menggunakan soft cancel/archive, bukan hard delete.
- `REQ-FIN-005` Write penting memakai idempotency dan audit append-only.
- `REQ-FIN-006` Edit record yang versionable menolak stale `row_version`.
- `REQ-SEC-001` Firebase identity diverifikasi server dan authorization default deny.
- `REQ-SEC-002` Data personal hanya dapat diakses owner data tersebut atau owner role sesuai service rule.
- `REQ-DATA-001` Turso adalah source of truth; Sheets hanya mirror satu arah.
- `REQ-DATA-002` Import/restore memakai preview, safety backup, apply guarded, dan integrity verification.
- `REQ-OFFLINE-001` Write finansial offline ditolak; browser tidak membuat queue write.
- `REQ-AUDIT-001` Perubahan penting memiliki actor server-side, timestamp, action, entity, dan before/after yang aman.
- `REQ-UX-001` UI menyediakan loading, empty, error, offline, unauthorized, maintenance, dan conflict state.
- `REQ-A11Y-001` Form berlabel, keyboard accessible, focus visible, kontras dan tap target memadai.

## Fitur MVP aktif

Login Google allowlist, dashboard saldo, rekening/kategori, transaksi income/expense/transfer/refund/adjustment, filter/edit/cancel, alokasi/kantong, recurring/tagihan, budget, target, rekonsiliasi, laporan bulanan, audit, XLSX, backup/restore guarded, mirror/Calendar, PWA dan push.

## Non-functional

- Privasi: data finansial tidak dikirim ke analytics/tracker tanpa approval.
- Integrity: transaction database, foreign key, constraint, idempotency, version conflict.
- Performance: read penting terfilter/cached; tidak membaca seluruh database pada setiap interaksi.
- Recovery: backup terverifikasi, integrity check, dan runbook.
- Traceability: requirement, action, schema, test, decision, dan release memiliki source canonical.

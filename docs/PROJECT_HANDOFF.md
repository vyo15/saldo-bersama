# Project Handoff

**Updated:** 2026-08-02  
**Task:** Merge patch product-control dan CI browser public environment  
**Status:** Kedua patch sudah tergabung tanpa konflik; validasi source/test dijalankan pada hasil merge, sedangkan full Node 24 lint/build/browser smoke tetap wajib di komputer project.

## Source yang divalidasi

- Baseline utama: `saldo-bersama-clean(89).zip`
- Patch digabung: `saldo-bersama-clean-87-product-control(1).zip` dan `saldo-bersama-ci-browser-public-env-fix-87(1).zip`
- Root: `saldo-bersama/`
- Stack terkait: React/Vite PWA, Vercel Functions, Turso schema v3, Firebase session, Apps Script bridge.
- Path utama: `finance.js`, reporting/planning services, `notifications.js`, `jobs.js`, transaction/report/dashboard/goal UI, product/API/data docs, RFC, dan tests.

## Hasil merge

- Seluruh perubahan product-control, requirement traceability, filter/laporan/alert/notifikasi, enam RFC Proposed, dan perbaikan OIDC tetap terbawa.
- Hotfix GitHub Actions untuk public Vite fixture, deterministic Google Identity Services mock, fail-fast browser smoke, serta governance guard tetap terbawa.
- Konflik dokumentasi pada `CHANGELOG.md` dan `docs/TEST_PLAN.md` digabung manual agar kedua riwayat tidak saling menimpa.
- Tidak ada file root `PATCH_SUMMARY.md` dari patch parsial yang dimasukkan ke source canonical.

## Implementasi runtime

1. Filter transaksi server-side dan UI: rekening, kategori, pencatat, jenis, alokasi, query, periode, pagination.
2. Filter options berasal dari transaksi yang lolos scope backend; tidak mengandalkan option frontend untuk authorization.
3. Laporan menambah tren 3/6/12 bulan, cash-flow net, total saldo bulanan, expense per rekening/nature/pencatat.
4. Aktivitas pencatatan diberi label eksplisit bukan kontribusi atau penanggung biaya.
5. Dashboard dan laporan menampilkan alert actionable: budget, kantong, recurring, target, unallocated expense, reconciliation difference/stale.
6. Target menampilkan progress, sisa, kebutuhan setoran bulanan, dan pace status yang dihitung saat read.
7. Scheduled notification queue menambah budget/kantong threshold, goal behind/overdue, dan unallocated expense dengan dedupe idempotent.
8. Bootstrap/sinkronisasi Vercel Development membersihkan token OIDC sementara secara otomatis dan tetap idempotent setelah `vercel link`.

## Dokumentasi dan governance

- 17 kelompok kebutuhan canonical dimasukkan ke `PRODUCT_REQUIREMENTS.md` dan `IMPLEMENTATION_MATRIX.md`.
- API read payload/response, authorization limitation, data turunan, roadmap, status, dan changelog diperbarui.
- RFC-0011 sampai RFC-0016 dibuat sebagai **Proposed**, bukan fitur runtime atau approval schema.
- Governance test menuntut setiap requirement ID terlacak pada implementation matrix.

## Guarded area

Tidak ada perubahan pada:

- migration/schema Turso;
- action name atau role permission;
- saldo/transfer/soft-cancel/idempotency/row-version semantics;
- Firebase auth, nilai secret, dan deployment; script lifecycle environment hanya diperkuat untuk sanitasi OIDC tanpa mengubah daftar key atau scope;
- import/export/backup/restore contract;
- Apps Script bridge contract.

## Test yang dijalankan pada patch

```text
node scripts/validate-source-tree.mjs: PASS — 291 file
node scripts/check-node-syntax.mjs: PASS — 88 file
node scripts/check-apps-script-syntax.mjs: PASS — 6 file, 2 urutan load
npm run test --workspace saldo-bersama-frontend: PASS — 42/42
node scripts/run-backend-tests.mjs: PASS — 104/104
Total automated tests: PASS — 146/146
```

Sandbox memakai Node 22.16.0, sedangkan project menetapkan Node 24.x. `npm ci` sandbox gagal karena registry internal tidak menyediakan tarball `vite-7.3.6.tgz`; lint, build, build budget, dan browser smoke harus diulang pada komputer project.

## Risiko dan keputusan tertunda

- `created_by` tidak boleh dipakai sebagai kontribusi; model split menunggu RFC-0013.
- Draft/receipt/used-by menunggu RFC-0011; utang/piutang menunggu RFC-0012.
- Category hierarchy/goal stage menunggu RFC-0014.
- Privacy granular menunggu RFC-0015 dan wajib backend projection.
- Hak member mengelola planning menunggu keputusan RFC-0016.
- Alert yang baru perlu device/push cadence test agar tidak terasa ramai.
- Secret yang pernah ikut ZIP manual tetap harus dirotasi.

## Next safe step

1. Jalankan `npm ci && npm run check && npm run test:browser` pada Node 24.
2. Smoke test owner/member: filters, reports, alerts, goals, notifications.
3. Review dan putuskan RFC-0016 terlebih dahulu bila pasangan perlu membuat budget/target/rule.
4. Jangan mengimplementasikan RFC schema lain sebelum plan migration/rollback disetujui.

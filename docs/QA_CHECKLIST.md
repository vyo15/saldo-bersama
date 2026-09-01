# QA Checklist

Checklist ini **evergreen**. Detail skenario domain berada di `TEST_PLAN.md`; history patch berada di Git/`CHANGELOG.md`. Jangan menyimpan baseline tanggal lama atau checkbox `[x]` dari patch sebelumnya di file ini.

## 1. Source dan impact

- [ ] Source/ZIP terbaru sudah dibaca dan root project/path aktual disebutkan.
- [ ] `docs/INDEX.md` bagian **Peta perubahan** sudah dipakai untuk menentukan contract, test, dan docs yang relevan.
- [ ] Root cause sudah dibedakan dari symptom/visual workaround.
- [ ] Scope file jelas; area guarded memiliki approval eksplisit.
- [ ] Test existing yang menyentuh area perubahan sudah dicari **sebelum** patch.

## 2. Regression contract

- [ ] Bug/regression memiliki test yang membuktikan behavior/contract yang benar.
- [ ] Test behavior tidak mengunci nama variabel lokal, urutan helper internal, atau bentuk JSX yang bukan contract.
- [ ] Static/source-text assertion hanya digunakan untuk invariant literal: route/dependency/forbidden API/security/architecture.
- [ ] Targeted regression dijalankan setelah implementasi final dan PASS.
- [ ] Tidak ada production code yang diubah hanya untuk memuaskan assertion stale.

## 3. Data integrity dan security

- [ ] Nominal tetap integer Rupiah dan timezone/date contract tidak berubah diam-diam.
- [ ] Transfer tetap netral terhadap total income/expense dan hanya antar rekening valid berbeda.
- [ ] Transfer memvalidasi source/debit sebagai rekening yang dapat dioperasikan actor dan destination sebagai rekening aktif/readable; personal Member → personal pasangan diizinkan dengan ownership transaksi mengikuti source, sedangkan shared → personal oleh Member wajib approval Administrator.
- [ ] Target shared dapat menerima sumber shared/personal actor yang representable tanpa memberi Member akses ke rekening personal pasangan.
- [ ] Mutation tetap memakai validation, idempotency, row-version/concurrency, server confirmation, dan audit canonical sesuai scope.
- [ ] Simulasikan `OUTCOME_UNKNOWN`: retry payload yang sama memakai intent/key yang sama, payload berbeda pada action yang sama diblok, dan form transaksi tidak dapat diedit/didismiss sebelum hasil definitif.
- [ ] Authorization tetap deny-by-default; actor/role/email/audit field dari client tidak dipercaya.
- [ ] Secret/token/raw financial data/raw stack trace tidak masuk frontend, log, fixture, commit, atau ZIP.
- [ ] Delete/import/restore/reset/migration mengikuti preview, backup, confirmation, integrity check, dan audit bila relevan.

## 4. UI/UX dan accessibility

- [ ] Loading, empty, error, offline/unauthorized/conflict state relevan tersedia.
- [ ] Keyboard, focus, label, contrast, reduced motion, tap target, dan responsive breakpoint terdampak diperiksa.
- [ ] Error field form transaksi hilang saat input/dependency sudah diperbaiki tanpa menghapus error lain; perubahan sumber tidak mempertahankan destination transfer yang sudah tidak representable.
- [ ] Pencocokan definitif berakhir pada state completed; Selesai/X/Escape keluar dari create flow dan mismatch menyediakan jalur review transaksi tanpa membuat intent kedua otomatis.
- [ ] Pada mobile: native form control efektif 16px, target interaktif ≥44×44px, safe-area top/bottom, metadata finansial penting ~12px+, keyboard virtual, dan horizontal overflow diperiksa pada viewport relevan.
- [ ] Primary-tab scroll restoration, Back/Forward history restoration, dan true-empty vs filtered/subsection-empty diperiksa bila shell/navigation/collection presentation berubah.
- [ ] Mobile dan desktop tidak drift pada business rule yang sama.
- [ ] Workflow continuation hanya memberi navigasi/prefill; tidak ada auto-submit finansial, duplicate recovery entry point, atau blocker UI yang melampaui contract backend.
- [ ] Device/viewport journey relevan mengikuti skenario manual `TEST_PLAN.md` bila perubahan menyentuh UI/responsive.

## 5. Dokumentasi

- [ ] Contract canonical yang berubah diperbarui pada patch yang sama.
- [ ] `PROJECT_STATUS.md` hanya diubah bila current-state memang berubah.
- [ ] `IMPLEMENTATION_MATRIX.md` hanya diubah bila status Implemented/Partial/Planned atau gap berubah.
- [ ] `TEST_PLAN.md` memuat regression aktif baru; `QA_CHECKLIST.md` tidak diduplikasi dengan detail feature.
- [ ] Tidak ada instruksi lama yang bertentangan dengan source/runtime aktual.

## 6. Automated gate

- [ ] Source validation yang tercakup oleh `npm run verify` PASS.
- [ ] `npm run lint` PASS tanpa warning.
- [ ] `npm run test` PASS.
- [ ] `npm run build` PASS dan build-budget internal pada `npm run verify` PASS.
- [ ] Guarded/data/security regression tercakup oleh frontend/backend suite pada `npm run verify`; targeted domain test tambahan dijalankan bila scope memerlukannya.
- [ ] Trial Reset preview/apply ditolak pada database `production`/`unbound` sebelum side effect; `reset.status` tetap readable untuk recovery.
- [ ] Untuk frontend/user-flow change, manual device QA dicatat bila diperlukan; tidak ada automated browser gate.
- [ ] Final `npm run verify` PASS pada tree yang sama dengan patch yang akan dikirim.

## 7. Artifact hygiene dan delivery

- [ ] `npm run clean` (default dry-run) tidak menunjukkan protected path seperti `.git`, `.vercel`, `.env.local`, atau `node_modules`; penghapusan nyata hanya dengan `npm run clean -- --apply`.
- [ ] Clean source dibuat dengan `npm run zip`, bukan ZIP manual seluruh workspace. PASS menghasilkan `saldo-bersama-clean.zip` secara atomic; failure harus exit non-zero dan tidak membuat archive baru.
- [ ] Clean ZIP tidak memuat `.env.local`, `.git`, `.vercel`, dependency, build/dist, coverage, cache, export/data privat, patch/diff, atau secret. Artifact/`docs/UNVERIFIED_BUILD_REPORT.md` dari workflow lama hanya boleh dipakai sebagai input diagnosis dan tidak dipertahankan pada source canonical hasil remediation.
- [ ] Setelah `npm run verify`, `npm run zip`, atau pre-push selesai baik PASS maupun gagal, generated build/test artifact dibersihkan otomatis; dependency, `.env.local`, `.vercel`, dan repository Git tetap dipertahankan. Cache Vite di `frontend/node_modules/.vite*` boleh dibersihkan karena generated dan akan dibuat ulang.
- [ ] `git status --short` ditinjau sebelum commit.
- [ ] Delivery Git memakai `git push origin main` tanpa `--no-verify`; pre-push memverifikasi ref/SHA aktual + full gate, dan **Quality / check** server-side dipantau setelah push.

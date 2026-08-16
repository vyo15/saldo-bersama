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
- [ ] Mutation tetap memakai validation, idempotency, row-version/concurrency, server confirmation, dan audit canonical sesuai scope.
- [ ] Authorization tetap deny-by-default; actor/role/email/audit field dari client tidak dipercaya.
- [ ] Secret/token/raw financial data/raw stack trace tidak masuk frontend, log, fixture, commit, atau ZIP.
- [ ] Delete/import/restore/reset/migration mengikuti preview, backup, confirmation, integrity check, dan audit bila relevan.

## 4. UI/UX dan accessibility

- [ ] Loading, empty, error, offline/unauthorized/conflict state relevan tersedia.
- [ ] Keyboard, focus, label, contrast, reduced motion, tap target, dan responsive breakpoint terdampak diperiksa.
- [ ] Mobile dan desktop tidak drift pada business rule yang sama.
- [ ] Browser/device journey relevan mengikuti skenario `TEST_PLAN.md`.

## 5. Dokumentasi

- [ ] Contract canonical yang berubah diperbarui pada patch yang sama.
- [ ] `PROJECT_STATUS.md` hanya diubah bila current-state memang berubah.
- [ ] `IMPLEMENTATION_MATRIX.md` hanya diubah bila status Implemented/Partial/Planned atau gap berubah.
- [ ] `TEST_PLAN.md` memuat regression aktif baru; `QA_CHECKLIST.md` tidak diduplikasi dengan detail feature.
- [ ] Tidak ada instruksi lama yang bertentangan dengan source/runtime aktual.

## 6. Automated gate

- [ ] `npm run validate:source` PASS.
- [ ] `npm run lint` PASS tanpa warning.
- [ ] `npm run test` PASS.
- [ ] `npm run build` dan `npm run build:budget` PASS.
- [ ] `npm run test:guard` dijalankan untuk guarded/data/security change.
- [ ] `npm run test:browser` dijalankan untuk frontend/user-flow change.
- [ ] Final `npm run verify` PASS pada tree yang sama dengan patch yang akan dikirim.

## 7. Artifact hygiene dan delivery

- [ ] `npm run clean:dry-run` tidak menunjukkan protected path seperti `.git`, `.vercel`, `.env.local`, atau `node_modules`.
- [ ] Clean source dibuat dengan `npm run zip`, bukan ZIP manual seluruh workspace.
- [ ] Clean ZIP tidak memuat `.env.local`, `.git`, `.vercel`, dependency, build/dist, coverage, cache, export/data privat, patch/diff, atau secret.
- [ ] Setelah `npm run verify`, `npm run zip`, atau pre-push selesai baik PASS maupun gagal, generated build/test artifact dibersihkan otomatis; dependency, `.env.local`, `.vercel`, dan repository Git tetap dipertahankan. Cache Vite di `frontend/node_modules/.vite*` boleh dibersihkan karena generated dan akan dibuat ulang.
- [ ] `git status --short` ditinjau sebelum commit.
- [ ] Pull Request menuliskan test aktual dan docs impact; merge hanya setelah **Quality / check** PASS.

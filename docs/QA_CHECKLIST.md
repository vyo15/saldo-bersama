# QA Checklist

> **Status:** Canonical / evergreen checklist  
> **Purpose:** Checklist manual lintas-domain sebelum delivery.  
> **Update when:** Quality gate atau kategori QA umum berubah.  
> **Boundary:** Detail regression domain berada di `TEST_PLAN.md`; hasil run/history berada di CI/Git/CHANGELOG.

## 1. Source dan impact

- [ ] Source/ZIP terbaru dan root project aktual sudah diverifikasi.
- [ ] `docs/INDEX.md` **Peta perubahan** dipakai untuk menentukan authority docs, source, dan test yang relevan.
- [ ] Root cause dibedakan dari workaround visual/symptom.
- [ ] Guarded/high-risk area memiliki approval yang diperlukan.
- [ ] Test existing yang menyentuh area perubahan sudah dicari sebelum patch.

## 2. Behavior dan regression

- [ ] Bug/regression memiliki test behavior/contract yang relevan bila feasible.
- [ ] Static/source assertion hanya mengunci invariant literal, bukan nama helper/variabel lokal.
- [ ] Targeted regression PASS setelah implementasi final.
- [ ] Perubahan setelah PASS memicu pengulangan gate relevan.
- [ ] Tidak ada production code yang diubah hanya untuk memuaskan test stale.

## 3. Financial integrity dan security

- [ ] Rupiah tetap integer; timezone/currency canonical tidak berubah diam-diam.
- [ ] Transfer tetap netral terhadap income/expense dan memakai source/destination valid.
- [ ] Saldo, Dana Tersedia, Dialokasikan, RDN, dan investasi tidak double-count atau tertukar.
- [ ] Mutation menjaga validation, idempotency, row-version/concurrency, authorization, dan audit sesuai scope.
- [ ] `OUTCOME_UNKNOWN` tidak menghasilkan intent/payload kedua secara diam-diam.
- [ ] Delete/import/restore/reset/migration mengikuti preview/backup/confirmation/integrity policy yang relevan.
- [ ] Secret/token/raw financial data/raw stack trace tidak masuk frontend, log, fixture, commit, atau ZIP.

## 4. Planning dan realtime

- [ ] Alokasi baru tidak meminta budget awal sebagai flow utama; Kebutuhan mengatur funding dari Dana Tersedia sesuai contract.
- [ ] Shortage Kebutuhan menjelaskan total, dana tersedia, dan kekurangan; mutation gagal atomic dan draft tidak hilang.
- [ ] Archive/delete/edit Kebutuhan tidak melepas dana terpakai/dipesan, kebutuhan lain, atau buffer sengaja.
- [ ] Realtime mutation menginvalidasi resource canonical yang benar; device/tab lain tidak perlu hard refresh/restart.
- [ ] Pull-to-refresh memakai Sync Coordinator, tidak memakai `window.location.reload()`, dan tidak menghapus draft/form.
- [ ] Reconnect/foreground/offline recovery tidak memicu duplicate mutation atau refresh ganda yang tidak perlu.

## 5. UI/UX dan accessibility

- [ ] Loading, empty, filtered-empty, error, offline, unauthorized, maintenance, dan conflict state relevan tersedia.
- [ ] Keyboard/focus/label/contrast/reduced-motion/tap target diperiksa pada light dan dark bila terdampak.
- [ ] Mobile control penting ≥44×44px; input text efektif 16px; safe-area, keyboard virtual, dan overflow diperiksa.
- [ ] Nominal utama tidak ellipsis dan hierarchy informasi dapat dipindai tanpa card/panel berulang yang tidak perlu.
- [ ] Modal diuji buka → tutup/batal → buka lagi; Browser Back/focus/body scroll lock tidak stale.
- [ ] True-empty hanya memiliki satu primary next action; filtered-empty menawarkan reset/show-all, bukan membuat entity baru.
- [ ] Detail object dengan sub-item erat memakai section/list hierarchy, bukan tumpukan card setara tanpa kebutuhan.
- [ ] Satu fakta edukatif tidak diulang pada description, helper, card, dan notice di surface yang sama.
- [ ] Warning finansial/destructive/recovery/error/conflict tetap dekat dengan dampaknya dan tidak disembunyikan demi minimalisme.

## 6. Auth, PWA, dan device

- [ ] Production OAuth/session diuji bila auth/session berubah; localhost fallback tidak dianggap evidence Production.
- [ ] PWA update/install/Push diuji pada device relevan bila scope menyentuh PWA/notification.
- [ ] Offline tidak mengizinkan financial write queue.
- [ ] Responsive surface yang berubah diperiksa pada viewport/device target, bukan hanya CSS source.

## 7. Data, operations, dan deployment

- [ ] Schema/binding environment sesuai target; Development dan Production tidak tertukar.
- [ ] Migration/data-sensitive change memiliki backup + integrity evidence sebelum Production.
- [ ] Google bridge/Push/external resource diuji hanya bila scope menyentuh integrasi tersebut.
- [ ] Rollback/forward-fix path jelas untuk perubahan berisiko.

## 8. Dokumentasi

- [ ] Authority doc yang berubah diperbarui pada patch yang sama.
- [ ] `PROJECT_STATUS.md` hanya diubah bila current-state berubah; history tidak ditempel ke snapshot.
- [ ] `IMPLEMENTATION_MATRIX.md` hanya diubah bila status/evidence/gap berubah.
- [ ] `TEST_PLAN.md` memuat regression evergreen, bukan heading tanggal/hardening patch.
- [ ] Dokumen historical tidak dimodernisasi menjadi authority aktif.
- [ ] Tidak ada local Markdown link/orphan active doc atau instruksi lama yang bertentangan dengan source/runtime.

## 9. Full gate dan artifact

- [ ] `npm run verify` PASS pada tree final yang sama dengan artifact/delivery.
- [ ] `npm run lint`, test/build diagnosis tambahan dijalankan bila full gate menunjukkan area spesifik.
- [ ] `npm run clean` dry-run tidak menyentuh path protected.
- [ ] Clean source dibuat dengan `npm run zip`; bila verification gagal, command exit non-zero dan **tidak membuat archive baru**.
- [ ] ZIP tidak memuat `.env.local`, `.git`, `.vercel`, dependency, dist/build, coverage, cache, database/export privat, patch/diff, atau secret.
- [ ] `git status --short` ditinjau sebelum commit/push.
- [ ] Delivery Git tidak memakai `--no-verify`/force push dan GitHub **Quality** dipantau setelah push.

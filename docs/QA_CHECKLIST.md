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
- [ ] Test yang membandingkan path/file source menormalkan separator (`\` vs `/`) agar quality gate tidak berbeda antara Windows/Git Bash dan POSIX.
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
- [ ] Keyboard, focus, label, contrast, reduced motion, tap target, dan responsive breakpoint terdampak diperiksa; focus authored memakai indicator opaque ≥3:1, termasuk setiap endpoint hero/gradient, bukan alpha ring.
- [ ] Semantic foreground/background baru atau berubah diuji pada light **dan** dark. Untuk `rgba()`/soft background, hitung alpha compositing terhadap host surface sebelum menilai rasio; normal text/status/selected state target ≥4.5:1.
- [ ] `theme-color` runtime tetap berasal dari computed `--page`; fallback HTML/manifest tidak drift dari light `--page`.
- [ ] Error field form transaksi hilang saat input/dependency sudah diperbaiki tanpa menghapus error lain; perubahan sumber tidak mempertahankan destination transfer yang sudah tidak representable.
- [ ] Pencocokan definitif berakhir pada state completed; Selesai/X/Escape keluar dari create flow dan mismatch menyediakan jalur review transaksi tanpa membuat intent kedua otomatis.
- [ ] Pada mobile: native form control efektif 16px, target interaktif ≥44×44px, safe-area top/bottom, metadata finansial penting ~12px+, nominal utama tidak ellipsis, keyboard virtual, dan horizontal overflow diperiksa pada viewport relevan; root tidak menyembunyikan overflow horizontal, document scroll tetap aktif, visual scrollbar root tidak terlihat, intentional horizontal scroller tidak menampilkan batang scrollbar, dan hover touch tidak sticky.
- [ ] Primary-tab scroll restoration, Back/Forward history restoration, dan true-empty vs filtered/subsection-empty diperiksa bila shell/navigation/collection presentation berubah.
- [ ] Untuk perubahan navigation/motion: hover/focus/pointer-down internal link memprefetch route tanpa request eksternal, perpindahan route hanya menganimasikan content canvas (shell tetap stabil), loader cepat tidak berkedip, tombol/FAB/nav memberi pressed feedback, dan reduced-motion menghapus travel non-esensial.
- [ ] True-empty hanya memiliki satu primary create/setup CTA; summary/hero/toolbar nol dan secondary action yang belum representable tidak tampil bersamaan. Filtered-empty menawarkan reset/tampilkan data tersedia, bukan create entity baru.
- [ ] Jika shell mobile sudah memiliki global primary action yang identik (quick-add transaksi), route/header/true-empty tidak merender CTA kedua untuk handler yang sama.
- [ ] Ikon `+` tidak dipakai untuk beberapa mutation berbeda pada surface yang sama. Aksi domain yang bukan create-global (mis. adjustment dana) memakai label eksplisit; page-level create, card next-step, dan global FAB memiliki hierarchy yang berbeda dan capability-gated.
- [ ] Detail object yang berisi sub-item erat (khususnya Alokasi Dana → Kebutuhan/Jadwal) tidak berubah menjadi tumpukan card setara: satu master surface memiliki section hierarchy, grouped rows, progress/status yang dapat dipindai, dan secondary lifecycle action tidak bersaing dengan CTA utama.
- [ ] Ikon finansial mengikuti taxonomy semantic canonical: tidak ada `FiDollarSign` di `frontend/src`, `FiCreditCard` hanya untuk Metode pembayaran, rekening memakai `AccountIcon`/ikon tipe canonical, arus transaksi memakai `MoneyInIcon`/`MoneyOutIcon`/`TransferIcon`, dan trend Up/Down/Minus mengikuti nilai aktual.
- [ ] App-owned list tidak kembali memakai native `<select>`; `SelectionField`/selection view diperiksa untuk semantics `combobox/listbox/option` + `aria-selected`, selected state, search bila list panjang (`label/meta/keywords`), Arrow Up/Down + Home/End, Escape/outside dismiss, focus-visible, target sentuh ≥44px, inline expansion mobile, popover desktop, dan clipping di modal/scroll container.
- [ ] App-owned date/month/time tidak kembali memakai native browser picker; gunakan `TemporalInput`/`TemporalPickerField`, dan picker yang dibuka dari modal harus tetap berada pada same-modal subview tanpa menumpuk dialog.
- [ ] Dynamic option yang punya identitas nyata memakai visual recognition canonical tanpa mengganti label: rekening/provider = logo/ikon tipe, kategori = ikon kategori, pencatat = avatar/inisial, Alokasi Dana = ikon lapisan, saham = logo katalog bila tersedia, fallback ticker mark. Secondary `meta` tetap ringkas dan fallback tanpa visual tidak menggeser alignment.
- [ ] Effective mobile hit target diverifikasi pada `SelectionField` default/compact/embedded + search, filter/read-all Notification Center, dan aksi link-style Rekonsiliasi; tampilan boleh compact tetapi host interaktif tetap ≥44×44px.
- [ ] Fixed explanatory choice (terutama `Cara mencatat kebutuhan`, Jenis Jadwal Rutin, dan Aksi penyesuaian Alokasi) memakai `VisualChoiceGroup descriptive`: tile sejajar/equal-height, icon badge konsisten, selected check jelas, label tidak terpotong, description maksimal dua baris, dan helper tidak berubah menjadi card/paragraf bertumpuk.
- [ ] Mobile dan desktop tidak drift pada business rule yang sama.
- [ ] Workflow continuation hanya memberi navigasi/prefill; tidak ada auto-submit finansial, duplicate recovery entry point, atau blocker UI yang melampaui contract backend.
- [ ] Pada setiap page/modal/sheet, satu fakta edukatif tidak diulang antara description, helper field, caption list, notice, dan tombol Info; helper hanya memberi konteks baru. Warning/error/destructive/recovery/outcome-unknown tetap terlihat persisten.
- [ ] Satu surface mobile tidak menampilkan beberapa trigger Info untuk topik edukatif yang dapat digabungkan; aksesibilitas, target sentuh, focus management, dan isi bantuan tetap memakai primitive canonical.
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
- [ ] Untuk frontend/user-flow change, rendered browser smoke pada `npm run verify` PASS dan manual device QA tambahan dicatat untuk authenticated/real-device behavior yang tidak dapat direproduksi secara aman oleh anonymous smoke.
- [ ] Final `npm run verify` PASS pada tree yang sama dengan patch yang akan dikirim.

## 7. Artifact hygiene dan delivery

- [ ] `npm run clean` (default dry-run) tidak menunjukkan protected path seperti `.git`, `.vercel`, `.env.local`, atau `node_modules`; penghapusan nyata hanya dengan `npm run clean -- --apply`.
- [ ] Clean source dibuat dengan `npm run zip`, bukan ZIP manual seluruh workspace. PASS menghasilkan `saldo-bersama-clean.zip` secara atomic; failure harus exit non-zero dan tidak membuat archive baru.
- [ ] Clean ZIP tidak memuat `.env.local`, `.git`, `.vercel`, dependency, build/dist, coverage, cache, export/data privat, patch/diff, atau secret. Artifact/`docs/UNVERIFIED_BUILD_REPORT.md` dari workflow lama hanya boleh dipakai sebagai input diagnosis dan tidak dipertahankan pada source canonical hasil remediation.
- [ ] Setelah `npm run verify`, `npm run zip`, atau pre-push selesai baik PASS maupun gagal, generated build/test artifact dibersihkan otomatis; dependency, `.env.local`, `.vercel`, dan repository Git tetap dipertahankan. Cache Vite di `frontend/node_modules/.vite*` boleh dibersihkan karena generated dan akan dibuat ulang.
- [ ] `git status --short` ditinjau sebelum commit.
- [ ] Delivery Git memakai `git push origin main` tanpa `--no-verify`; pre-push memverifikasi ref/SHA aktual + full gate, dan **Quality / check** server-side dipantau setelah push.

## Investasi / RDN - pemisahan saldo operasional

- [ ] Hero Dashboard memakai **Saldo rekening** (`nonInvestmentBalance`), sedangkan Cash RDN hanya muncul pada konteks Investasi; privacy masking mencakup keduanya.
- [ ] `safeToSpend`, `dailySafeToSpend`, dan dana belum dialokasikan tidak berubah naik karena Cash RDN; Bank → RDN menurunkan Saldo rekening tanpa mengubah total kekayaan, RDN → Bank melakukan kebalikannya.
- [ ] Income/expense/refund/adjustment ordinary tidak dapat memakai rekening Investasi; Transfer Bank ↔ RDN tetap valid, sedangkan Buy/Sell mengubah Cash RDN melalui event Investasi tanpa menjadi income/expense.
- [ ] Alokasi Dana dan Jadwal Rutin baru tidak menawarkan/menerima RDN sebagai rekening operasional; data legacy tetap readable tanpa mengikat Cash RDN sebagai dana tersedia.
- [ ] Trend saldo harian/bulanan merekonsiliasi `investment_account_events`, dan snapshot Total kekayaan tidak menjumlahkan `totalBalance + portfolio_value` sehingga Cash RDN tidak double-count.

## Investasi prototype - Reksa Dana

- [ ] `Tambah aset` menampilkan switch `Saham LQ45` dan `Reksa Dana`; tidak ada form tambah instrumen manual.
- [ ] Reksa Dana Haji Syariah (IHAJJ) dan Capital Fixed Income Fund (CAPFIX) menampilkan logo yang benar.
- [ ] Reksa dana memakai `unit` dan `nilai per unit`; saham tetap memakai `lot/lembar` dan `harga per saham`.
- [ ] Catat pembelian/penjualan reksa dana tetap manual tracking dan mengubah Cash RDN melalui ledger Investasi existing tanpa membuat income/expense.
- [ ] Tidak ada copy/flow yang memberi kesan marketplace, NAV live, koneksi broker, atau order execution.

- [ ] Notification Center mobile tampil sebagai task inbox ringkas: back icon 44px tanpa card berat, `Baca semua` aksesibel, dan seluruh tipe utama (rekonsiliasi, jadwal, anggaran, Alokasi Dana, Target, unallocated expense) hanya menampilkan aksi + entitas + satu fakta + chevron; contextual entry tidak meminta entity yang sama dipilih ulang.
- [ ] Attention Investasi yang menunjuk portfolio yang sudah tidak tersedia memberi feedback informatif dan tidak membuka dialog dengan entity stale.
- [ ] Alert RDN/Investasi membuka reconciliation portfolio Investasi; generic `reconciliations.create` menolak account Investasi dan account read model tidak mengekspos `can_reconcile` untuk RDN.

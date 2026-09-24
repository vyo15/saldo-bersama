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
- [ ] Patch paralel mencatat baseline/source, scope, touched/added/deleted path, dan area yang sengaja tidak disentuh.
- [ ] Bug/regression ditangani root-cause-first; workaround berlapis tidak ditambahkan setelah failure yang sama tanpa audit ulang baseline/diff/contract.

## 2. Behavior dan regression

- [ ] Bug/regression memiliki test behavior/contract yang relevan bila feasible.
- [ ] Static/source assertion hanya mengunci invariant literal, bukan nama helper/variabel lokal.
- [ ] Targeted regression PASS setelah implementasi final; targeted gate yang masih gagal diselesaikan sebelum full verify mahal diulang.
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
- [ ] Detail Kebutuhan di dalam Alokasi tetap compact pada mobile: kebutuhan aktif memuat ikon + nama + pola/status dan Sisa/total/persentase + progress; `fixed_once` tepat 100% berubah menjadi row ringkas `✓ Selesai` tanpa progress/quick-add; `flexible`/`recurring` tepat 100% menjadi `Dana habis` dengan warning tone dan tanpa aksi pencatatan baru; overspend tetap danger. `Terpakai`, waktu selesai, dan Jadwal tersedia di **Detail kebutuhan**; Edit/Lihat jadwal berada di overflow; target sentuh minimal 44px; filter `Semua / Perhatian / Belum dipakai` muncul saat item banyak; `Tambah kebutuhan` tetap setelah daftar.
- [ ] Detail Alokasi tidak memiliki section permanen `Kelola dana`; aksi administratif **Pindahkan dana / Pengingat / Hapus dari daftar** berada di menu overflow `•••`, sedangkan aksi transaksi/kebutuhan tetap berada dekat konteksnya.
- [ ] Beranda mobile compact: **Saldo Keluarga** menjadi nominal utama, **Dana yang bisa kamu gunakan** tampil tepat di hero, panel **Saya / Pasangan / Bersama** tetap satu baris tiga kolom tanpa overflow, sementara Aman/hari dan Sisa di Alokasi tetap terlihat tanpa menambah card berlebihan.
- [ ] Bottom navigation mobile berurutan **Beranda · Atur Dana · CATAT · Transaksi · Lainnya** dan route sekunder seperti Laporan menandai `Lainnya` sebagai aktif.
- [ ] `Lainnya` hanya memakai empat kelompok canonical (Rencana & Insight, Keuangan, Keluarga & Akses, Aplikasi); owner-only tidak bocor ke Member.
- [ ] Laporan tidak menggandakan KPI hero lewat summary strip kedua; Analisis lengkap tetap membuka planning/Kewajiban/rekening/pencatat.
- [ ] Target card default tetap compact; rincian tanggal/estimasi/sumber dana dapat dibuka dari overflow dan target sentuh primary/overflow tetap ≥44px.
- [ ] Pengaturan mobile menampilkan description singkat satu baris tanpa clipping label utama.
- [ ] Realtime mutation menginvalidasi resource canonical yang benar; device/tab lain tidak perlu hard refresh/restart.
- [ ] Pull-to-refresh memakai Sync Coordinator, tidak memakai `window.location.reload()`, tidak menghapus draft/form, dan node gesture hanya dirender pada viewport mobile (`<=820px`), bukan disembunyikan belakangan di desktop.
- [ ] Reconnect/foreground/offline recovery tidak memicu duplicate mutation atau refresh ganda yang tidak perlu.

## 5. UI/UX dan accessibility

- [ ] Loading, empty, filtered-empty, error, offline, unauthorized, maintenance, dan conflict state relevan tersedia.
- [ ] Partial-resource failure tidak boleh tampak sebagai data kosong yang sah: merged workspace **Atur Dana** menunggu read model Alokasi/Kebutuhan/Jadwal/Kewajiban pada initial load, sedangkan surface lain yang masih dapat dipakai menampilkan warning + retry untuk resource pendukung.
- [ ] Complete/archive state tidak tertukar: Kewajiban dihentikan tidak disebut selesai, dan Target completed-only tidak menampilkan hero `0 target aktif`.
- [ ] Keyboard/focus/label/contrast/reduced-motion/tap target diperiksa pada light dan dark bila terdampak.
- [ ] Mobile control penting ≥44×44px; termasuk toggle visibilitas saldo, filter Notifikasi, disclosure detail, dan link tindakan compact; input text efektif 16px; safe-area, keyboard virtual, dan overflow diperiksa.
- [ ] Nominal utama tidak ellipsis dan hierarchy informasi dapat dipindai tanpa card/panel berulang yang tidak perlu.
- [ ] **Pastikan Saldo Sesuai** desktop tidak menyembunyikan kolom **Selisih/Status**; breakpoint dua-panel hanya aktif bila riwayat memiliki lebar yang cukup dan tidak ada overflow kritis tanpa affordance.
- [ ] Collection kecil tidak mempertahankan kontrol yang tidak berguna: ringkasan satu-item, search/filter dataset kecil, atau tab jenis bernilai nol disembunyikan secara progresif.
- [ ] Container desktop tidak berganti lebar antar route; tepi konten shell canonical tetap stabil, sedangkan kebutuhan lebar khusus diselesaikan di layout feature.
- [ ] Modal diuji buka → tutup/batal → buka lagi; Browser Back/focus/body scroll lock tidak stale.
- [ ] True-empty hanya memiliki satu primary next action; filtered-empty menawarkan reset/show-all, bukan membuat entity baru.
- [ ] Create CTA pada true-empty tidak muncul bersamaan di header/toolbar dan empty state. Kewajiban/Investasi/collection lain hanya mengembalikan header create setelah data pertama ada.
- [ ] Mobile global `Catat` tetap menjadi launcher aktivitas uang dan tidak diduplikasi oleh CTA transaksi lokal pada true-empty Dashboard/Transaksi. Launcher menampilkan Pengeluaran/Pemasukan/Transfer/Bayar kewajiban + grup Untuk masa depan (Target/Investasi); setelah jenis transaksi dipilih, form tidak menanyakan jenis untuk kedua kalinya.
- [ ] Form quick Catat mobile memakai judul + rekening + CTA kontekstual, satu primary footer full-width, tanggal terlihat, detail metode/catatan opsional, dan tombol kembali ke launcher. Refund bukan quick action global.
- [ ] Dashboard mobile tidak menggandakan `Atur Dana` pada Akses cepat karena sudah permanen di bottom navigation; shortcut canonical adalah Rekening/Target/Investasi; pemeriksaan saldo tidak menjadi shortcut permanen dan diakses dari Rekening.
- [ ] Dashboard desktop menampilkan freshness hanya di header, menempatkan Rekening sebelum shortcut/analitik, dan grid shortcut/planning mengikuti tiga item canonical tanpa kolom kosong pada 821/940/941px.
- [ ] Detail object dengan sub-item erat memakai section/list hierarchy, bukan tumpukan card setara tanpa kebutuhan.
- [ ] Satu fakta edukatif tidak diulang pada description, helper, card, dan notice di surface yang sama.
- [ ] Normal state tidak memakai helper/notice hanya untuk mengulang label, placeholder, value, atau state yang sudah jelas.
- [ ] UI finansial normal tidak membocorkan jargon implementasi (`server`, `backend`, `ledger`, `snapshot`, `master`) atau narasi refresh/sinkronisasi yang tidak membantu keputusan user.
- [ ] Success feedback finansial menjawab hasil tindakan dan dampak relevan; warning/destructive/recovery/error/conflict tetap eksplisit.
- [ ] Warning finansial/destructive/recovery/error/conflict tetap dekat dengan dampaknya dan tidak disembunyikan demi minimalisme.
- [ ] Celebration finansial hanya muncul setelah write dikonfirmasi server, tidak menggandakan toast/progress global, finite/non-blocking, reduced-motion safe, dan copy tidak mempermalukan kondisi finansial.
- [ ] Honest Action Contract: label aksi, confirmation, mutation aktual, success feedback, dan recovery semantics konsisten; `Hapus permanen` hanya muncul setelah preview membuktikan entity belum pernah dipakai, sedangkan record berhistori memakai `Arsipkan`/`Hentikan`.
- [ ] Smart default/otomatisasi finansial tidak diam-diam: pilihan otomatis dan perubahan Dana Tersedia/Alokasi/saldo terlihat sebelum Simpan.
- [ ] User-facing normal tidak menghidupkan kembali istilah legacy yang sudah dipensiunkan (`Anggaran` sebagai menu/surface kedua, hierarchy `portfolio`/RDN pada Investasi asset-centric).

## 6. Auth, PWA, dan device

- [ ] Production OAuth/session diuji bila auth/session berubah; localhost fallback tidak dianggap evidence Production.
- [ ] PWA update/install/Push diuji pada device relevan bila scope menyentuh PWA/notification.
- [ ] Aktivasi Notifikasi perangkat menjelaskan sebelum aksi bahwa satu notifikasi uji otomatis dikirim untuk verifikasi perangkat; permission tetap berasal dari user gesture.
- [ ] Offline tidak mengizinkan financial write queue.
- [ ] Responsive surface yang berubah diperiksa pada viewport/device target, bukan hanya CSS source.
- [ ] Kategori pada ponsel kecil tidak memaksa dua kolom; nama panjang tetap terbaca dan overflow action tetap memiliki target minimal 44px.
- [ ] Feature planning tidak membuat ulang progress primitive dan tidak menampilkan persentase ganda pada surface yang sama.

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

- [ ] `npm run lint` PASS pada tree final; jika sempat gagal, error source sudah diperbaiki dan lint diulang sampai PASS. User log bukan default repair loop dan hanya diminta untuk blocker environment-specific yang tidak dapat direproduksi agent.
- [ ] Targeted regression sesuai area perubahan PASS sebelum full gate.
- [ ] `npm run verify` PASS pada tree final yang sama dengan artifact/delivery.
- [ ] Tidak ada known lint/test/build failure yang diteruskan ke patch/ZIP final; edit setelah PASS memicu validation ulang.
- [ ] `npm run clean` dry-run tidak menyentuh path protected.
- [ ] Clean source dibuat dengan `npm run zip`; bila verification gagal, command exit non-zero dan **tidak membuat archive baru**.
- [ ] Patch ZIP default changed-files-only, memakai path asli, dan tidak memuat `.env.local`, `.git`, `.vercel`, dependency, dist/build, coverage, cache, database/export privat, patch/diff, atau secret.
- [ ] Patch manifest/handoff mencatat baseline, changed/added/deleted, cleanup, touched/not-touched, validation, dan status; metadata ini tidak ikut final runtime source.
- [ ] Delete/rename sudah diaudit usage-nya dan memiliki command Git Bash `rm -f`/`rm -rf` eksplisit bila diperlukan.
- [ ] Final merge memakai project terbaru sebagai authority; file overlap di-merge semantic dan tidak di-overwrite mentah antar ZIP.
- [ ] Handoff memakai urutan Artifact -> Cleanup Git Bash -> Validation -> Tidak disentuh -> Status dan status tidak ambigu.
- [ ] Status handoff eksplisit `FINAL / VERIFIED` setelah full gate PASS atau `CANDIDATE / UNVERIFIED` bila full gate benar-benar terblokir environment eksternal.
- [ ] `git status --short` ditinjau sebelum commit/push.
- [ ] Delivery Git tidak memakai `--no-verify`/force push dan GitHub **Quality** dipantau setelah push.

### Form Kebutuhan (canonical)
- [ ] Tambah/Edit kebutuhan tetap compact; **Cara penggunaan** memakai inline picker canonical seperti rekening/ATM dengan ikon kecil, bukan card/choice besar yang mendominasi form.
- [ ] Create tidak memilih cara penggunaan otomatis; submit tanpa pilihan gagal dengan pesan yang jelas.
- [ ] Edit hanya dapat mengubah cara penggunaan selama belum ada pemakaian; setelah terpakai field read-only dan backend menolak payload perubahan.
- [ ] Picker kategori create memiliki **Tambah kategori baru** inline dan setelah kategori owner dibuat, pilihan kembali ke form/row aktif tanpa kehilangan draft.
- [ ] Aksi lifecycle memakai ikon trash yang jelas tetapi copy tetap honest-action (`Hapus dari daftar`) sampai preview menentukan hapus permanen vs arsip.

### Kebutuhan → transaksi (canonical)
- Nominal utama pada row Kebutuhan adalah **sisa aktual = nominal rencana - terpakai**, bukan nominal rencana statis.
- Quick action dari row Kebutuhan wajib membawa `budget_id` + `envelope_period_id` dan composer menampilkan relasi itu sebagai **Otomatis**; jangan meminta user memilih ulang konteks yang sudah diketahui.
- Jangan menyediakan pemilih **Alokasi manual** terpisah di composer. Surface canonical adalah **Penggunaan dana**: satu Kebutuhan cocok boleh auto-link namun tetap editable, beberapa kandidat wajib dipilih, dan nol kandidat/pilihan eksplisit **Dana Tersedia** harus dapat disimpan tanpa konfirmasi unallocated kedua.
- `+ Catat` memakai prinsip context-aware: histori hanya meranking opsi dan tidak auto-select rekening/kategori/sumber; satu Kewajiban/Target/portofolio yang benar-benar menjadi satu-satunya pilihan valid boleh dilanjutkan otomatis, sedangkan banyak pilihan tetap meminta user. Picker canonical existing tetap dipakai; jangan membuat picker quick-record kedua.
- Aksi yang dapat berujung delete/archive tidak boleh diberi label samar pada form edit. Gunakan label outcome-oriented seperti `Hapus / arsipkan`, lalu preview server menentukan tindakan final.

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
- [ ] Form transaksi investasi Beli/Jual memperlihatkan bruto, biaya broker, dan nilai bersih; fee masuk ke cost basis/RDN sesuai server. Bandingkan nominal tersimpan dengan review; jangan menghitung fee dua kali. Uji record legacy dengan fee nol.
- [ ] Input desimal investasi dapat mengetik `5.021,50`, mengedit karakter di tengah, paste dan hapus, tanpa loncatan caret/auto-zoom keyboard; input Rupiah biasa tetap integer dan tidak berubah.
- [ ] Mutation menjaga validation, idempotency, row-version/concurrency, authorization, dan audit sesuai scope.
- [ ] `OUTCOME_UNKNOWN` tidak menghasilkan intent/payload kedua secara diam-diam.
- [ ] Delete/import/restore/reset/migration mengikuti preview/backup/confirmation/integrity policy yang relevan.
- [ ] Secret/token/raw financial data/raw stack trace tidak masuk frontend, log, fixture, commit, atau ZIP.

## 4. Planning dan realtime

- [ ] Alokasi baru tidak meminta budget awal sebagai flow utama; Kebutuhan mengatur funding dari Dana Tersedia sesuai contract.
- [ ] Create **Alokasi baru** tidak menampilkan kategori Alokasi atau picker pemanis kartu; langkah 1 hanya nama + rekening sumber + pengguna, header helper tetap satu baris singkat, dan step dots menjadi indikator progres.
- [ ] Langkah Kebutuhan awal menampilkan **Sisa saat periode berakhir** secara langsung (return/carry), sementara nominal Kebutuhan tidak pernah ellipsis/terpotong: kolom nominal mendapat ruang cukup, font hanya mengecil terbatas, dan viewport sangat sempit menumpuk nama + nominal.
- [ ] Root **Atur Dana**: bila Alokasi sudah ada, **Alokasikan dana** menawarkan **Alokasi yang sudah ada / Buat Alokasi baru**; bila belum ada Alokasi, hanya ada satu primary **Buat Alokasi** dan aksi langsung membuka create canonical tanpa launcher/decision point. Empty state tidak menduplikasi create CTA dan search/filter Aktif tidak tampil pada true-empty. Membuat Alokasi baru tetap tersedia walau rekening source sudah dipakai Alokasi lain.
- [ ] Funding dengan source tertentu tanpa target menampilkan **Buat Alokasi dari rekening ini** dan source tetap terpilih di create; detail/attention yang sudah tahu source+target tidak menampilkan decision generik.
- [ ] Jika target contextual sudah hilang/stale, flow **Tambah dana** berhenti dengan pesan recovery dan tidak pernah memilih Alokasi lain dari rekening yang sama secara otomatis.
- [ ] Shortage Kebutuhan menjelaskan total, dana tersedia, dan kekurangan; mutation gagal atomic dan draft tidak hilang.
- [ ] Archive/delete/edit Kebutuhan tidak melepas dana terpakai/dipesan, kebutuhan lain, atau buffer sengaja.
- [ ] Detail Kebutuhan di dalam Alokasi tetap compact pada mobile: kebutuhan aktif memuat ikon + nama + pola/status dan Sisa/total/persentase + progress; `fixed_once` tepat 100% berubah menjadi row ringkas `✓ Selesai` tanpa progress/quick-add; `flexible`/`recurring` tepat 100% menjadi `Dana habis` dengan warning tone dan tanpa aksi pencatatan baru; overspend tetap danger. `Terpakai`, waktu selesai, dan Jadwal tersedia di **Detail kebutuhan**; Edit/Lihat jadwal berada di overflow; target sentuh minimal 44px; filter `Semua / Perhatian / Belum dipakai` muncul saat item banyak; `Tambah kebutuhan` tetap setelah daftar.
- [ ] **Daftar belanja** hanya tampil pada Kebutuhan yang mengaktifkan `Gunakan daftar belanja`; contoh Listrik default tidak memiliki CTA shopping, sedangkan Belanja bulanan yang opt-in memakai `Buat daftar belanja` atau `Daftar belanja · N item`. CTA tidak diduplikasi di overflow.
- [ ] Detail Alokasi tidak memiliki section permanen `Kelola dana`; aksi administratif **Pindahkan dana / Pengingat / Hapus dari daftar** berada di menu overflow `•••`, sedangkan aksi transaksi/kebutuhan tetap berada dekat konteksnya.
- [ ] Beranda mobile compact: **Saldo Keluarga** menjadi nominal utama, **Dana yang bisa kamu gunakan** tampil tepat di hero, **Saya / Pasangan / Bersama** tetap satu baris sebagai flat stats ber-divider lembut, sementara Aman/hari dan Sisa di Alokasi tetap terlihat dalam satu tonal band tanpa outer card.
- [ ] Bottom navigation mobile berurutan **Beranda · Atur Dana · CATAT · Transaksi · Lainnya** dan route sekunder seperti Laporan menandai `Lainnya` sebagai aktif.
- [ ] `Lainnya` hanya memakai empat kelompok canonical (Rencana & Insight, Keuangan, Keluarga & Akses, Aplikasi); owner-only tidak bocor ke Member.
- [ ] Laporan tidak menggandakan KPI hero lewat summary strip kedua; Analisis lengkap tetap membuka planning/Kewajiban/rekening/pencatat.
- [ ] Target card default tetap compact; rincian tanggal/estimasi/sumber dana dapat dibuka dari overflow dan target sentuh primary/overflow tetap ≥44px.
- [ ] Modal **Buat/Edit Target** menjaga tiga pilihan fixed (`Jenis target`, `Cara menabung`, `Prioritas`) sebagai segmented row 3 kolom pada mobile tanpa grid 2+1/wrap; label pendek tetap satu baris, selected/focus state jelas, nominal tidak terjepit, dan picker sumber tetap progressive sesuai funding mode.
- [ ] Pengaturan mobile menampilkan description singkat satu baris tanpa clipping label utama.
- [ ] Realtime mutation menginvalidasi resource canonical yang benar; device/tab lain tidak perlu hard refresh/restart.
- [ ] Pull-to-refresh memakai Sync Coordinator, tidak memakai `window.location.reload()`, tidak menghapus draft/form, dan node gesture hanya dirender pada viewport mobile (`<=820px`), bukan disembunyikan belakangan di desktop.
- [ ] Reconnect/foreground/offline recovery tidak memicu duplicate mutation atau refresh ganda yang tidak perlu.

## 5. UI/UX dan accessibility

- [ ] Loading, empty, filtered-empty, error, offline, unauthorized, maintenance, dan conflict state relevan tersedia.
- [ ] Partial-resource failure tidak boleh tampak sebagai data kosong yang sah: merged workspace **Atur Dana** menunggu read model Alokasi/Kebutuhan/Jadwal/Kewajiban pada initial load, sedangkan surface lain yang masih dapat dipakai menampilkan warning + retry untuk resource pendukung.
- [ ] Complete/archive state tidak tertukar: Kewajiban dihentikan tidak disebut selesai, dan Target completed-only tidak menampilkan hero `0 target aktif`.
- [ ] Keyboard/focus/label/contrast/reduced-motion/tap target diperiksa pada light dan dark bila terdampak; light harus punya tonal depth yang cukup (canvas/surface/section terbedakan), sedangkan dark tetap memakai luminance bertingkat tanpa sekadar meng-invert light.
- [ ] Mobile control penting ≥44×44px melalui `--mobile-hit-target`; glyph visual boleh lebih kecil tetapi hit area tidak. Cakup toggle, filter/tab compact, checkbox, clear-search, pagination, disclosure/detail, dan link/action compact; input text efektif 16px; safe-area, keyboard virtual, dan overflow diperiksa.
- [ ] Light theme meaningful `text-soft`/`text-muted` pada surface white/soft/strong/tint memenuhi contrast normal text ≥4.5:1; status/focus/non-color cue tetap terbaca di light dan dark.
- [ ] Card/row interaktif memakai native button/link atau explicit action control; pseudo-button (`role="button" + tabIndex`) direview dan tidak dipakai bila native semantic tersedia.
- [ ] `npm run test:browser` PASS untuk overflow, 44px rendered touch target, keyboard focus, text-spacing, light/dark parity, dan reduced-motion sebelum UI-responsive release.
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
- [ ] Batch **Atur kebutuhan** memakai summary-first/edit-on-demand: hanya row aktif berupa form, draft lain berupa summary compact; nominal tidak ellipsis, font mengecil terbatas, dan `<=360px` menumpuk nama + nominal. Semua tombol row/hapus/tambah/kategori memiliki hit target minimal 44px.
- [ ] Tambah/Edit kebutuhan tetap compact; **Cara penggunaan** memakai inline picker canonical seperti rekening/ATM dengan ikon kecil, bukan card/choice besar yang mendominasi form.
- [ ] Create tidak memilih cara penggunaan otomatis; submit tanpa pilihan gagal dengan pesan yang jelas.
- [ ] Edit hanya dapat mengubah cara penggunaan selama belum ada pemakaian; setelah terpakai field read-only dan backend menolak payload perubahan.
- [ ] Picker kategori create memiliki **Tambah kategori baru** inline dan setelah kategori owner dibuat, pilihan kembali ke form/row aktif tanpa kehilangan draft.
- [ ] Switch **Gunakan daftar belanja** default off, konsisten pada create/edit/batch, tetap jelas di light/dark, dan tidak dapat dimatikan selama masih ada item `pending/in_cart`; helper menjelaskan apa yang harus diselesaikan.
- [ ] Aksi lifecycle memakai ikon trash yang jelas tetapi copy tetap honest-action (`Hapus dari daftar`) sampai preview menentukan hapus permanen vs arsip.

### Kebutuhan → transaksi (canonical)
- Nominal utama pada row Kebutuhan adalah **sisa aktual = nominal rencana - terpakai**, bukan nominal rencana statis.
- Quick action dari row Kebutuhan wajib membawa `budget_id` + `envelope_period_id` dan composer menampilkan relasi itu sebagai **Otomatis**; jangan meminta user memilih ulang konteks yang sudah diketahui.
- Jangan menyediakan pemilih **Alokasi manual** terpisah di composer. Surface canonical adalah **Penggunaan dana**: satu Kebutuhan cocok boleh auto-link namun tetap editable, beberapa kandidat wajib dipilih, dan nol kandidat/pilihan eksplisit **Dana Tersedia** harus dapat disimpan tanpa konfirmasi unallocated kedua.
- `+ Catat` memakai prinsip context-aware: histori hanya meranking opsi dan tidak auto-select rekening/kategori/sumber; satu Kewajiban/Target/sumber investasi yang benar-benar menjadi satu-satunya pilihan valid boleh dilanjutkan otomatis, sedangkan banyak pilihan tetap meminta user; UI normal tidak boleh meminta user memilih broker/portfolio legacy. Picker canonical existing tetap dipakai; jangan membuat picker quick-record kedua.
- Aksi yang dapat berujung delete/archive tidak boleh diberi label samar pada form edit. Gunakan label outcome-oriented seperti `Hapus / arsipkan`, lalu preview server menentukan tindakan final.

## Human-error prevention
- [ ] Ubah nominal/tanggal checkout setelah warning duplikat: konfirmasi lama harus gugur.
- [ ] Simulasikan outcome write tidak pasti: field terkunci dan hanya retry data sama yang ditawarkan.
- [ ] Hapus item Shopping lalu gunakan Urungkan sebelum timeout.
- [ ] Coba quantity 0/kosong/tidak valid: mutation tidak terkirim dan error inline terlihat.
- [ ] Coba setoran Target melebihi dana rekening/sisa Target: submit diblokir dengan error inline.
- [ ] Ubah role anggota existing: review acknowledgement wajib sebelum Simpan.
- [ ] Masukkan saldo rekonsiliasi invalid/negatif pada rekening non-negatif: error berada di field saldo.


- Human-error flow hardening: create anggota tidak boleh mengubah anggota existing secara diam-diam; Administrator baru/perubahan role wajib review akses; Shopping Undo harus mengembalikan status sebelum dihapus dan mempertahankan Undo selama restore; editor Shopping dan mutation finansial yang hasilnya belum pasti mengunci payload untuk retry data yang sama; Target baru tidak menerima tanggal masa lalu.

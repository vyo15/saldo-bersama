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

- [ ] Detail Transaksi Beranda dan Transaksi memakai fakta dan badge lifecycle yang sama; nominal privasi tidak bocor, tanggal/status/ID copyable tetap benar.
- [ ] Detail Rekening mobile menampilkan saldo utama, Dana tersedia, Dialokasikan (kecuali RDN), nomor yang bisa disalin, dan metadata sekunder bisa dibuka di 320–430px.
- [ ] Detail Kebutuhan menampilkan Sisa, Rencana, dan Terpakai dengan status yang benar tanpa menyembunyikan jadwal/daftar belanja pada disclosure.

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

## Motion & micro-feedback verification

- [ ] Cek semua jalur modal X, Escape, backdrop, Back, subview, swipe; focus kembali benar, history tidak tersangkut, dirty form disetujui eksplisit, dan tidak ada klik menembus backdrop saat exit.
- [ ] Cek parent yang mount/unmount modal secara kondisional; CSS exit pada `open=false` bukan bukti parent ini sudah mendukung exit.
- [ ] Swipe notifikasi arah kanan versus scroll vertikal; exit dan collapse tidak overlap salah urutan, fokus Delete berpindah ke baris lain/filter, sukses/gagal diumumkan jujur.
- [ ] Target biasa bisa lanjut kerja; milestone/100% tetap terbaca dan bisa ditutup. Uji `prefers-reduced-motion` dan mode 320px.
- [ ] Indikator navigasi dan filter 2/3/4 segmen tidak lompat, hit target 44px, light/dark dan keyboard aman.
- [ ] Jalankan `npm run lint`, `npm run test`, `npm run build`, `npm run test:browser`, `npm run zip`; catat kegagalan dependency terpisah dari regresi. Profil gesture di perangkat fisik sebelum klaim FPS/10-10.

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


## Wishlist purchase planning — manual smoke v28

- [ ] Login sebagai Administrator dan Member, cek menu Wishlist pada desktop dan grup Rencana & Insight mobile; tab bottom navigation tetap lima slot.
- [ ] Pada mobile 320/360/390/430px (light & dark): CTA Tambah di header hanya ikon 44px tetapi tetap bernama aksesibel; ringkasan 3 metrik menyatu ringkas, filter pemilik menggunakan segmented control 3 pilihan dengan ikon dan highlight bergerak; prioritas/arsip ada pada dialog Filter Wishlist app-owned dengan focus-visible; empty state dan daftar tetap ringkas, tidak overflow ke kanan, serta tidak tertutup bottom navigation. Desktop tetap memakai action berlabel dan filter prioritas yang terlihat.
- [ ] Uji light/dark, lebar 320/360/390px dan desktop: ringkasan nominal penuh, daftar compact tidak horizontal overflow, field tampak jelas, tombol punya target sentuh wajar.
- [ ] Tambah Wishlist personal dan Bersama (nama, harga, HTTPS, catatan) tanpa target tetap bisa disimpan. Jika target diaktifkan, tanggal atau nominal bulanan diperlukan untuk menabung bertahap/gabungan; input Rupiah memformat saat mengetik. Pilihan strategi/rekening/kategori memakai SelectionField; tanggal memakai TemporalInput, bukan native browser picker.
- [ ] Pemilik personal hanya melihat data sendiri; Administrator tidak dapat membuka Wishlist personal anggota lain. Shared visible semua, hanya pembuat/Administrator dapat mengedit/arsip.
- [ ] Pilih saran prioritas opsional, cek prioritas tidak berubah sampai `Gunakan saran`; uji filter scope/prioritas dan arsip/reactivate.
- [ ] Aktifkan mode Simulasi belanja (checkbox tidak terlihat pada mode normal), pilih beberapa item lintas filter, periksa hitung total + ongkir/voucher dan Bersihkan/Selesai. Barang archived/purchased tidak dapat dipilih, pilihan yang tersembunyi saat mengganti filter tetap terhitung, dan mode keluar mereset pilihan. Simulasi tidak mengubah saldo atau membuat transaksi.
- [ ] Checkout personal/shared hanya menampilkan rekening scope cocok; cek harga + ongkir − diskon, pilih kategori dan tanggal, cek insufficient balance dan saldo teralokasi.
- [ ] Pembayaran sukses membuat satu transaksi canonical, pembelian ganda ditolak; batalkan transaksi, cek status perubahan realtime lalu `Buka rencana lagi`.
- [ ] Buat backup dengan Wishlist active dan purchased, lakukan restore drill di salinan Development terisolasi; pastikan FK transaksi/owner tetap valid. Periksa XLSX Administrator sheet `Wishlist` dan hasil Trial/Full Reset.
- [ ] Uji dua perangkat: edit konflik `row_version`, cache refresh setelah transaksi dibatalkan, dan network outage setelah mengirim mutation (jangan retry dengan item baru).
- [ ] Pastikan operator memakai `npm run prod:update` saat schema Production v27 menuju v28; `db:integrity -- production` sebelum migrasi memang gagal sesuai ekspektasi, dan `db:migrate --production` (tanpa spasi setelah `--`) harus ditolak oleh guard.
- [ ] Jangan klaim Production-ready sampai `npm run lint`, `npm run verify`, browser smoke, restore drill dan real-account smoke semuanya PASS dalam lingkungan dengan dependensi lengkap.

### Wishlist compact/opsional (v28)
- [ ] Pada mobile 320–430px serta desktop, coba langkah pertama: Pribadi/Bersama, format input ribuan, Detail tambahan buka/tutup tanpa kehilangan isian, kembali dari langkah kedua.
- [ ] Simpan Wishlist tanpa target; nyalakan toggle tanpa tanggal -> pesan validasi singkat; isi tanggal -> estimasi/bulan; matikan toggle -> tanggal/bulanan tidak lagi tersimpan.
- [ ] Edit Wishlist lama dengan strategi available/combined/gradual; periksa catatan, pembelian, arsip, dan simulasi multi-item.
- [ ] Light/dark, keyboard, screen-reader labels, reduced-motion dan popup aksi item, termasuk daftar panjang.
- [ ] Production: backup tervalidasi dan migration 026 via `npm run prod:update`, cek schema v28/integrity sebelum menerima traffic runtime baru; jangan jalankan migrasi otomatis dari ZIP.

### Wishlist compact V2 — filter, motion, dan mode simulasi
- [ ] Bandingkan filter kepemilikan Wishlist dengan filter cepat Transaksi: satu surface segmented, ikon kecil, highlight bergerak memakai transform; 320/360/390/430px tetap satu baris tanpa overflow.
- [ ] Ubah filter berturut-turut secara cepat, bandingkan jumlah hasil, pemilik, prioritas dan empty state; reset filter mengembalikan state benar.
- [ ] Dalam dialog filter, ubah prioritas/arsip lalu tutup lewat X/Back: perubahan draft batal; tombol Tampilkan hasil baru menerapkan perubahan.
- [ ] Pada mode normal tidak ada checkbox per barang; Dibeli tetap lewat checkout canonical. Saat mode simulasi, checkbox baru muncul, total terpilih akurat lintas pemilik/priority, dan Dibeli sementara disembunyikan.
- [ ] Nominal dan nama panjang tidak terpotong pada mobile 320px; menu overflow dan CTA punya hit target 44px, memakai keyboard/focus-visible serta reduced-motion tanpa animasi.
- [ ] Buka Tambah, Edit, Dibeli, dan Simulasi untuk pertama kali setelah refresh/slow network: fallback modal terlihat sebentar, kemudian form benar tampil dan focus/Back tidak terjebak; ulangi sesudah menutup untuk memverifikasi lazy chunk sudah dimuat.
- [ ] Jalankan lint + seluruh regression frontend termasuk motion-system + build + browser smoke di lingkungan dengan dependency platform benar sebelum klaim production-ready.

### Konsistensi filter data antar halaman

- [ ] Kontrak final filter: geser Wishlist Semua/Pribadi/Bersama dan Transaksi Semua/Keluar/Masuk pada light/dark; **seluruh wrap/slider tetap teal** saat bergerak (tidak menjadi merah/hijau), ikon + teks aktif Keluar merah / Masuk hijau. Perpindahan 220ms terasa sama, tidak kedip atau mengubah tinggi.
- [ ] Cek QuickSegmentedFilter di Rekening, Alokasi Aktif, Investasi, Audit, Anggota (Pemasukan/Pengeluaran), Jadwal (Perlu perhatian), Shopping (Selesai), kemudian Notifikasi (2 pilihan) dan Kebutuhan Detail Alokasi (3 pilihan); ikon/teks sesuai semantik, background indicator tetap teal.
- [ ] Pada viewport 320/360/390/391/430/431/820px tidak ada chip keluar viewport, label Transaksi compact bila perlu, search/filter tidak terjepit; keyboard focus, rapid tap, advanced Transfer, reduced-motion, `aria-pressed`, dan pembaca layar tetap jelas. Tidak ada change pada query/permissions.

- [ ] Bandingkan Transaksi dan Wishlist dengan filter Rekening (mobile/desktop), Atur Dana Aktif, Shopping, Investasi, dan Log Audit: active-tone, radius, hit target 44 px, ikon/jumlah jika relevan, serta motion yang tenang.
- [ ] Rekening tetap memisahkan Semua/Saya/Pasangan/Bersama; Atur Dana tetap memakai entitlements `all/shared/mine` tanpa melepas batas izin server.
- [ ] Jadwal Rutin tetap menawarkan Perlu perhatian/Belum selesai/Selesai/Dilewati. Aktivitas Anggota tetap menawarkan Pemasukan/Pengeluaran/Transfer/Refund/Penyesuaian; filter lanjutan terpilih ditandai dan dapat di-reset.
- [ ] Notifikasi serta filter Kebutuhan detail Alokasi tetap konsisten dengan tema. Navigasi Keluarga/Detail Anggota/Akun Saya: Tab, Shift+Tab, ArrowLeft/Right, Home/End, panel ID, dan `aria-labelledby` benar.
- [ ] Viewport 320/360/390/430px, tablet 820/821px, desktop, light/dark, reduced-motion, long labels, rapid filter switch, no results, dan keyboard-focus tidak mengalami overflow atau data stale.

- [ ] Detail transaksi (Beranda + Transaksi), Rekening, Kebutuhan, Audit, Sesi: cek penyajian ringkas dan disclosure metadata tanpa kehilangan informasi atau aksi; pastikan nomor bisa disalin dan status Bahasa Indonesia.

### Resource design harmonization

- [ ] Mobile 320/390/430 dan desktop: Notifikasi, Transaksi, Rekening, Atur Dana, Wishlist, Jadwal, Target, Investasi, Laporan, Pengaturan; tidak ada overflow/pemotongan nominal.
- [ ] Light dan dark: StatusBadge/CompactNotice tonal borderless tetapi judul, isi, ikon dan status tetap dapat dibaca; indikator focus-visible tidak hilang.
- [ ] Notifikasi: filter 2 pilihan bergeser teal, search, belum dibaca, mark read, row direct navigation, swipe bersihkan, Delete/hover dan restore saat API gagal.
- [ ] Login dan overlay sukses: enam varian banknote memakai pigmen konsisten; reduced-motion menonaktifkan dekorasi tanpa menyembunyikan pesan.
- [ ] Transaksi: petunjuk peninjauan hanya meminta pemilihan Kebutuhan, bukan menawarkan picker Alokasi manual; pastikan relationship ikut Kebutuhan.
- [ ] Uji login, real data, approval, screen reader iOS/Android, dan dark mode pada perangkat nyata sebelum release; preview statis tidak menggantikannya.

## Uji kepadatan informasi UI/UX (14 Oktober 2026)

- [ ] Mobile Atur Dana **320/360/390/430px**, light/dark: tanpa rekening tampil arah ke Rekening; rekening ada dan dana Rp0 menampilkan `Dana bebas`, tidak ada badge `0 rekening sumber`, CTA `Buat Alokasi` mengikuti capability, tanpa ilustrasi kedua yang memenuhi layar.
- [ ] Atur Dana sumber **1 dan >1**: rincian sumber bisa dibuka di mobile dan desktop; nominal tidak salah diartikan sebagai gabungan pool baru. Ketika Alokasi ada, tetap bisa pilih tujuan dan sumber dengan validasi existing. Semua rekening Rp0 atau tidak eligible tidak menyamar sebagai rekening yang tidak dimiliki.
- [ ] Daftar Aktif Atur Dana: kosong tanpa duplicate CTA; minimal 1 baris menampilkan judul, input Cari, filter `Semua/Bersama/Saya` hanya jika bermakna, reset `Hapus filter` pada hasil kosong; search dan filter bisa dijalankan keyboard dan sentuhan di mobile.
- [ ] Nav Atur Dana membedakan `Alokasi` (current) dari `Jadwal/Kewajiban/Target` (tautan), tidak overflow/hilang dan tidak membuat pseudo-tab yang salah.
- [ ] Jadwal: nominal, tanggal jatuh tempo, status/CTA tetap terlihat; `Rincian jadwal` membuka kategori, frekuensi, metode, rekening, alokasi; on-time, overdue, partially paid, paid, skipped dan status perhatian tidak gandakan CTA atau status.
- [ ] Kewajiban: sisa pokok/sisa setoran, tanggal berikutnya, progres, `Bayar`, dan tindakan status kritis terlihat; detail pinjaman, sumber dana, pokok+bunga tetap dapat dibuka. Kartu aktif/selesai dan arisan diverifikasi.
- [ ] Target: ringkasan sisa dan progress tidak double-count, nilai investasi manual/belum realisasi tetap benar; rincian sumber dana dan tanggal bisa dibuka, status perlu perhatian tetap tersedia.
- [ ] Wishlist: header dan dua metrik utama tidak menenggelamkan daftar; pembelian selesai tetap tersedia lewat histori/filter, pengelolaan/simulasi dan konfirmasi transaksi tidak berubah.
- [ ] Kategori hanya menampilkan ilustrasi intro bila belum ada kategori. Beranda tetap menampilkan nominal pemilik, info pencatat ketika dibutuhkan di detail transaksi; nominal dan akses penting tidak tersembunyi secara permanen.
- [ ] Notifikasi dengan judul berisi nama entitas tidak mengulang entitas; tindakan nyata, waktu, fakta penting, keyboard Delete, swipe, unread, filter, dan error restore tetap berfungsi.
- [ ] Investasi menunjukkan bahwa data adalah catatan manual; histori/catatan saldo lama tetap dapat diakses pada `Tentang aktivitas`; laporan dan pemeriksaan saldo tidak menghilangkan arti selisih atau larangan koreksi otomatis.
- [ ] Uji dengan VoiceOver/TalkBack, tab keyboard, safe-area iOS, bottom navigation, reduced motion, gambar belum termuat, dan data panjang/nominal besar. Jalankan full `npm run verify` pada instalasi dependency lengkap, lalu visual smoke perangkat sebelum merilis.

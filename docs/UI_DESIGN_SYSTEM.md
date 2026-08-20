# UI Design System

Dokumen ini adalah kontrak visual dan implementasi UI Saldo Bersama. Tujuannya menjaga tampilan konsisten, semantik, aksesibel, dan mudah dilanjutkan oleh developer atau ChatGPT lain tanpa membuat pola styling baru pada setiap halaman.

## Keputusan utama

- Framework aplikasi tetap React + Vite.
- Styling canonical menggunakan CSS Modules dan design tokens pada `frontend/src/styles/tokens.css`.
- Tailwind CSS, utility-class-heavy styling, dan shadcn/ui tidak digunakan.
- Mantine telah disetujui dan dependency-nya sudah tercatat pada workspace/lockfile, tetapi hanya boleh digunakan melalui shared wrapper component.
- Feature/page tidak boleh mengimpor Mantine secara langsung. Halaman memakai komponen project pada `frontend/src/components/common/` atau komponen domain yang relevan.
- HTML native dan semantik diprioritaskan. Toolkit digunakan untuk perilaku kompleks seperti dialog, drawer, select, date picker, menu, tooltip, dan notification.

Status source saat dokumen ini diperbarui: shared primitive sudah memakai CSS Modules dan dependency Mantine sudah ada pada `frontend/package.json` serta `package-lock.json`. Adopsi komponen Mantine pada runtime tetap bertahap melalui wrapper dan belum berarti seluruh primitive telah dimigrasikan. Empat stylesheet feature masih transitional dan dilacak eksplisit pada tracker migrasi di bawah agar status source tidak tersamar oleh wording “selama migrasi”.

## Source of truth

| Area | Canonical source |
|---|---|
| Warna, spacing, radius, shadow, motion | `frontend/src/styles/tokens.css` |
| Tipografi aplikasi | `@fontsource-variable/manrope/wght.css` di `frontend/src/main.jsx` + `--font-sans` di `frontend/src/styles/tokens.css` |
| Reset dan semantic global defaults | `frontend/src/styles/reset.css` |
| Shared UI primitive | `frontend/src/components/common/` |
| Layout aplikasi | `frontend/src/layouts/` dan `frontend/src/styles/app.css` |
| Responsive/PWA safe area | `frontend/src/styles/responsive.css` selama migrasi; feature style baru harus colocated |
| Keputusan toolkit | `docs/adr/0009-mantine-css-modules-ui-foundation.md` |

## Tipografi canonical

- Font utama seluruh UI adalah **Manrope Variable** dari dependency `@fontsource-variable/manrope` dan di-load satu kali pada `frontend/src/main.jsx`. Asset font dibundle oleh Vite dan dilayani dari origin aplikasi sendiri.
- `--font-sans` pada `frontend/src/styles/tokens.css` adalah satu-satunya sumber family sans-serif aplikasi. Page, feature, shared component, form, button, input, dan navigasi baru wajib mewarisi font global atau memakai `var(--font-sans)` bila deklarasi eksplisit memang diperlukan.
- Jangan menambahkan Google Fonts/CDN, `@import` font eksternal, atau `font-family` sans-serif hardcoded per komponen. Fallback system pada `--font-sans` hanya digunakan bila asset Manrope gagal dimuat.
- Bobot canonical desktop memakai token `--font-weight-regular` 400, `--font-weight-medium` 500, `--font-weight-semibold` 600, dan `--font-weight-bold` 700. Pada mobile `<=820px`, token presentasi menurunkan `semibold` ke 550 dan `bold` ke 650 agar Manrope tidak terasa terlalu tebal di layar kecil. Body mobile memakai 14px, body-sm 12px, sm 11.5px, dan xs 10.5px. Kontrol sentuh tetap minimal 44px sehingga density font tidak mengurangi accessibility.
- `--font-mono` tetap khusus untuk data teknis/diagnostik yang memang membutuhkan monospace. Nominal finansial tetap memakai font utama dengan `font-variant-numeric: tabular-nums` melalui pola `.money`.

## Palet warna canonical

Palet visual yang disetujui disimpan sebagai primitive pada `frontend/src/styles/tokens.css`, lalu dipetakan ke token semantik yang berbeda untuk light dan dark mode. Komponen hanya boleh memakai token semantik, bukan menyalin hex palet langsung.

| Primitive | Nilai | Peran utama |
|---|---:|---|
| Rich Black | `#0B1110` | Background utama dark mode |
| Dark Green | `#0F1A18` | Surface dark dan teks utama light |
| Bangladesh Green | `#03624C` | Primary light dan panel brand |
| Mountain Meadow | `#2CC295` | Secondary/accent |
| Caribbean Green | `#00D681` | Accent dekoratif terbatas |
| Mint | `#A7F3D0` | Highlight lembut dan foreground pendukung |
| Anti-Flash White | `#F4FAF7` | Teks utama dark/hero |
| Pistachio | `#E8F5EF` | Surface kuat dan primary-soft light |

Status pada light mode memakai varian yang lebih gelap dari accent referensi agar teks dan kontrol tetap memenuhi kontras WCAG. Dark mode dapat memakai accent referensi yang lebih terang karena kontras terhadap surface gelap sudah memadai. Browser `theme-color`, PWA background, sidebar rail, hero, focus ring, shadow, dan navigation surface wajib mengikuti token tema yang sama.

## Struktur komponen

Setiap shared component yang memiliki styling khusus memakai pasangan file:

```text
Component.jsx
Component.module.css
```

Komponen harus mempertahankan API kecil dan stabil. Business rule finansial tidak boleh diletakkan di primitive UI.

Struktur target:

```text
frontend/src/components/
├── common/       shared project primitives dan wrappers
├── feedback/     loading, empty, error, offline, conflict
├── finance/      target opsional untuk visual domain yang benar-benar dipakai lintas feature
├── navigation/   navigasi desktop/mobile
└── pwa/          install/update/connectivity state
```

`components/finance/` belum dibuat pada source saat ini. Itu **bukan gap implementasi**: `BudgetHeroCard`, `AccountFinancialCard`, chart, dan visual keuangan lain tetap colocated pada feature atau `components/charts/` sampai sedikitnya dua feature membutuhkan contract reusable yang sama. Jangan membuat abstraction/folder hanya untuk menyamai diagram target.

### Konvensi struktur feature

- Helper kecil boleh tetap colocated dengan page. Lakukan review pemecahan ke `components/`/hook terpisah saat file melewati sekitar 400 baris atau memiliki lebih dari 6 sub-komponen/hook lokal substantif. Threshold ini adalah trigger review, bukan aturan mass-refactor.
- Ekstraksi harus menurunkan coupling, duplication, atau cognitive load. Business rule tetap berada pada domain/service/view model yang canonical.
- Auth/session adalah guarded area. `LoginPage.jsx` yang besar dicatat sebagai kandidat struktur, tetapi tidak boleh dipecah hanya sebagai cleanup pada patch UI/report karena login production yang stabil lebih penting daripada keseragaman folder.
- Mobile Transaction History sudah diekstrak ke `features/transactions/components/MobileTransactionHistory.jsx` + CSS Module karena memiliki presentation contract sendiri (periode, tren ringkas, filter mobile, grouped history, dan pager). Presentation mobile dimuat lazy dari route agar penambahan UI tidak kembali mendorong route chunk melewati build budget. Desktop table/filter tetap di `TransactionsPage.jsx`; business rule, lifecycle, dan API tetap canonical di parent/service.
- Dialog Alokasi dan Anggaran serta presentation Jadwal Rutin yang berat memakai lazy boundary lokal. Tujuannya memberi headroom pada route chunk tanpa memindahkan business rule atau mengubah behavior; build-budget warning >=90% menjadi trigger untuk review boundary serupa.
- Abstraction shared baru dibuat ketika ada minimal dua consumer nyata dengan semantics yang sama.

### Tracker migrasi CSS Modules feature

Empat stylesheet berikut masih global/transitional dan merupakan backlog eksplisit ADR-0009:

- [ ] `frontend/src/features/dashboard/DashboardPage.css`
- [ ] `frontend/src/features/auth/LoginPage.css`
- [ ] `frontend/src/features/transactions/TransactionsPage.css` — tersisa untuk desktop filter/table + detail modal; mobile history baru sudah memakai `MobileTransactionHistory.module.css`.
- [ ] `frontend/src/features/dashboard/components/FinancialAlertList.css`

Migrasi dilakukan satu per satu bersama regression visual/behavior. Jangan menggabungkan migrasi auth, dashboard, transaksi, dan alert dalam satu patch besar.

## Aturan styling

1. Gunakan nama class yang menjelaskan peran, misalnya `dialog`, `header`, `amount`, `actions`; jangan menamai berdasarkan posisi acak seperti `mt-4` atau `flex-row-2`.
2. Gunakan token CSS untuk warna, spacing, radius, shadow, control height, dan motion.
3. Jangan menambahkan warna hex/rgb baru di component module. Warna baru harus masuk token dan diverifikasi pada light/dark mode.
4. Hindari inline style. Inline custom property hanya boleh untuk nilai runtime yang tidak dapat direpresentasikan statis dan harus diberi alasan pada review.
5. `!important` dilarang kecuali compatibility issue terdokumentasi.
6. Jangan styling berdasarkan struktur DOM internal toolkit yang tidak stabil.
7. Feature tidak boleh membuat ulang Button, Dialog, Badge, Progress, atau Money input sendiri.
8. Pertahankan global compatibility class selama migrasi bertahap; hapus hanya setelah usage search dan regression test membuktikan aman.
9. Page/form melakukan request melalui facade `features/<domain>/<domain>.api.js`; transport global bukan dependency langsung feature.
10. Token visual yang hanya dipakai satu feature harus diberi section ownership yang jelas pada `tokens.css` atau dipindahkan ke module feature ketika tidak membutuhkan theme-level override. Token `--account-*` saat ini sengaja dikelompokkan sebagai Accounts-only agar tidak menjadi precedent untuk menaruh semua token feature di global root.

## Feedback dan status ringkas

- `CompactNotice` pada `frontend/src/components/common/CompactNotice.jsx` dipakai untuk informasi nonblocking yang tetap perlu terlihat: guidance dari Perlu perhatian, status perangkat, ringkasan read-only, dan hint singkat di dalam form.
- Copy ringkas tidak memakai accordion atau tombol `Detail` bila satu sampai dua kalimat sudah cukup. Membuka informasi tambahan tidak boleh menyebabkan layout shift hanya untuk menjelaskan status sederhana.
- Error, conflict, offline, destructive confirmation, warning finansial yang memblokir, preview dampak saldo, import/restore/reset, maintenance, dan gangguan integrasi tetap memakai notice persisten yang lebih kuat. Informasi yang memengaruhi keputusan pengguna tidak boleh disembunyikan di tooltip/popover.
- Modal Tutup periode Alokasi Dana wajib menjelaskan dampak pada sisa dana dan bahwa periode berikutnya tetap disiapkan. Opsi `Pakai lagi kebutuhan di periode berikutnya` default off, hanya menyalin kategori + nominal rencana, dan tidak boleh memberi kesan transaksi, saldo, atau dana dipindahkan otomatis.
- Status dinamis menggunakan `role="status"` bila perlu diumumkan secara sopan. Error yang membutuhkan perhatian segera menggunakan `role="alert"`. State tidak boleh dibedakan hanya dengan warna.
- Zona waktu reminder tetap **Asia/Jakarta**. Presentation ringkas tidak boleh mengganti contract waktu, scheduler, Web Push, authorization, atau business rule backend.

- Bantuan edukatif per halaman memakai `PageInfoButton` pada `frontend/src/components/common/PageInfoButton.jsx`, idealnya tepat setelah judul halaman. Satu halaman cukup memiliki satu trigger `Info`; jangan menambahkan ikon info pada setiap card, filter, atau tombol.
- `PageInfoButton` membuka `Modal` canonical, memiliki accessible name, focus management, target sentuh minimal 44×44px, dan swipe-to-close mobile. Isi bantuan maksimal beberapa kalimat yang menjelaskan fungsi halaman, bukan warning operasional.
- Jika `PageHeader` memiliki contextual help, deskripsi edukatif di bawah judul boleh disembunyikan pada mobile `<=820px` agar header lebih compact. Deskripsi yang memengaruhi keputusan finansial tetap harus terlihat sebagai notice/panel, bukan dipindahkan ke modal info.
- Empty state seluruh halaman memakai variant `panel`; empty state subsection memakai `inline`. Hindari membungkus `EmptyState` di `Card` kedua hanya untuk menghasilkan boundary visual yang sama.


### Transaction History mobile

- Pada viewport `<=820px`, halaman Transaksi memakai hierarchy **history-first**. Page header hanya membawa judul route; body tidak mengulang heading/description "Riwayat transaksi".
- Periode dan grafik tren ringkas ditempatkan sebagai satu konteks visual tanpa card bertumpuk. Grafik membaca `reports.monthly` (6 bulan) dan tidak menghitung ulang ledger dari subset list transaksi.
- Filter cepat hanya menampilkan `Semua`, `Pengeluaran`, `Pemasukan`, `Transfer`, Search, dan Filter. Rekening, kategori, pencatat, alokasi, Refund, serta Penyesuaian berada di dialog filter lanjutan agar list tidak penuh kontrol.
- Badge pada row hanya untuk exception/asal penting: `Jadwal rutin`, `Target`, `Belum dialokasikan`, atau `Dibatalkan`. Metadata lain tersedia pada detail transaction sheet/modal.
- Detail mobile menampilkan jenis, kategori, rekening, alokasi, pencatat, tanggal Asia/Jakarta, dan sumber transaksi. Lifecycle edit/cancel/restore tetap memakai capability backend canonical.


### Composer transaksi mobile

- `Tambah transaksi` memakai satu bottom sheet compact. Header hanya memuat asset transaksi, judul, drag handle, dan tombol tutup; hindari hero card dekoratif di dalam modal.
- Jenis transaksi memakai ikon `FinanceChoiceIcons` canonical dan grid 2×2 pada `<=820px`. Label tidak boleh mengulang makna melalui subtitle seperti “Uang keluar” atau “Dana kembali”.
- Nominal tetap kosong saat composer baru dibuka untuk mencegah salah input. Quick amount yang tersedia adalah 20 rb, 50 rb, 100 rb, 200 rb, dan 500 rb; memilih chip hanya mengisi input, bukan menyimpan transaksi.
- Field pembayaran, merchant/penerima, alasan over-budget bila relevan, dan catatan tampil langsung pada alur form. Jangan memakai accordion `Detail tambahan` untuk field transaksi yang memang bisa dibutuhkan saat pencatatan.
- Footer `Batal` dan `Simpan transaksi` tetap sticky. Saat submit berjalan, modal menjadi non-dismissible sehingga Escape, backdrop, tombol tutup, dan swipe tidak dapat membatalkan request yang outcome-nya belum diketahui.

## Modal dan overflow mobile

- `.modal__body` adalah satu-satunya scroll container internal dialog dan hanya boleh menggulir vertikal. Horizontal overflow harus ditutup pada container, bukan pada konten dengan clipping acak.
- `form-grid`, child grid, `fieldset`, `.field`, money input, dan native file input wajib memiliki `min-width: 0` serta `max-width: 100%`.
- Indikator scrollbar dapat disembunyikan pada mobile, tetapi `overflow-y: hidden`, pembatasan zoom viewport, dan konten footer yang tidak dapat dijangkau dilarang.
- Carousel horizontal hanya boleh dipakai untuk kontrol yang memang memilih urutan item, saat ini rekening. Filter, tab kategori, dan kelompok ikon harus wrap atau grid.
- Boundary mobile canonical adalah `<=820px`; dialog dismissible memakai bottom-sheet dengan animasi masuk dari bawah dan swipe-to-dismiss sebagai default canonical. `>=821px` kembali ke perilaku dialog desktop. Full-screen flow khusus boleh opt-out dari swipe bila gesture akan bertabrakan dengan navigasi utama.
- Modal yang sedang menjalankan mutation kritis wajib memakai state `dismissible=false`: tombol tutup tidak terlihat aktif, Escape/backdrop/swipe tidak menutup modal, dan focus trap tetap berjalan sampai server memberi hasil.

## Information architecture Pengaturan

- `/pengaturan` adalah ringkasan status. Notifikasi, Integrasi, Export, Import, Backup, Pemulihan, Periode, dan Audit memakai nested route sendiri. Pengelolaan anggota berada pada route top-level `/anggota` agar tidak tercampur dengan konfigurasi aplikasi; route lama `/pengaturan/anggota` hanya redirect kompatibilitas.
- Setiap route hanya memuat resource yang dibutuhkan dan menampilkan loading/error/result dekat tindakan. Error Audit tidak boleh mengganggu Notifikasi, dan sebaliknya.
- Administrator-only item boleh disembunyikan dari navigasi member, tetapi direct route tetap harus menampilkan guard dan backend selalu menjadi authorization utama.
- Tile layanan adalah `button` bila melakukan aksi. Status siap tanpa aksi tidak boleh diberi click handler pada elemen non-interaktif.

## HTML semantik

Gunakan elemen berdasarkan makna:

- `header`, `nav`, `main`, `section`, `article`, `aside`, `footer` untuk struktur.
- `button` untuk aksi dan `a`/`NavLink` untuk navigasi.
- `form`, `fieldset`, `legend`, `label` untuk input.
- `table` hanya untuk data tabular.
- `progress` untuk progres terukur.
- Dialog wajib memiliki `role="dialog"`, `aria-modal`, accessible name, focus trap, Escape handling, dan focus restoration.
- Shell/page adalah pemilik landmark `main`. Feedback primitive seperti loading, empty, dan error di dalam page wajib memakai container non-landmark agar tidak menghasilkan nested `main`.
- Feedback canonical menyediakan konteks `page`, `panel`, dan `inline`; heading level harus mengikuti hierarchy halaman, bukan dipaksakan oleh primitive.

Elemen non-interaktif tidak boleh diberi click handler untuk menggantikan button/link.

## Aksesibilitas minimum

- Semua kontrol memiliki accessible name.
- Kontrol yang dimiliki aplikasi memiliki target sentuh minimal 44×44 CSS pixel.
- Widget provider-managed yang tidak dapat diubah tanpa melanggar kontrak/branding provider wajib berada dalam host layout minimal 44px, memiliki accessible name, dan target interaktif provider minimal 24×24 CSS pixel. Pengecualian ini harus eksplisit dan diuji, bukan berlaku umum.
- Focus-visible tidak boleh dihilangkan.
- Contrast text dan control state harus lulus WCAG AA.
- State tidak hanya dibedakan dengan warna.
- Reduced motion dihormati.
- Loading memakai `aria-busy` atau status region yang sesuai.
- Error form terhubung melalui `aria-describedby` dan `aria-invalid`.
- Keyboard dan screen reader harus dapat menyelesaikan alur transaksi utama.

## Pola kartu rekening

- Daftar rekening memakai komponen domain `AccountFinancialCard`, bukan card generik yang ditata ulang di page.
- BCA, BNI, BTN, Mandiri, dan Permata memakai asset WebP 768×484 sebagai base visual. Tunai dan Tabungan memakai asset non-bank 768×484; E-wallet dapat memakai asset ShopeePay, DANA, GoPay, OVO, atau LinkAja ketika provider dapat dikenali dari nama rekening. Wordmark/logo dekoratif hanya berasal dari asset; HTML tidak boleh menggambarnya kembali.
- Semua kartu memakai rasio 1.586:1, container, radius, dan object sizing yang sama. Tidak boleh ada bank yang tampak lebih panjang, pendek, atau terbungkus panel dekoratif tambahan.
- Surface rekening yang menampilkan alokasi wajib membedakan **Saldo rekening**, **Dialokasikan**, dan **Dana tersedia**. `Dialokasikan` adalah bagian dari saldo, bukan nominal tambahan. Jangan menjumlahkan saldo rekening + Alokasi Dana sebagai total kekayaan.
- Selector rekening untuk pengeluaran, Transfer, Alokasi, Jadwal rutin, dan Target menampilkan `available_balance` sebagai konteks dana bebas bila relevan. Preview tetap boleh menampilkan `balance` fisik agar pengguna memahami asal perhitungannya.
- Alokasi Dana wajib menampilkan atau dapat ditelusuri ke satu rekening sumber. UI tidak menawarkan sumber “gabungan rekening” untuk pembuatan Alokasi Dana baru, dan pilihan Alokasi Dana pada transaksi difilter ke rekening sumber yang sama sebelum backend melakukan guard ulang.
- Card face menambahkan contactless, nomor rekening yang sudah dinormalisasi, dan nama rekening. Pada stack mobile terautentikasi, saldo saat ini dan label kepemilikan boleh tampil sebagai overlay ringkas; status, timestamp, nomor lengkap, dan aksi tetap berada pada panel detail.
- Nomor rekening berasal dari `accounts.account_number`, dikelompokkan empat digit, dan hanya ditampilkan setelah authentication serta binding user backend. Kedua pengguna terotorisasi dapat membacanya; tombol salin berada di panel detail dan memiliki accessible name.
- Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap dilarang pada asset, DOM, payload, audit, dan integrasi.
- Desktop lebar memakai satu rekening terpilih dengan satu kartu ATM yang terlihat pada satu waktu. Pergantian rekening dilakukan hanya melalui carousel kartu (panah, keyboard, swipe/drag, atau indikator posisi); kartu tetangga tidak boleh mengintip dari sisi viewport. Detail rekening dan transaksi terbaru mengikuti rekening terpilih, sedangkan Komposisi saldo bersifat read-only dan tidak menjadi selector kedua.
- Mobile memakai circular 3D card stack dengan node kartu yang stabil. Satu rekening menampilkan satu kartu, dua rekening menampilkan dua kartu, dan tiga atau lebih menampilkan maksimal tiga kartu terlihat dengan ukuran serta rasio yang identik. Swipe vertikal pada kartu aktif dan tombol Arrow Up/Down memutar urutan secara sirkular; wheel, auto-rotate, pagination dots, dan panah samping tidak digunakan.
- Area kosong stack wajib memakai `touch-action: pan-y pinch-zoom`. Kartu aktif memakai `touch-action: pan-x pinch-zoom` agar gesture vertikal mengubah rekening tanpa mematikan pinch zoom. Gesture horizontal harus ditolak dan tidak boleh membuka detail atau mengubah rekening.
- Selama gesture, seluruh tumpukan mengikuti jari menggunakan `transform`/`opacity`; kartu depan bergerak ke belakang dan kartu berikutnya maju ke depan. Swipe pendek kembali ke posisi semula, reduced-motion mengurangi rotasi dan durasi, dan rekening aktif diumumkan tanpa membacakan saldo.
- Filter ownership pada Rekening memakai empat chip `Semua`, `Saya`, `Pasangan`, dan `Bersama` dalam **satu baris empat kolom** pada mobile normal 320–430px. Label tidak boleh turun ke baris kedua dan filter tidak memakai horizontal carousel. Filter hanya mempersempit pilihan rekening yang ditampilkan; panel insight global desktop tetap menghitung seluruh rekening yang boleh dibaca pengguna.
- Label pemilik pada muka kartu mobile hanya memakai nama depan agar tidak wrap; identity strip tepat di bawah stack menampilkan nama rekening dan nama pemilik lengkap secara sejajar, lalu nomor rekening terformat empat digit dan scope `Pribadi`/`Rekening bersama`. Data nama dan nomor asli tidak dipotong atau diubah pada persistence.
- Transfer mobile adalah aksi compact di header Rekening bersama tombol tambah. Trigger boleh berubah secara presentational, tetapi ketika ditekan wajib tetap membuka `TransactionForm` canonical `presentation="mobile-transfer"`; mutation, source account, idempotency, success state, dan refresh saldo tidak boleh diduplikasi di feature Rekening.
- Nomor rekening panjang boleh dipadatkan hanya pada muka kartu agar tidak overflow; panel detail, accessible copy action, dan data backend tetap memakai nomor lengkap.
- Bank yang tidak dikenali, E-wallet yang providernya tidak dikenali, serta tipe non-bank tanpa asset khusus memakai fallback flat berbasis satu design token. Tunai dan Tabungan adalah pengecualian karena memiliki asset internal khusus. Provider E-wallet canonical berasal dari `accounts.ewallet_template`; deteksi nama hanya fallback legacy dan tetap bukan authorization signal.
- Rekening dan kategori tidak dicampur dalam satu halaman. `/rekening` memakai aksi `Tambah rekening`; `/kategori` memakai aksi `Tambah kategori`. Dialog Tambah rekening memakai pilihan jenis compact, tiga kolom pada mobile sehingga delapan tipe tetap muat dalam tiga baris, tanpa preview kartu atau helper panjang yang tidak dibutuhkan. Field `No rekening` tetap wajib untuk rekening bank; formatting tampilan tidak mengubah nilai persistence.
- Template bank disimpan pada `accounts.bank_template` schema v5 dan provider E-wallet disimpan pada `accounts.ewallet_template` schema v8. Keduanya bersifat presentational: perubahan template/provider tidak mengubah nama, saldo, ownership, atau aturan transaksi.


## Ilustrasi ringkasan finansial

- Artwork dekoratif hanya boleh memperkuat satu summary/hero utama atau empty state. Jangan membuat card baru hanya untuk gambar dan jangan mengulang artwork pada setiap item list.
- Halaman yang saat ini memiliki summary-art canonical: Perencanaan/Alokasi Dana (`wallet.webp`), Perencanaan/Jadwal Rutin (`finance-checklist.webp`), Target (`piggy-bank.webp`), dan Anggota (`house.webp`). File fisik empat aset terakhir masih berada di `public/login/assets/mobile/` karena login juga menggunakannya; path tersebut diperlakukan sebagai shared visual asset sampai ada migrasi asset terpisah yang aman.
- Artwork bersifat dekoratif: `alt=""`, `aria-hidden="true"`, `pointer-events: none`, tidak boleh menjadi sumber informasi atau authorization signal. Semua nominal, progress, status, dan capability tetap berasal dari read model/domain existing.
- Desktop menempatkan artwork di sisi kanan hero dengan ruang copy sekitar dua pertiga lebar. Mobile mengecilkan artwork sekitar 29–31% lebar card dan menjaga copy utama tetap terbaca pada viewport 320–430px.
- Dashboard, Transaksi, Laporan, Rekening, Kategori, serta halaman Pengaturan tidak menerima hero-art tambahan hanya demi konsistensi visual. Chart, kartu rekening, taxonomy icon, dan utility surface existing sudah menjadi fokus visual masing-masing route.
- Satu surface hanya memiliki satu hierarchy visual: headline/nominal, progress atau status, metadata ringkas, lalu artwork. Hindari pola card-di-dalam-card atau deretan badge dekoratif yang tidak menambah informasi.

## Lebar konten dan hierarchy aksi

- Shell desktop memiliki dua density width: `app-content--standard` untuk halaman operasional dan `app-content--wide` untuk Dashboard/Laporan yang membutuhkan chart atau tabel lebar. Standard content dipusatkan dan dibatasi sekitar 1250px; wide content mengikuti `--content-max`. Pada `<=820px` kedua variant kembali `width: 100%` tanpa max-width.
- Setiap halaman memprioritaskan satu primary action. Aksi penting kedua memakai secondary/default button, utility seperti reload memakai tertiary/icon action, dan aksi jarang seperti edit/archive boleh masuk overflow menu bila alur existing memang mendukungnya. Destructive action tetap memakai confirmation guard.
- Nominal, status, atau copy nol tidak diulang pada beberapa surface dalam satu empty state. Contoh: Alokasi Dana kosong cukup menyatakan belum ada dana dialokasikan dan menyediakan CTA; metrik `0 dari 0`, progress nol, dan label kosong yang identik tidak perlu ditampilkan bersamaan.
- Radius, spacing, dan control size pada file yang disentuh memakai design token existing. Jangan melakukan mass-refactor CSS di luar scope hanya untuk menyamakan angka radius.

## Mobile dan PWA

- Mobile adalah layout aplikasi, bukan desktop yang diperkecil.
- Navigasi bawah fixed harus menyisakan safe area dan ruang scroll.
- Indikator scrollbar mobile boleh disembunyikan untuk tampilan app-like, tetapi scroll vertikal tidak boleh dikunci, body tidak boleh membentuk nested scroll yang membingungkan, dan konten terakhir harus tetap dapat dijangkau.
- Full-height app memakai fallback `100vh` lalu `100dvh` pada root dan shell. Jangan memakai `100vh` sebagai satu-satunya sumber tinggi mobile.
- Route full-bleed atau route dengan surface khusus wajib memasang background pada shell/main/content, bukan hanya page component, agar reserved navigation gap dan safe area tetap menyatu secara visual.
- Loading/fatal error di luar shell memenuhi viewport. Loading/fatal error/404 di dalam shell memenuhi sisa area content, bukan menambah viewport penuh di dalam shell.
- Dialog menjadi bottom sheet pada viewport kecil tanpa menduplikasi business form. Animasi masuk memakai gerak bawah-ke-atas yang singkat dan halus; `prefers-reduced-motion` wajib menonaktifkan gerak non-esensial.
- `input`, `select`, dan `textarea` memakai token canonical `--font-size-body: 16px` agar pencegahan auto-zoom Safari tidak bergantung pada breakpoint; aturan ini juga berlaku pada filter CSS Module dan dashboard tablet. Viewport zoom tidak boleh dinonaktifkan.
- Setiap `var(--token)` statis harus memiliki definisi canonical. Custom property runtime hanya diizinkan untuk nilai yang benar-benar disuntikkan komponen dan wajib tercakup regression test. Jangan membuat alias semantik baru jika token existing seperti `--border`, `--surface-soft`, `--text`, atau `--negative` sudah sesuai.
- Gradient yang memuat teks atau ikon informatif harus lolos kontras pada setiap endpoint warna di light dan dark theme. Text shadow tidak dihitung sebagai pengganti rasio WCAG.
- Keyboard virtual tidak boleh menutup nominal atau action utama.
- PWA tetap `display: standalone`; Fullscreen API tidak dipaksakan.
- Offline write finansial tetap dilarang.

## Kontrak responsive global

- `frontend/src/styles/responsive.css` memakai satu blok canonical per breakpoint dan diurutkan dari viewport besar ke kecil: 1280, 1100, 940, 820, 767, 680, 580, 520, 420, 370.
- Selector yang berakhir koma tidak boleh dipisahkan baris kosong. Static test wajib menolak dangling selector.
- Layout multi-kolom pada mobile harus berubah menjadi satu kolom, bukan disembunyikan. Capability anchor route penting wajib memiliki `width > 0` dan `height > 0` pada browser test mobile.
- `!important` hanya dipertahankan untuk compatibility yang didokumentasikan; reduced-motion global adalah pengecualian canonical saat ini.

## State wajib setiap komponen

Komponen penting harus mempertimbangkan:

- default, hover, active, focus-visible;
- disabled dan loading;
- empty, error, offline, unauthorized, conflict;
- light dan dark mode;
- mobile sempit dan desktop;
- teks panjang dan nominal besar;
- reduced motion.

## Kebijakan Mantine

Adopsi Mantine harus dilakukan bertahap:

1. Pertahankan versi dependency dan `package-lock.json` dalam perubahan yang sama saat upgrade.
2. Tambahkan provider/theme bridge tanpa menghapus token project.
3. Migrasikan wrapper satu per satu, dimulai dari Dialog/Drawer dan form control kompleks.
4. Jangan memakai `sx`, styling prop, atau direct import di feature untuk layout normal.
5. Setiap migrasi wajib lulus lint, unit/static contract test, build, keyboard test, mobile test, dan dark/light review.
6. CSS lama dihapus hanya ketika tidak ada usage dan visual regression telah diperiksa.

## Navigasi shell

- Information architecture canonical: menu `Perencanaan` membuka workspace dengan dua tab, `Alokasi Dana` dan `Jadwal Rutin`. `Kebutuhan` dikelola di detail Alokasi Dana dan tetap memakai kategori + budget existing. `Anggaran` adalah menu overview read-only lintas seluruh Kebutuhan, bukan tempat membuat objek kedua. Target tetap feature Perencanaan tersendiri; Data keuangan memuat Rekening serta Kategori; Cocokkan Saldo (rekonsiliasi) berada pada Kontrol saldo; Pengaturan berada pada Aplikasi.
- Route canonical workspace tetap `/perencanaan/kantong` dan `/perencanaan/jadwal` untuk compatibility kontrak internal. `/anggaran` adalah route canonical overview read-only. Route lama `/alokasi` dan `/tagihan` tetap compatibility redirect dan harus mempertahankan navigation state yang relevan. `/laporan` tetap analitis dan tidak memuat mutation Kebutuhan.
- Mobile `/laporan` pada breakpoint ≤820px memakai presentation khusus yang clean dan analitis tanpa mengubah contract `reports.monthly`: header ringkas, segmented `Ringkasan`/`Per kategori`, navigasi bulan, pilihan tren 3/6/12 bulan, chart pengeluaran, tiga KPI utama, perbandingan dengan bulan sebelumnya, kategori terbesar, peringatan actionable, anggaran vs aktual, serta rincian rekening/nature/pencatat melalui progressive disclosure. Semua angka berasal dari response report existing atau turunan deterministik dari `trend.items`; UI tidak membuat agregasi dari page slice dan tidak menambah mutation. Ikon kategori memakai katalog canonical project dari bootstrap kategori. Desktop mempertahankan report workspace existing.
- Sidebar desktop mempertahankan mask melengkung brand Saldo Bersama. Ukurannya boleh diperbesar untuk tap target dan proporsi layar, tetapi bentuk/aset canonical tidak boleh diganti tanpa approval visual baru.
- Kontrol utama desktop minimum 44×44px. Enam kontrol canonical dikelompokkan rapat di tengah rail tanpa mengubah mask organik. Submenu grup memakai anchored flyout di samping trigger, label satu baris, trigger-toggle, Escape, click-outside, route-close, dan focus restoration; tombol X tidak diperlukan untuk flyout navigasi.
- Theme toggle hanya tampil pada kontrol shell yang canonical. Menu mobile “Menu lainnya” tidak menduplikasi dark/light toggle; logout berada pada footer terpisah dan bottom navigation tetap tersedia. Quick add transaksi global disembunyikan pada seluruh subtree `/pengaturan` agar halaman konfigurasi, maintenance, reset, backup, dan recovery tidak memiliki aksi finansial yang tidak relevan.

## Login dan pengguna

- Login desktop memakai artwork approved sebagai visual layer utuh agar komposisi light/dark konsisten dengan desain referensi. Artwork mempertahankan rasio 1672×941 dan ditampilkan tanpa menggambar ulang ilustrasi dengan CSS. Area autentikasi desktop memakai tombol Google branded yang sama dengan mobile, dengan logo Saldo Bersama, copy ringkas, security hints, dan error/retry hanya saat diperlukan.
- Login mobile ≤820px memakai empat halaman: tiga onboarding (“Rajin menabung, bijak belanja”, “Atur anggaran, hindari boros”, “Keuangan bersama, tetap jelas”) lalu halaman login khusus. Onboarding memakai UI React semantik dengan hero card clean, aset transparan terpisah, white space yang cukup, serta maksimal tiga ilustrasi per scene; tidak memakai poster full-page 941×1672 dan tidak menampilkan pill fitur tambahan di bawah deskripsi. Pada viewport mobile normal 320–430px termasuk tinggi pendek yang didukung, setiap halaman harus muat dalam satu layar tanpa scroll vertikal internal. Swipe horizontal mengikuti pointer secara real time; `Lewati`, pagination, dan ArrowLeft/ArrowRight tetap tersedia. Progress bar, counter langkah, tombol kembali visual, dan tombol besar `Lanjut` tidak dipakai karena swipe/pagination sudah menjadi kontrol utama. `prefers-reduced-motion` mematikan transisi yang tidak esensial.
- Artwork tidak boleh menggantikan kontrol autentikasi. Desktop dan mobile tidak memakai `google.accounts.id.renderButton()` pada halaman login; keduanya mempertahankan tombol HTML branded Google milik Saldo Bersama. Production canonical memakai full-page Google OAuth server flow dari tombol yang sama, sedangkan localhost/device emulation memakai Firebase popup fallback. Perbedaan transport auth tidak boleh mengubah layout, artwork, spacing, typography, swipe, dots, atau branded login button.
- Halaman login keempat memakai logo project `/brand/saldo-bersama-mark.png`, creator link aman, dan efek uang jatuh hanya ketika halaman login aktif. Progress bar onboarding dan tombol back tidak ditampilkan agar fokus pada autentikasi. Tombol `Masuk dengan Google` harus muat penuh dalam satu layar, memakai logo Google resmi tanpa modifikasi, disabled selama request, dan tidak mengubah bentuk setelah render. Module auth mobile dipreload sebelum tombol aktif. Production menavigasi full-page ke server OAuth start; callback server menyelesaikan Google → Firebase → server session tanpa browser redirect state. Localhost/device emulation memakai in-memory Firebase popup fallback. Backend allowlist, role, dan verifikasi token tetap source of truth. Error OAuth/popup/network/provider ditampilkan dengan copy ramah tanpa raw provider error. Label “Selamat datang” tampil sederhana tanpa garis eyebrow dekoratif. Link creator eksternal harus memakai `noopener noreferrer`, focus-visible, dan target sentuh minimum 44px. Theme toggle mobile adalah kontrol DOM asli pada header.
- Halaman `Anggota` tetap Administrator-only dan tampil sebagai menu tersendiri pada desktop serta grup `Akses` di Menu lainnya mobile. Daftar memakai card profil yang mudah dipindai, search nama/email, filter role, dan Modal canonical untuk tambah/ubah. Akun yang sedang login boleh ditonjolkan sebagai profile card, sedangkan destructive member action tetap memakai confirmation guarded dan backend authorization.
- `UserAvatar` memakai foto Google hanya bila URL profil tersedia dari session/read model tepercaya. Session server mempertahankan `photoURL` Google yang host-nya sesuai CSP (`lh3.googleusercontent.com`) agar foto akun aktif tidak hilang setelah refresh. Jika `users.list` tidak menyediakan foto pengguna lain, gunakan initials fallback; jangan menambah kolom schema hanya untuk kosmetik, jangan mengambil foto dari Google Search, dan jangan mengarang URL.
- Aktivitas pengguna adalah audit-friendly view atas ledger existing berdasarkan `created_by`, bukan ledger baru dan bukan ukuran kontribusi finansial. Copy wajib menyebutnya sebagai pencatat, bukan pembayar/pemakai.
- Desktop menampilkan aktivitas pengguna sebagai right drawer read-only. Mobile ≤820px menampilkan full-screen detail dengan focus trap, tombol kembali, body scroll lock, safe area, dan focus restoration.
- Ringkasan nominal per pencatat hanya boleh memakai agregasi backend exact. Total transaksi dapat memakai `transactions.list.total`; pengeluaran dapat memakai `reports.monthly.creatorExpenses`. Jangan menghitung agregasi dari page slice.
- Shortcut ke daftar lengkap memakai route canonical `/transaksi` dan router state untuk initial filter `creatorId`/`period`; jangan menaruh user id atau data finansial pada URL.

## Review checklist UI

- Apakah elemen semantik sudah tepat?
- Apakah shared component existing digunakan?
- Apakah token dipakai tanpa hardcoded visual value baru?
- Apakah focus, keyboard, error, loading, mobile, dan dark mode diuji?
- Apakah perubahan memengaruhi transaksi, saldo, authorization, atau data flow?
- Apakah screenshot/preview mencakup mobile dan desktop?
- Apakah docs, changelog, status, serta handoff diperbarui?

## Feedback dan status aksi

- Success/info/warning yang transient memakai `FeedbackProvider`/`useFeedback` dengan `aria-live=polite`, dedupe, safe-area mobile, dan reduced-motion.
- Workflow yang sudah memiliki feedback lokal kaya tidak boleh menduplikasi GlobalProcessIndicator + toast. Route Cocokkan Saldo memiliki progress lokal yang membedakan fase simpan server dan refresh read-model, lalu memakai result overlay terfokus setelah server mengonfirmasi write.
- Pencocokan saldo yang matched pada mobile boleh memakai full-screen success experience dengan animasi uang satu-shot dari visual MoneyRain existing; animasi wajib staggered, berada di belakang konten, berhenti sendiri, dan hilang pada `prefers-reduced-motion`. Hasil difference tidak memakai celebration dan tetap mempertahankan warning yang dapat ditindaklanjuti.
- Error mutation, `row_version` conflict, outcome write yang tidak pasti, maintenance/read-only, backup/restore/import, dan status integrasi yang perlu ditindaklanjuti **tidak boleh** hanya berupa toast yang auto-dismiss; gunakan notice/error state persisten.
- Aksi destructive tetap memakai modal/confirmation guard. Label “undo” hanya boleh memanggil compensating action domain yang audited (mis. cancel/reverse), bukan hard rollback atau penghapusan histori.
- Halaman baru tidak boleh membuat toast/snackbar implementation sendiri; gunakan primitive feedback canonical.

## Kontrak capability desktop dan mobile

- Semua route, data, aksi, state, dan izin yang tersedia pada desktop wajib dapat dijangkau pada mobile PWA; begitu juga sebaliknya.
- Kesetaraan berarti **capability parity**, bukan tampilan piksel-identik. Desktop boleh memakai toolbar/panel, sedangkan mobile boleh memakai drawer, bottom sheet, `details`, atau card ringkas.
- Authorization dan business behavior tidak boleh bercabang berdasarkan viewport, user agent, atau status PWA. Keduanya memakai handler, API facade, serta backend guard yang sama.
- Komponen presentasi desktop/mobile wajib memakai domain/read model canonical yang sama ketika menampilkan data yang sama. Kontrol presentasi boleh berbeda bila dataset yang tersedia memang berbeda cakupan; contoh: Dashboard mobile hanya menampilkan lima transaksi terbaru dari recent slice, sedangkan search/filter lengkap tetap di `/transaksi`. Shortcut utama Beranda mobile adalah `Pemasukan`, `Pengeluaran`, dan `Transfer`; shortcut perencanaan tetap dijangkau melalui navigasi feature terkait agar Beranda tidak menduplikasi fungsi. Jika ada alert actionable, `Perlu perhatian` tampil sebelum informasi rekening sekunder. Transfer baru pada viewport mobile tetap memakai `TransactionForm` canonical dengan presentasi `mobile-transfer`. Business form tidak boleh diduplikasi hanya untuk perangkat berbeda.
- Setiap breakpoint harus menyediakan jalur sesi yang terlihat. Desktop logout tidak boleh disembunyikan sebelum navigasi mobile yang memuat logout aktif.
- Route sekunder pada navigasi mobile harus memberi orientasi aktif melalui menu `Lainnya` dan `aria-current`.
- Pengurangan informasi pada mobile hanya boleh melalui progressive disclosure; data atau aksi tidak boleh dihapus tanpa pengganti yang dapat dijangkau.
- Perubahan dashboard/navigation wajib diuji pada batas 820/821 dan 940/941 CSS pixel, selain viewport ponsel, tablet, dan desktop umum.

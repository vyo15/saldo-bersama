# UI Design System

Dokumen ini adalah kontrak visual dan implementasi UI Saldo Bersama. Tujuannya menjaga tampilan konsisten, semantik, aksesibel, dan mudah dilanjutkan oleh developer atau ChatGPT lain tanpa membuat pola styling baru pada setiap halaman.

## Keputusan utama

- Framework aplikasi tetap React + Vite.
- Styling canonical menggunakan CSS Modules dan design tokens pada `frontend/src/styles/tokens.css`.
- Tailwind CSS, utility-class-heavy styling, dan shadcn/ui tidak digunakan.
- Mantine disetujui sebagai toolkit kandidat untuk kebutuhan kompleks, tetapi dependency tidak dipasang sampai ada shared wrapper component yang benar-benar menggunakannya.
- Feature/page tidak boleh mengimpor Mantine secara langsung. Halaman memakai komponen project pada `frontend/src/components/common/` atau komponen domain yang relevan.
- HTML native dan semantik diprioritaskan. Toolkit digunakan untuk perilaku kompleks seperti dialog, drawer, select, date picker, menu, tooltip, dan notification.

Status source saat dokumen ini diperbarui: shared primitive dan stylesheet feature utama sudah memakai CSS Modules dan design token project tanpa dependency Mantine runtime. Jika nanti primitive kompleks membutuhkan Mantine, adopsi harus dimulai melalui shared wrapper dengan consumer nyata dan package/lockfile diperbarui pada patch yang sama. Global CSS dibatasi untuk reset, token, root/base, accessibility/shared primitives, dan shell responsive; layout/state milik feature harus tetap colocated pada CSS Module pemiliknya.

## Source of truth

| Area | Canonical source |
|---|---|
| Warna, spacing, radius, shadow, motion | `frontend/src/styles/tokens.css` |
| Tipografi aplikasi | `@fontsource-variable/manrope/wght.css` di `frontend/src/main.jsx` + `--font-sans` di `frontend/src/styles/tokens.css` |
| Reset dan semantic global defaults | `frontend/src/styles/reset.css` |
| Shared UI primitive | `frontend/src/components/common/` |
| Layout aplikasi | `frontend/src/layouts/` dan `frontend/src/styles/app.css` |
| Responsive/PWA safe area | `frontend/src/styles/responsive.css` untuk shell/global safe area; responsive feature tetap colocated |
| Keputusan toolkit | `docs/adr/0009-mantine-css-modules-ui-foundation.md` |
| Breakpoint JS canonical | `frontend/src/config/layout.js` (`APP_BREAKPOINTS` / `APP_MEDIA`) |

## Tipografi canonical

- Font utama seluruh UI adalah **Manrope Variable** dari dependency `@fontsource-variable/manrope` dan di-load satu kali pada `frontend/src/main.jsx`. Asset font dibundle oleh Vite dan dilayani dari origin aplikasi sendiri.
- `--font-sans` pada `frontend/src/styles/tokens.css` adalah satu-satunya sumber family sans-serif aplikasi. Page, feature, shared component, form, button, input, dan navigasi baru wajib mewarisi font global atau memakai `var(--font-sans)` bila deklarasi eksplisit memang diperlukan.
- Jangan menambahkan Google Fonts/CDN, `@import` font eksternal, atau `font-family` sans-serif hardcoded per komponen. Fallback system pada `--font-sans` hanya digunakan bila asset Manrope gagal dimuat.
- Bobot canonical desktop memakai token `--font-weight-regular` 400, `--font-weight-medium` 500, `--font-weight-semibold` 600, dan `--font-weight-bold` 700. Pada mobile `<=820px`, token presentasi menurunkan `semibold` ke 550 dan `bold` ke 650 agar Manrope tidak terasa terlalu tebal di layar kecil. Body mobile memakai 14px, body-sm 13px, sm 12.5px, dan xs 12px. Native `input`/`select`/`textarea` tetap 16px melalui `--mobile-native-control-font-size` untuk mencegah auto-zoom Safari, sedangkan target sentuh efektif tetap minimal 44×44px. Informasi finansial/status/metadata yang perlu dibaca tidak boleh turun di bawah kira-kira 12px; teks facsimile/dekoratif non-informatif (misalnya miniature kartu atau elemen money-rain `aria-hidden`) boleh lebih kecil hanya bila informasi operasional yang relevan tetap tersedia pada copy semantik yang mudah dibaca.
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
- Auth/session adalah guarded area. Presentasi Login sudah dipisah desktop/mobile dan memakai CSS Module, tetapi transport/auth/session authority tetap tidak boleh dipindahkan hanya demi keseragaman struktur.
- Mobile Transaction History sudah diekstrak ke `features/transactions/components/MobileTransactionHistory.jsx` + CSS Module karena memiliki presentation contract sendiri (periode, tren ringkas, filter mobile, grouped history, dan pager). Presentation mobile dimuat lazy dari route agar penambahan UI tidak kembali mendorong route chunk melewati build budget. Desktop table/filter tetap di `TransactionsPage.jsx`; business rule, lifecycle, dan API tetap canonical di parent/service.
- Dialog Alokasi dan Anggaran serta presentation Jadwal Rutin yang berat memakai lazy boundary lokal. Tujuannya memberi headroom pada route chunk tanpa memindahkan business rule atau mengubah behavior; build-budget warning >=90% menjadi trigger untuk review boundary serupa.
- Hub **Pemeliharaan data** juga memakai lazy boundary per tab: `ResetDataPage` dan `FullResetPage` tidak boleh di-import sinkron oleh `MaintenanceDataPage`. Pergantian tab hanya memuat flow yang dipilih, sementara API, guard owner, idempotency, recovery, dan confirmation contract tetap dimiliki page masing-masing.
- Abstraction shared baru dibuat ketika ada minimal dua consumer nyata dengan semantics yang sama.

### Tracker migrasi CSS Modules feature

Migrasi stylesheet feature yang sebelumnya global/transitional sudah selesai:

- [x] `frontend/src/features/dashboard/DashboardPage.module.css`
- [x] `frontend/src/features/auth/LoginPage.module.css` + `LoginMobile.module.css`
- [x] `frontend/src/features/transactions/TransactionsPage.module.css` — desktop filter/table + detail modal; mobile history tetap memiliki `MobileTransactionHistory.module.css`.
- [x] `frontend/src/features/dashboard/components/FinancialAlertList.module.css`

File global feature lama telah dihapus setelah usage search dan regression contract memastikan consumer berpindah ke owner baru. Untuk feature baru, styling langsung colocated pada CSS Module; jangan membuat kembali stylesheet feature global.

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

## Motion system canonical

- Motion memakai primitive + semantic token di `frontend/src/styles/tokens.css`: `--motion-instant`, `--motion-fast`, `--motion-standard`, `--motion-emphasized`, `--motion-control`, `--motion-feedback`, `--motion-dialog`, `--motion-sheet`, `--motion-celebration`, `--motion-decorative`, `--motion-spinner`, `--motion-loading`, serta `--motion-stagger-*`; easing canonical adalah `--ease-standard`, `--ease-enter`, dan `--ease-exit`. `--motion-normal`/`--motion-easing` dipertahankan sebagai alias compatibility selama migrasi.
- Functional motion (press/focus/loading), contextual motion (dialog/sheet/pergantian rekening), dan celebratory/decorative motion harus dibedakan. Motion tidak boleh menunda informasi finansial utama atau menjadi satu-satunya cara memahami state.
- Decorative animation wajib finite. Login money/spark dan ilustrasi fatal-error berhenti sendiri dalam waktu kurang dari lima detik; success celebration memakai one-shot sekitar satu detik dan tidak loop. Loading/progress boleh terus berjalan selama benar-benar merepresentasikan proses aktif.
- `prefers-reduced-motion` adalah kontrak aplikasi, bukan CSS-only. Komponen React memakai `useReducedMotion()`, helper non-React memakai `shared/motion.js`, dan JavaScript tidak boleh memanggil `scrollIntoView`/`scrollTo` dengan `behavior: "smooth"` secara langsung. Durasi JavaScript yang menggerakkan frame membaca token CSS melalui `semanticMotionDurationMs()` agar tidak membuat timing lokal yang drift.
- Reduced-motion meniadakan travel/rotate/scale non-esensial, bukan sekadar mempercepat animasi. Loading spinner menjadi statis tetapi copy/status proses tetap terlihat; decorative money/spark disembunyikan; bottom sheet/modal tetap dapat dioperasikan tanpa gerak.
- Gesture kontinu mengutamakan `transform` + `opacity`. `filter`/`box-shadow` pada stack rekening hanya diperbarui pada settled state. Progress bar yang berubah memakai `scaleX/scaleY` dengan transform origin yang benar, bukan transition `width`/`height`.

## Feedback dan status ringkas

- `CompactNotice` pada `frontend/src/components/common/CompactNotice.jsx` dipakai untuk informasi nonblocking yang tetap perlu terlihat: guidance dari pengingat/notifikasi, status perangkat, ringkasan read-only, dan hint singkat di dalam form.
- Copy ringkas tidak memakai accordion atau tombol `Detail` bila satu sampai dua kalimat sudah cukup. Membuka informasi tambahan tidak boleh menyebabkan layout shift hanya untuk menjelaskan status sederhana.
- Error, conflict, offline, destructive confirmation, warning finansial yang memblokir, preview dampak saldo, import/restore/reset, maintenance, dan gangguan integrasi tetap memakai notice persisten yang lebih kuat. Informasi yang memengaruhi keputusan pengguna tidak boleh disembunyikan di tooltip/popover.
- Modal Tutup periode Alokasi Dana wajib menjelaskan dampak pada sisa dana dan bahwa periode berikutnya tetap disiapkan. Opsi `Pakai lagi kebutuhan di periode berikutnya` default off, hanya menyalin kategori + nominal rencana, dan tidak boleh memberi kesan transaksi, saldo, atau dana dipindahkan otomatis.
- Status dinamis menggunakan `role="status"` bila perlu diumumkan secara sopan. Error yang membutuhkan perhatian segera menggunakan `role="alert"`. State tidak boleh dibedakan hanya dengan warna.
- Zona waktu reminder tetap **Asia/Jakarta**. Presentation ringkas tidak boleh mengganti contract waktu, scheduler, Web Push, authorization, atau business rule backend.

## Notification Center canonical

- Route `/notifikasi` adalah **in-app financial notification center**, berbeda dari `/pengaturan/notifikasi` yang mengatur Web Push/perangkat. Notification Center membaca `dashboard.overview.alerts` sebagai read model canonical; ia tidak membaca atau memutasikan `notification_queue` dan tidak membuat mutation authority baru.
- Dashboard mobile hanya menampilkan **satu next action prioritas** (`alerts[0]`, sudah diurutkan backend berdasarkan severity), sedangkan bell + unread badge membuka seluruh kondisi aktif. Dashboard desktop menampilkan jumlah notifikasi aktif dan link ke route yang sama, bukan modal alert kedua.
- List notifikasi memakai flat rows + separator. Jangan membungkus setiap row dalam card, menambahkan thumbnail sosial, atau membuat nested modal. Group/filter harus berasal dari semantics yang benar-benar tersedia; saat read model tidak menyediakan timestamp event, UI tidak boleh mengarang grouping “Hari ini/Minggu ini”.
- Status dibaca adalah presentation state lokal per user/session namespace dengan TTL terbatas; menandai item dibaca **tidak menyelesaikan kondisi finansial**. Item tetap aktif sampai domain/read model tidak lagi menghasilkan alert. Jangan mengklaim Notification Center sebagai histori delivery permanen sebelum ada API durable khusus.
- Tap notifikasi selalu memakai `financialAlertGuidance()` untuk route/state canonical. Notification Center tidak boleh menjalankan transaksi, adjustment, pembayaran, atau mutation finansial langsung.
- Reconciliation stale adalah info/pengingat, bukan error. Warning/danger visual hanya untuk kondisi yang memang memiliki severity tersebut, misalnya saldo berbeda, overdue, atau threshold terlampaui.

## Cocokkan saldo / rekonsiliasi

- Istilah user-facing canonical adalah **Cocokkan saldo**. “Rekonsiliasi” tetap boleh dipakai pada nama route/domain internal, tetapi jangan menjadi konsep utama yang harus dipahami user.
- Saldo sistem tidak boleh diprefill atau dipresentasikan sebagai “saldo aktual”. Saat user datang dari Dashboard/Notification Center, hanya rekening yang boleh dipilih otomatis; `actual_balance` tetap kosong sampai user menyatakan kondisi nyata.
- Flow utama setelah rekening dipilih: tampilkan **Saldo tercatat di aplikasi** lalu tanyakan “Apakah saldo di bank juga Rp …?”. `Ya, saldonya sama` menyimpan reconciliation dengan system balance secara eksplisit; `Tidak, berbeda` baru membuka input **Saldo sebenarnya di bank**, preview selisih, catatan opsional, dan guard “Saldo tidak diubah otomatis.”
- Mismatch tidak boleh membuat adjustment otomatis. Hasil difference tetap menawarkan review transaksi rekening; penyesuaian, bila diperlukan, harus melalui action domain terpisah dan eksplisit.
- Pengingat reconciliation bersifat account-level, bukan satu reminder per transaksi. Copy “belum pernah dicocokkan” adalah status netral/info sampai benar-benar ada selisih.

- Bantuan edukatif per halaman memakai `PageInfoButton` pada `frontend/src/components/common/PageInfoButton.jsx`, idealnya tepat setelah judul halaman. Satu halaman cukup memiliki satu trigger `Info`; jangan menambahkan ikon info pada setiap card, filter, atau tombol.
- Untuk route nested yang berbagi satu shell/header, hanya satu header yang boleh terlihat pada viewport aktif dan isi Info wajib mengikuti sub-route. `SettingsLayout` adalah pola canonical responsif: mobile memakai `PageHeader`/back-link, desktop memakai detail header di panel kanan; keduanya mengambil metadata yang sama dari `location.pathname`, sehingga Notifikasi, Perangkat & sesi, Integrasi, Export/Import, Backup/Pemulihan, Reset, Periode, dan Audit tidak memiliki copy help yang bercabang.
- `PageInfoButton` membuka `Modal` canonical, memiliki accessible name, focus management, target sentuh minimal 44×44px, dan swipe-to-close mobile. Isi bantuan maksimal beberapa kalimat yang menjelaskan fungsi halaman, bukan warning operasional.
- Jika `PageHeader` memiliki contextual help, deskripsi edukatif di bawah judul boleh disembunyikan pada mobile `<=820px` agar header lebih compact. Deskripsi yang memengaruhi keputusan finansial tetap harus terlihat sebagai notice/panel, bukan dipindahkan ke modal info.
- Empty state seluruh halaman memakai variant `panel`; empty state subsection memakai `inline`. Hindari membungkus `EmptyState` di `Card` kedua hanya untuk menghasilkan boundary visual yang sama.
- Empty state initial/blocked wajib memberi next action yang benar-benar dapat dilakukan actor (mis. menuju Rekening ketika prerequisite belum tersedia); filtered empty memberi reset filter. Static empty state tidak perlu live-region secara default; gunakan announcement hanya ketika perubahan asynchronous memang perlu diberitahukan assistive technology.


### Transaction History mobile

- Pada viewport `<=820px`, halaman Transaksi memakai hierarchy **history-first**. Page header hanya membawa judul route; body tidak mengulang heading/description "Riwayat transaksi".
- Periode dan grafik tren ringkas ditempatkan sebagai satu konteks visual tanpa card bertumpuk. Grafik membaca `reports.monthly` (6 bulan) dan tidak menghitung ulang ledger dari subset list transaksi.
- Filter cepat hanya menampilkan `Semua`, `Pengeluaran`, `Pemasukan`, `Transfer`, Search, dan Filter. Dialog filter lanjutan memakai segmented type selector yang tetap memuat Pengembalian serta Penyesuaian, lalu baris pengaturan compact dengan native `select` untuk Alokasi Dana, rekening, kategori, dan pencatat. Nilai terpilih terlihat di sisi kanan tanpa menumpuk card/dropdown besar, dan seluruh capability filter tetap memakai query canonical yang sama.
- Judul row memakai urutan fallback `description → kategori → merchant → jenis transaksi`; copy `Tanpa keterangan` tidak dipakai. Metadata sekunder menghindari duplikasi judul dan dapat memuat merchant, rekening, kategori, serta nama pencatat lengkap dengan wrap natural. Badge row tetap hanya untuk exception/asal penting: `Jadwal rutin`, `Target`, `Belum dialokasikan`, atau `Dibatalkan`.
- Detail mobile menampilkan jenis, kategori, rekening, alokasi, pencatat, tanggal Asia/Jakarta, dan sumber transaksi. Lifecycle edit/cancel/restore tetap memakai capability backend canonical.


### Composer transaksi mobile

- `Tambah transaksi` memakai satu bottom sheet compact. Header hanya memuat asset transaksi, judul, drag handle, dan tombol tutup; hindari hero card dekoratif di dalam modal.
- Jenis transaksi memakai ikon `FinanceChoiceIcons` canonical dan tetap satu baris empat opsi pada mobile normal. Gunakan satu lapis container visual: ikon tidak boleh dibungkus card/border kedua di dalam pilihan aktif. Pada viewport sangat sempit, grid boleh turun menjadi 2×2 agar label tetap terbaca.
- Nominal tetap kosong saat composer baru dibuka untuk mencegah salah input. Prefix `Rp`, nominal, dan ikon pendamping harus terlihat sebagai satu field utuh tanpa badge berlapis. Quick amount yang tersedia adalah 20 rb, 50 rb, 100 rb, 200 rb, dan 500 rb; memilih chip hanya mengisi input, bukan menyimpan transaksi.
- Tanggal, rekening, kategori, dan Alokasi Dana mobile dipresentasikan sebagai satu **grouped metadata surface** dengan separator halus, bukan kumpulan card/input ber-outline yang berdiri sendiri. Icon default bersifat muted dan accent primary dipakai untuk focus/selection, bukan pada setiap row.
- Field berbasis data (`Rekening`, `Kategori`, `Alokasi Dana`) memakai **selection view di bottom sheet yang sama**. Memilih row mengganti isi sheet sementara, tombol kembali/Escape/swipe kembali ke composer, dan memilih item langsung mengembalikan user ke composer tanpa tombol Apply/Confirm. Nested modal/bottom-sheet dan native `<select>` browser untuk ketiga field ini tidak dipakai pada composer mobile.
- Rekening sumber tidak memakai `Cari rekening` atau `Lihat semua`. Selection view memakai `sourceAccountPicker` canonical: Pengeluaran menyembunyikan rekening saldo Rp0, Transfer menyembunyikan sumber dengan dana tersedia Rp0, rekening `allow_negative` tetap valid, dan rekening yang sudah terpilih tetap dipertahankan agar edit transaksi lama tidak kehilangan referensi. Metadata list hanya membawa informasi keputusan yang relevan (`Saldo`/`Dana tersedia`); rekening tujuan tetap memakai daftar compatible canonical tanpa filter saldo sumber.
- Kategori memakai histori `frequentCategories` existing sebagai `Sering dipakai`; search hanya tersedia di selection view karena taxonomy dapat panjang dan tidak mengubah query/domain contract. Alokasi Dana memakai daftar ordered canonical sesuai rekening + kategori dan tetap menyediakan `Belum dialokasikan`.
- Metode pembayaran tetap langsung di composer sebagai choice chips compact karena opsinya sedikit: `Transfer`, `Tunai`, `Kartu debit`, dan `E-wallet`. State boleh tetap kosong tanpa chip `Belum dipilih`; mengetuk pilihan aktif sekali lagi mengosongkan nilai karena field ini opsional. `Auto-debit` tidak dapat dipilih untuk transaksi manual baru; nilai legacy hanya ditampilkan sebagai state lama saat mengedit agar tidak berubah diam-diam.
- `Catatan` adalah textarea teks utama dan auto-grow pada mobile tanpa resize handle. Guard overspend tetap memakai field yang sama; jangan membuat textarea/alasan kedua untuk keputusan yang identik.
- Preview finansial memakai judul **`Setelah transaksi`** dan hanya menampilkan hasil akhir + delta yang membantu keputusan. Jangan mengulang baris yang sama sebagai summary lalu `Lihat dampak lengkap`; detail tambahan hanya boleh muncul bila membawa informasi unik. Transfer mobile tetap memakai presentasi `MobileTransferFields` canonical, tetapi rekening sumber/tujuan memakai same-sheet selection view dan preview `Setelah transfer` yang ringkas.
- Footer `Batal` dan `Simpan transaksi` tetap sticky. Saat selection view aktif footer disembunyikan karena tidak ada mutation pada tahap memilih data. Saat submit berjalan, modal menjadi non-dismissible sehingga Escape, backdrop, tombol tutup, dan swipe tidak dapat membatalkan request yang outcome-nya belum diketahui.

## Modal dan overflow mobile

- `.modal__body` adalah satu-satunya scroll container internal dialog dan hanya boleh menggulir vertikal. Horizontal overflow harus ditutup pada container, bukan pada konten dengan clipping acak.
- `form-grid`, child grid, `fieldset`, `.field`, money input, dan native file input wajib memiliki `min-width: 0` serta `max-width: 100%`.
- Indikator scrollbar dapat disembunyikan pada mobile, tetapi `overflow-y: hidden`, pembatasan zoom viewport, dan konten footer yang tidak dapat dijangkau dilarang.
- Carousel horizontal hanya boleh dipakai untuk kontrol yang memang memilih urutan item, saat ini rekening. Filter, tab kategori, dan kelompok ikon harus wrap atau grid.
- Boundary mobile canonical adalah `<=820px`; dialog dismissible memakai bottom-sheet dengan animasi masuk dari bawah dan swipe-to-dismiss sebagai default canonical. `>=821px` kembali ke perilaku dialog desktop. Full-screen flow khusus boleh opt-out dari swipe bila gesture akan bertabrakan dengan navigasi utama.
- Modal yang sedang menjalankan mutation kritis wajib memakai state `dismissible=false`: tombol tutup tidak terlihat aktif, Escape/backdrop/swipe tidak menutup modal, dan focus trap tetap berjalan sampai server memberi hasil.

## Information architecture Pengaturan

- `/pengaturan` memakai information architecture berbeda sesuai ruang layar tanpa mengubah route. **Mobile ≤820px** tetap berupa landing grouped-list ringkas: Umum (Notifikasi, Perangkat & sesi, Integrasi Google), Data (Data & cadangan, Pemeliharaan data), dan Sistem (Periode & integritas, Audit). **Desktop ≥821px** memakai workspace tiga panel **Kategori → Menu → Detail** di dalam shell aplikasi; jangan membentangkan grouped-list mobile menjadi kolom lebar.
- Kategori desktop canonical adalah **Umum**, **Data**, **Sistem**, **Integrasi**, dan **Sesi & keamanan**. Kategori hanya navigasi presentasional: setiap item tetap menuju route existing. Data & Sistem disembunyikan untuk non-Administrator bila seluruh item di dalamnya owner-only.
- Metadata navigasi desktop/mobile dipusatkan di `settingsNavigation.js` agar label, icon, role visibility, dan route matching tidak diduplikasi. Export/Import/Backup/Pemulihan harus tetap menandai **Data & cadangan** sebagai submenu aktif meskipun URL child berbeda.
- `/pengaturan/data` adalah hub navigasi untuk Export, Import transaksi, Backup, dan Pemulihan. Keempat workflow tetap memiliki nested route, resource, mutation, validasi, dan authorization masing-masing; pengelompokan hanya mengurangi kepadatan navigation.
- `/pengaturan/pemeliharaan` memiliki dua tab terisolasi: **Reset Testing** dan **Reset Semua**. Route legacy `/pengaturan/reset-data` dan `/pengaturan/reset-semua` hanya redirect kompatibilitas ke tab yang sesuai dan tidak boleh kembali menjadi menu utama tersendiri.
- Header detail responsif: desktop menampilkan judul/deskripsi/Info di panel kanan tanpa back-link yang tidak perlu, sedangkan mobile memakai back-link kontekstual + judul + Info. Child page tidak membuat `PageHeader` kedua; heading child yang dipakai untuk `aria-labelledby` boleh tetap visually-hidden. AppShell harus tetap menjadi satu-satunya `<main>` landmark. Export/Import/Backup/Pemulihan kembali ke **Data & cadangan**, sedangkan detail lain kembali ke **Pengaturan**.
- Pengelolaan anggota berada pada route top-level `/anggota`; route lama `/pengaturan/anggota` hanya redirect kompatibilitas.
- `/pengaturan` hanya memuat `system.health`. Setiap detail route hanya memuat resource yang dibutuhkan dan menampilkan loading/error/result dekat tindakan. Error Audit tidak boleh mengganggu Notifikasi, dan sebaliknya.
- Administrator-only item disembunyikan dari navigasi Member, tetapi direct route tetap harus menampilkan guard dan backend selalu menjadi authorization utama.
- Preference boolean di Pengaturan memakai native checkbox dengan `role="switch"` dan visual track/thumb sendiri: OFF netral, ON `--primary`, focus-visible jelas, disabled tidak ambigu, dan reduced-motion mematikan transisi. Checklist acknowledgement seperti “saya memahami risiko” tetap checkbox karena semantiknya persetujuan, bukan preference ON/OFF.
- Tile layanan adalah `button` bila melakukan aksi. Navigasi memakai `Link`/`NavLink`; status siap tanpa aksi tidak boleh diberi click handler pada elemen non-interaktif.

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
- Focus-visible tidak boleh dihilangkan. Focus indicator canonical memakai `--focus-ring` yang **opaque** dan harus memiliki kontras non-text minimal 3:1 terhadap `--page`, `--surface`, dan `--surface-elevated` pada light/dark theme. Selector feature tidak boleh membuat focus indicator sendiri dengan `rgba(..., alpha)` atau `color-mix(..., transparent)`; variasi visual hanya boleh memakai token semantic yang tetap memenuhi threshold.
- Contrast text dan control state harus lulus WCAG AA.
- State tidak hanya dibedakan dengan warna.
- Reduced motion dihormati.
- Loading memakai `aria-busy` atau status region yang sesuai.
- Error form terhubung melalui `aria-describedby` dan `aria-invalid`.
- Keyboard dan screen reader harus dapat menyelesaikan alur transaksi utama.

## Pola kartu rekening

- Daftar rekening memakai komponen domain `AccountFinancialCard`, bukan card generik yang ditata ulang di page.
- BCA, BNI, BTN, Mandiri, dan Permata memakai asset WebP 1024×645 sebagai base visual responsif. Ukuran ini menjaga headroom sekitar 2× untuk render kartu terbesar tanpa membawa raster 1536×968 pada setiap rekening. Asset bank mempertahankan alpha/transparansi di luar siluet kartu, memuat wordmark/logo dan chip EMV satu kali, serta menyisakan safe area untuk overlay data rekening. Tunai, Tabungan, dan E-wallet memakai kanvas 1024×645 yang sama agar perceived size dan rasio konsisten. Wordmark/logo dekoratif dan chip bank berasal dari asset; HTML tidak boleh menggambarnya kembali.
- Semua kartu memakai rasio 1.586:1, container, radius, dan object sizing yang sama. Tidak boleh ada bank yang tampak lebih panjang, pendek, atau terbungkus panel dekoratif tambahan.
- Surface rekening yang menampilkan alokasi wajib membedakan **Saldo rekening**, **Dialokasikan**, dan **Dana tersedia**. `Dialokasikan` adalah bagian dari saldo, bukan nominal tambahan. Jangan menjumlahkan saldo rekening + Alokasi Dana sebagai total kekayaan.
- Nominal finansial utama (saldo, dana tersedia, transaksi, limit, budget, nilai investasi, dan selisih rekonsiliasi) tidak boleh memakai `text-overflow: ellipsis` sebagai fallback responsive. Nilai boleh wrap/reflow dengan `overflow-wrap:anywhere`, menyesuaikan ukuran melalui `clamp()` dalam batas readability, atau memakai progressive disclosure yang tetap menyediakan nilai penuh. Ellipsis hanya untuk metadata sekunder yang nilai lengkapnya tersedia di tempat lain.
- Definisi yang tampil ke user harus mengikuti glossary product: **Dana tersedia** = bagian saldo yang belum terikat ke Alokasi Dana; **Dialokasikan** = bagian saldo yang masih terikat ke Alokasi Dana. Copy canonical frontend berada di `shared/presentation/account.js` (`ACCOUNT_BALANCE_GUIDANCE` dan hint terkait) agar Page Info, detail Rekening, serta ringkasan Dashboard tidak drift.
- Pada surface yang menampilkan Saldo dan Dana tersedia berdampingan, hubungan keduanya harus tersedia dekat angka melalui helper text atau contextual help yang jelas. Hindari tooltip hover-only karena mobile/touch dan keyboard harus memperoleh penjelasan yang sama.
- Selector rekening untuk pengeluaran, Transfer, Alokasi, Jadwal rutin, dan Target menampilkan `available_balance` sebagai konteks dana bebas bila relevan. Preview tetap boleh menampilkan `balance` fisik agar pengguna memahami asal perhitungannya.
- Alokasi Dana wajib menampilkan atau dapat ditelusuri ke satu rekening sumber. UI tidak menawarkan sumber “gabungan rekening” untuk pembuatan Alokasi Dana baru, dan pilihan Alokasi Dana pada transaksi difilter ke rekening sumber yang sama sebelum backend melakukan guard ulang.
- Card face menambahkan contactless, nomor rekening yang sudah dinormalisasi, dan nama rekening. Pada stack mobile terautentikasi, saldo saat ini dan label kepemilikan boleh tampil sebagai overlay ringkas; status, timestamp, nomor lengkap, dan aksi tetap berada pada panel detail.
- Nomor rekening berasal dari `accounts.account_number`, dikelompokkan empat digit, dan hanya ditampilkan setelah authentication serta binding user backend. Kedua pengguna terotorisasi dapat membacanya; tombol salin berada di panel detail dan memiliki accessible name.
- Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap dilarang pada asset, DOM, payload, audit, dan integrasi.
- Desktop lebar memakai satu rekening terpilih dengan satu kartu ATM yang terlihat pada satu waktu. Pergantian rekening dilakukan hanya melalui carousel kartu (panah, keyboard, swipe/drag, atau indikator posisi); kartu tetangga tidak boleh mengintip dari sisi viewport. Detail rekening dan transaksi terbaru mengikuti rekening terpilih, sedangkan Komposisi saldo bersifat read-only dan tidak menjadi selector kedua.
- Mobile memakai circular 3D card stack dengan node kartu yang stabil. Satu rekening menampilkan satu kartu, dua rekening menampilkan dua kartu, dan tiga atau lebih menampilkan maksimal tiga kartu terlihat dengan ukuran serta rasio yang identik. Swipe vertikal pada kartu aktif dan tombol Arrow Up/Down memutar urutan secara sirkular; wheel, auto-rotate, pagination dots, dan panah samping tidak digunakan. Tombol `Pilih rekening` membuka bottom sheet daftar rekening aktif sebagai alternatif single-pointer tanpa dragging.
- Area kosong stack wajib memakai `touch-action: pan-y pinch-zoom`. Kartu aktif memakai `touch-action: pan-x pinch-zoom` agar gesture vertikal mengubah rekening tanpa mematikan pinch zoom. Gesture horizontal harus ditolak dan tidak boleh membuka detail atau mengubah rekening.
- Selama gesture normal, seluruh tumpukan mengikuti jari hanya melalui `transform`/`opacity`; filter/shadow tidak diinterpolasi per frame dan baru diselaraskan saat stack settled. Swipe pendek kembali ke posisi semula. Pada reduced-motion tidak ada 3D travel/rotation: swipe hanya mendeteksi intent lalu selection berpindah instan, sementara `Pilih rekening` tetap menjadi jalur pointer utama tanpa drag. Rekening aktif diumumkan tanpa membacakan saldo.
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

- Mobile adalah layout aplikasi, bukan desktop yang diperkecil. Rhythm default memakai outer gutter 16px, section gap 16/24px, internal gap 8/12px, dan card padding umumnya 16px. Pada viewport sangat sempit `<=340px`, outer gutter boleh turun ke 12px dan card padding 14px untuk mencegah overflow; pengecualian optical harus tetap lokal, bukan membuat skala spacing kedua.
- Navigasi bawah fixed harus menyisakan safe area dan ruang scroll. Generic topbar memasukkan `env(safe-area-inset-top)`; route yang sengaja menyembunyikan topbar seperti Dashboard/Rekening wajib memiliki safe-area top sendiri. Cutout/notch tidak boleh membuat heading, loading, feedback, atau tombol menempel ke system UI.
- Indikator scrollbar hanya boleh disembunyikan pada scroller lokal yang memang memiliki affordance/alternative navigation yang jelas; scrollbar root page tidak disembunyikan. Scroll vertikal tidak boleh dikunci, body tidak boleh membentuk nested scroll yang membingungkan, dan konten terakhir harus tetap dapat dijangkau.
- Full-height app memakai fallback `100vh` lalu `100dvh` pada root dan shell. Jangan memakai `100vh` sebagai satu-satunya sumber tinggi mobile.
- Route full-bleed atau route dengan surface khusus wajib memasang background pada shell/main/content, bukan hanya page component, agar reserved navigation gap dan safe area tetap menyatu secara visual.
- Loading/fatal error di luar shell memenuhi viewport. Loading/fatal error/404 di dalam shell memenuhi sisa area content, bukan menambah viewport penuh di dalam shell. True-empty full-page boleh di-optical-center pada sisa viewport; empty karena filter/search tetap dekat dengan kontrol penyebab, dan empty subsection tetap inline.
- Dialog menjadi bottom sheet pada viewport kecil tanpa menduplikasi business form. Animasi masuk memakai gerak bawah-ke-atas yang singkat dan halus; `prefers-reduced-motion` wajib menonaktifkan gerak non-esensial.
- Native `input`, `select`, dan `textarea` pada `<=820px` memakai `--mobile-native-control-font-size: 16px`; body tetap boleh 14px. Pengecekan auto-zoom harus memverifikasi **effective mobile rule**, bukan hanya keberadaan token desktop 16px. Viewport zoom tidak boleh dinonaktifkan.
- Interactive target mobile efektif minimal 44×44px. Ikon visual boleh 18–24px dan switch thumb boleh lebih kecil selama host/label interaktif tetap memenuhi target tersebut. CTA transaksi utama boleh memakai 48px+ untuk hierarchy, tetapi utility control tidak boleh dikecilkan di bawah 44px hanya untuk density.
- Financial/status/meta text yang memengaruhi pemahaman user memakai floor sekitar 12px. Angka 10px atau lebih kecil hanya boleh menjadi facsimile/dekorasi yang memiliki representasi semantik terbaca di dekatnya.
- Gesture adalah enhancement, bukan satu-satunya jalur operasi. Swipe rekening wajib memiliki `Pilih rekening` single-pointer + Arrow Up/Down; onboarding memiliki pagination/keyboard; bottom-sheet memiliki tombol close/Escape sesuai dismissibility. Mutation finansial/destructive tidak boleh hanya tersedia melalui gesture tersembunyi.
- Setiap `var(--token)` statis harus memiliki definisi canonical. Custom property runtime hanya diizinkan untuk nilai yang benar-benar disuntikkan komponen dan wajib tercakup regression test. Jangan membuat alias semantik baru jika token existing seperti `--border`, `--surface-soft`, `--text`, atau `--negative` sudah sesuai.
- Gradient yang memuat teks atau ikon informatif harus lolos kontras pada setiap endpoint warna di light dan dark theme. Text shadow tidak dihitung sebagai pengganti rasio WCAG.
- Keyboard virtual tidak boleh menutup nominal atau action utama.
- PWA tetap `display: standalone`; Fullscreen API tidak dipaksakan.
- Offline write finansial tetap dilarang.

## Kontrak responsive global

- `frontend/src/styles/responsive.css` menjaga breakpoint shell/global dalam urutan viewport besar ke kecil. Boundary aplikasi mobile canonical tetap `<=820px` / desktop `>=821px`, dan JavaScript wajib memakai `APP_MEDIA`/`APP_BREAKPOINTS` dari `frontend/src/config/layout.js` alih-alih menyalin media-query string. Breakpoint feature-local tambahan hanya boleh ada bila presentation contract memang membutuhkan dan tidak boleh mengubah authority/business rule.
- Klasifikasi breakpoint: `390px` adalah compact-mobile presentation, `820/821px` adalah structural mobile/desktop boundary, dan `940/941px` adalah shell density boundary yang tetap milik CSS shell. Nilai lain seperti 340/580/620/680/900/1100 boleh dipakai sebagai **component-local/content-driven breakpoint**, tetapi tidak boleh diam-diam menjadi keputusan app-wide atau diduplikasi di JavaScript.
- Root page tidak boleh memakai `overflow-x:hidden`/`clip` untuk menyamarkan bug reflow. Horizontal scrolling hanya boleh dimiliki container yang memang dua-dimensi (misalnya table/data strip tertentu); root document harus dapat membuktikan `scrollWidth <= clientWidth + 1` pada matrix browser canonical.
- Selector yang berakhir koma tidak boleh dipisahkan baris kosong. Static test wajib menolak dangling selector.
- Layout multi-kolom pada mobile harus berubah menjadi satu kolom, bukan disembunyikan. Capability anchor route penting wajib memiliki `width > 0` dan `height > 0` pada browser test mobile.
- `!important` hanya dipertahankan untuk compatibility yang didokumentasikan. Pengecualian canonical saat ini hanya reduced-motion global dan override parallax Login pada `prefers-reduced-motion`, karena nilai parallax Login disuntikkan sebagai inline custom property saat gesture berjalan.

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

1. Saat consumer runtime pertama benar-benar membutuhkan Mantine, tambahkan versi dependency dan `package-lock.json` pada perubahan yang sama; upgrade berikutnya juga wajib atomik.
2. Tambahkan provider/theme bridge tanpa menghapus token project.
3. Migrasikan wrapper satu per satu, dimulai dari Dialog/Drawer dan form control kompleks.
4. Jangan memakai `sx`, styling prop, atau direct import di feature untuk layout normal.
5. Setiap migrasi wajib lulus lint, unit/static contract test, build, keyboard test, mobile test, dan dark/light review.
6. CSS lama dihapus hanya ketika tidak ada usage dan visual regression telah diperiksa.

## Navigasi shell

- Information architecture canonical: menu `Perencanaan` membuka workspace dengan dua tab, `Alokasi Dana` dan `Jadwal Rutin`. `Kebutuhan` dikelola di detail Alokasi Dana dan tetap memakai kategori + budget existing. `Anggaran` adalah menu overview read-only lintas seluruh Kebutuhan, bukan tempat membuat objek kedua. Target tetap feature Perencanaan tersendiri; Data keuangan memuat Rekening serta Kategori; Cocokkan Saldo (rekonsiliasi) berada pada Kontrol saldo; Pengaturan berada pada Aplikasi.
- CTA berlabel pengelolaan Kebutuhan (`Atur/Kelola kebutuhan`) harus menuju Alokasi Dana, bukan `/anggaran` yang read-only. Widget recurring yang dapat berisi pemasukan dan pengeluaran memakai istilah netral `Jadwal`, bukan `Tagihan`.
- Detail Alokasi Dana menampilkan `Total kebutuhan`, `Dana alokasi`, dan selisihnya untuk periode aktif. Perbandingan memakai nominal alokasi periode, bukan sisa setelah transaksi. Kekurangan dana hanya boleh menghasilkan CTA/prefill penyesuaian yang eksplisit; menyimpan Kebutuhan tidak boleh melakukan funding otomatis atau mutation finansial tersembunyi.
- Route canonical workspace tetap `/perencanaan/kantong` dan `/perencanaan/jadwal` untuk compatibility kontrak internal. `/anggaran` adalah route canonical overview read-only. Route lama `/alokasi` dan `/tagihan` tetap compatibility redirect dan harus mempertahankan navigation state yang relevan. `/laporan` tetap analitis dan tidak memuat mutation Kebutuhan.
- Mobile `/laporan` pada breakpoint ≤820px memakai presentation khusus yang clean dan analitis di atas contract canonical `reports.monthly`: header ringkas, segmented `Ringkasan`/`Per kategori`, navigasi bulan, pilihan **1 bulan harian** atau 3/6/12 bulan bulanan, chart pengeluaran, tiga KPI utama, perbandingan bulan sebelumnya hanya pada granularitas bulanan, kategori terbesar, peringatan actionable, anggaran vs aktual, serta rincian rekening/pencatat melalui progressive disclosure. Semua angka berasal dari response report atau turunan deterministik dari `trend.items`; UI tidak membuat agregasi ledger dari page slice dan tidak menambah mutation. Breakdown `nature` legacy tidak ditampilkan sebagai UX aktif. Ikon kategori memakai katalog canonical project dari bootstrap kategori. Desktop mempertahankan report workspace existing.
- Sidebar desktop mempertahankan mask melengkung brand Saldo Bersama. Ukurannya boleh diperbesar untuk tap target dan proporsi layar, tetapi bentuk/aset canonical tidak boleh diganti tanpa approval visual baru.
- Kontrol utama desktop minimum 44×44px. Rail desktop memakai **enam slot canonical** agar seluruh ikon berada di badan mask organik: `Beranda`, `Transaksi`, `Perencanaan`, `Laporan`, `Keuangan`, dan `Kelola` (Administrator-only). `Perencanaan` membuka Alokasi Dana/Anggaran/Target; `Keuangan` membuka Rekening/Kategori/Investasi/Cocokkan saldo; `Kelola` membuka Anggota/Persetujuan. Route dan capability tetap sama—pengelompokan hanya mengurangi kepadatan navigasi primer. Submenu grup memakai anchored flyout di samping trigger, label satu baris, trigger-toggle, Escape, click-outside, route-close, dan focus restoration; tombol X tidak diperlukan untuk flyout navigasi.
- Theme toggle hanya tampil pada kontrol shell yang canonical. Menu mobile “Menu lainnya” tidak menduplikasi dark/light toggle; logout berada pada footer terpisah dan bottom navigation tetap tersedia. Quick add transaksi global disembunyikan pada seluruh subtree `/pengaturan` agar halaman konfigurasi, maintenance, reset, backup, dan recovery tidak memiliki aksi finansial yang tidak relevan.
- Bottom navigation mobile ≤820px memakai lima slot sama lebar pada lebar layar, tinggi konten 72px di luar safe-area, ikon 24px, label 12px, dan quick-add bundar 52px yang terangkat 26px sehingga pusat tombol sejajar dengan garis atas navigation bar. Empat tab non-FAB memakai seluruh tinggi 72px sebagai hit area, active state memiliki indikator bentuk tipis selain perubahan warna, focus-visible tetap jelas, dan ruang konten/safe-area dihitung dari token `--mobile-navigation-height`.
- Primary tab mobile `/`, `/transaksi`, dan `/laporan` mempertahankan posisi scroll masing-masing ketika user berpindah tab. Secondary route baru dimulai dari atas. Browser Back/Forward (`POP`) memulihkan posisi entry history sebelumnya bila pernah direkam; navigasi baru ke secondary route tetap mulai dari atas. Policy ini hanya state presentasi dan tidak boleh menyimpan data finansial atau mutation intent.
- True-empty pada halaman yang memang tidak memiliki konten utama boleh ditempatkan di optical center area viewport yang tersisa (sedikit di atas titik tengah matematis agar tidak terasa menempel ke bottom navigation). Empty karena search/filter harus tetap dekat dengan kontrol penyebabnya dan menyediakan reset/show-all yang relevan; empty subsection tetap inline dan tidak dipaksa center-screen.

## Investasi manual

- Route `/investasi` adalah **pencatatan manual aset investasi**, bukan broker/trading client: user mencatat transaksi yang sudah terjadi di aplikasi investasi lain, harga terakhir dimasukkan manual, dan tidak ada login/kredensial broker, API broker, order execution, auto-sync, harga live, market discovery, atau performance time-series yang tidak tersedia dari backend. Visual modern tetap dibangun di atas contract `investments.overview`: hero total aset tercatat, Cash RDN, saham yang dimiliki, lot/lembar, weighted cost basis, harga terakhir beserta sumber manual/trade fallback, nilai tercatat, realized/unrealized P/L, quick action, detail aktivitas per saham, dan pencocokan catatan.
- Persentase P/L boleh diturunkan secara deterministik dari `unrealized_pl / cost_basis` hanya ketika cost basis positif. Komposisi visual memakai nilai current-state `market_value` terhadap `portfolio_value`; keduanya presentation-only dan tidak menjadi ledger/cashflow baru.
- Aksi user-facing memakai bahasa **Catat beli / Catat jual / Perbarui harga / Cocokkan** untuk menegaskan bahwa Saldo Bersama tidak mengeksekusi order broker. Aksi hanya tersedia untuk `portfolio.can_operate`; Koreksi catatan tetap Administrator-only. Jika instrumen aktif belum ada, CTA Tambah instrumen hanya boleh muncul untuk Administrator agar Member tidak masuk dead-end; holding inactive tetap boleh dijual/diberi harga sesuai capability backend. Capability frontend bukan security boundary dan dialog tetap mengirim mutation melalui API canonical dengan `row_version`/idempotency guard backend.
- Aktivitas terbaru hanya menampilkan event yang benar-benar dikembalikan read model saat ini, yaitu trade Beli/Jual dan Koreksi. Update harga serta rekonsiliasi tidak boleh dipalsukan sebagai activity item sampai contract backend memang mengekspos event tersebut.
- Mobile `<=820px` mempertahankan quick action minimum 44px, form native 16px, metadata finansial minimal 12px, single-column disclosure untuk nominal besar, dark/light token semantic, focus-visible, dan reduced-motion.
- Form Investasi memakai validation presentation sebelum submit untuk mempercepat koreksi input, tetapi backend tetap authoritative. Error field harus terhubung lewat `aria-invalid`/`aria-describedby`, submit invalid memfokuskan field pertama, dan prerequisite yang tidak tersedia harus memberi guidance/next-step alih-alih membuka form dead-end. Jika write menghasilkan `OUTCOME_UNKNOWN`, field dikunci dan user hanya boleh retry payload yang sama sampai hasil definitif; modal tidak boleh didismiss atau mengubah intent selama state tersebut.

## Login dan pengguna

- Login desktop memakai artwork approved sebagai visual layer utuh agar komposisi light/dark konsisten dengan desain referensi. Artwork mempertahankan rasio 1672×941 dan ditampilkan tanpa menggambar ulang ilustrasi dengan CSS. Area autentikasi desktop memakai tombol Google branded yang sama dengan mobile, dengan logo Saldo Bersama, copy ringkas, security hints, dan error/retry hanya saat diperlukan.
- Login mobile ≤820px memakai empat halaman: tiga onboarding (“Rajin menabung, bijak belanja”, “Atur anggaran, hindari boros”, “Keuangan bersama, tetap jelas”) lalu halaman login khusus. Onboarding memakai UI React semantik dengan hero card clean, aset transparan terpisah, white space yang cukup, serta maksimal tiga ilustrasi per scene; tidak memakai poster full-page 941×1672 dan tidak menampilkan pill fitur tambahan di bawah deskripsi. Pada viewport mobile normal 320–430px termasuk tinggi pendek yang didukung, setiap halaman harus muat dalam satu layar tanpa scroll vertikal internal. Swipe horizontal mengikuti pointer secara real time; `Lewati`, pagination, dan ArrowLeft/ArrowRight tetap tersedia. Progress bar, counter langkah, tombol kembali visual, dan tombol besar `Lanjut` tidak dipakai karena swipe/pagination sudah menjadi kontrol utama. Setelah user pernah mencapai halaman login, perangkat boleh menyimpan satu flag presentasional non-sensitif bahwa onboarding sudah dilihat; kunjungan berikutnya langsung membuka halaman login dan menyediakan kontrol `Ulang` untuk melihat pengenalan lagi. Flag ini tidak boleh memuat token/email/UID/role/session/data finansial dan tidak pernah menjadi authorization signal. `prefers-reduced-motion` mematikan transisi yang tidak esensial.
- Artwork tidak boleh menggantikan kontrol autentikasi. Desktop dan mobile tidak memakai `google.accounts.id.renderButton()` pada halaman login; keduanya mempertahankan tombol HTML branded Google milik Saldo Bersama. Production canonical memakai full-page Google OAuth server flow dari tombol yang sama, sedangkan localhost/device emulation memakai Firebase popup fallback. Perbedaan transport auth tidak boleh mengubah layout, artwork, spacing, typography, swipe, dots, atau branded login button.
- Halaman login keempat memakai logo project `/brand/saldo-bersama-mark.png`, creator link aman, dan efek uang jatuh hanya ketika halaman login aktif. Progress bar onboarding dan tombol back tidak ditampilkan agar fokus pada autentikasi. Tombol `Masuk dengan Google` harus muat penuh dalam satu layar, memakai logo Google resmi tanpa modifikasi, disabled selama request, dan tidak mengubah bentuk setelah render. Pada host production canonical, transport server OAuth yang ringan harus siap tanpa mengimpor Firebase browser Auth; production menavigasi full-page ke server OAuth start dan callback server menyelesaikan Google → Firebase → server session tanpa browser redirect state. Module Firebase popup boleh di-load/preload hanya pada localhost/device emulation yang memang memakai fallback tersebut. Backend registry `users`, role/status, binding UID, dan verifikasi token tetap source of truth. Slide carousel yang tidak aktif tidak boleh mengekspos tombol/login control yang masih focusable atau artwork yang perlu diunduh sebelum slide aktif. Error OAuth/popup/network/provider ditampilkan dengan copy ramah tanpa raw provider error. Label “Selamat datang” tampil sederhana tanpa garis eyebrow dekoratif. Link creator eksternal harus memakai `noopener noreferrer`, focus-visible, dan target sentuh minimum 44px. Theme toggle mobile adalah kontrol DOM asli pada header.
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
- Workflow yang sudah memiliki feedback lokal kaya tidak boleh menduplikasi GlobalProcessIndicator + toast. `transactions.create`, `reconciliations.create`, mutasi Investasi, review request kolaborasi, dan reminder yang memiliki feedback lokal menyupresi process/success global biasa; status `OUTCOME_UNKNOWN` tidak pernah disupresi atau diberi auto-dismiss timer dan tetap memakai guard persisten. Pada review approval, outcome belum pasti mengunci request + keputusan + alasan dan UI hanya menawarkan retry intent identik sampai definitif. Action mutation baru wajib memiliki label module/action spesifik agar tidak jatuh ke nama generik aplikasi.
- Success result finansial canonical memakai `FinancialSuccessOverlay`: logo aplikasi, badge ceklis animasi, nominal utama, ringkasan kontekstual, tombol `Selesai`, serta aksi sekunder bila memang relevan. Pengeluaran, pemasukan, transfer, refund, dan rekonsiliasi matched memakai primitive yang sama; tidak ada tombol X pada success result.
- Success result finansial mobile memakai full-screen celebration dengan MoneyRain staggered **finite** di belakang konten. Title, nominal, deskripsi, ringkasan, dan CTA harus tersedia sejak frame awal; celebration tidak boleh menjadi gate informasi. Implementasi canonical memakai 8–12 note (saat ini 10), one-shot sekitar `--motion-celebration`, lalu berhenti; `prefers-reduced-motion` menghilangkan MoneyRain dan travel/scale non-esensial. Hasil rekonsiliasi difference tidak memakai celebration dan tetap mempertahankan warning yang dapat ditindaklanjuti.
- Error mutation, `row_version` conflict, outcome write yang tidak pasti, maintenance/read-only, backup/restore/import, dan status integrasi yang perlu ditindaklanjuti **tidak boleh** hanya berupa toast yang auto-dismiss; gunakan notice/error state persisten.
- Aksi destructive tetap memakai modal/confirmation guard. Label “undo” hanya boleh memanggil compensating action domain yang audited (mis. cancel/reverse), bukan hard rollback atau penghapusan histori.
- Halaman baru tidak boleh membuat toast/snackbar implementation sendiri; gunakan primitive feedback canonical.

## Kontrak capability desktop dan mobile

- Semua route, data, aksi, state, dan izin yang tersedia pada desktop wajib dapat dijangkau pada mobile PWA; begitu juga sebaliknya.
- Kesetaraan berarti **capability parity**, bukan tampilan piksel-identik. Desktop boleh memakai toolbar/panel, sedangkan mobile boleh memakai drawer, bottom sheet, `details`, atau card ringkas.
- Authorization dan business behavior tidak boleh bercabang berdasarkan viewport, user agent, atau status PWA. Keduanya memakai handler, API facade, serta backend guard yang sama.
- Komponen presentasi desktop/mobile wajib memakai domain/read model canonical yang sama ketika menampilkan data yang sama. Kontrol presentasi boleh berbeda bila dataset yang tersedia memang berbeda cakupan; contoh: Dashboard mobile hanya menampilkan lima transaksi terbaru dari recent slice, sedangkan search/filter lengkap tetap di `/transaksi`. Shortcut utama Beranda mobile adalah `Alokasi Dana`, `Jadwal Rutin`, dan `Target`; transaksi baru tetap memakai tombol `+` global agar Beranda tidak menduplikasi composer transaksi. Jika ada alert aktif, Dashboard mobile menampilkan satu `Perlu dilakukan` prioritas sebelum informasi rekening sekunder dan seluruh alert lain tetap dapat dijangkau melalui `/notifikasi`. Transfer baru pada viewport mobile tetap memakai `TransactionForm` canonical dengan presentasi `mobile-transfer`. Business form tidak boleh diduplikasi hanya untuk perangkat berbeda.
- Setiap breakpoint harus menyediakan jalur sesi yang terlihat. Desktop logout tidak boleh disembunyikan sebelum navigasi mobile yang memuat logout aktif.
- Route sekunder pada navigasi mobile harus memberi orientasi aktif melalui menu `Lainnya` dan `aria-current`.
- Tab interface memakai WAI-ARIA roving focus: satu tab aktif `tabIndex=0`, tab lain `-1`, ArrowLeft/ArrowRight berpindah, Home/End menuju ujung, dan panel terhubung dengan `aria-controls`/`aria-labelledby`.
- Pengurangan informasi pada mobile hanya boleh melalui progressive disclosure; data atau aksi tidak boleh dihapus tanpa pengganti yang dapat dijangkau.
- Perubahan dashboard/navigation wajib diuji pada batas 820/821 dan 940/941 CSS pixel, selain viewport ponsel, tablet, dan desktop umum.

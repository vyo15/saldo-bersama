# UI Design System

Dokumen ini adalah kontrak visual dan implementasi UI Saldo Bersama. Tujuannya menjaga tampilan konsisten, semantik, aksesibel, dan mudah dilanjutkan oleh developer atau ChatGPT lain tanpa membuat pola styling baru pada setiap halaman.

## Keputusan utama

- Framework aplikasi tetap React + Vite.
- Styling canonical menggunakan CSS Modules dan design tokens pada `frontend/src/styles/tokens.css`.
- Tailwind CSS, utility-class-heavy styling, dan shadcn/ui tidak digunakan.
- Mantine telah disetujui dan dependency-nya sudah tercatat pada workspace/lockfile, tetapi hanya boleh digunakan melalui shared wrapper component.
- Feature/page tidak boleh mengimpor Mantine secara langsung. Halaman memakai komponen project pada `frontend/src/components/common/` atau komponen domain yang relevan.
- HTML native dan semantik diprioritaskan. Toolkit digunakan untuk perilaku kompleks seperti dialog, drawer, select, date picker, menu, tooltip, dan notification.

Status source saat dokumen ini diperbarui: shared primitive sudah memakai CSS Modules dan dependency Mantine sudah ada pada `frontend/package.json` serta `package-lock.json`. Adopsi komponen Mantine pada runtime tetap bertahap melalui wrapper dan belum berarti seluruh primitive telah dimigrasikan.

## Source of truth

| Area | Canonical source |
|---|---|
| Warna, spacing, radius, shadow, motion | `frontend/src/styles/tokens.css` |
| Reset dan semantic global defaults | `frontend/src/styles/reset.css` |
| Shared UI primitive | `frontend/src/components/common/` |
| Layout aplikasi | `frontend/src/layouts/` dan `frontend/src/styles/app.css` |
| Responsive/PWA safe area | `frontend/src/styles/responsive.css` selama migrasi; feature style baru harus colocated |
| Keputusan toolkit | `docs/adr/0009-mantine-css-modules-ui-foundation.md` |

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
├── finance/      komponen visual domain keuangan
├── navigation/   navigasi desktop/mobile
└── pwa/          install/update/connectivity state
```

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


## Modal dan overflow mobile

- `.modal__body` adalah satu-satunya scroll container internal dialog dan hanya boleh menggulir vertikal. Horizontal overflow harus ditutup pada container, bukan pada konten dengan clipping acak.
- `form-grid`, child grid, `fieldset`, `.field`, money input, optional section, dan native file input wajib memiliki `min-width: 0` serta `max-width: 100%`.
- Indikator scrollbar dapat disembunyikan pada mobile, tetapi `overflow-y: hidden`, pembatasan zoom viewport, dan konten footer yang tidak dapat dijangkau dilarang.
- Carousel horizontal hanya boleh dipakai untuk kontrol yang memang memilih urutan item, saat ini rekening. Filter, tab kategori, dan kelompok ikon harus wrap atau grid.

## Information architecture Pengaturan

- `/pengaturan` adalah ringkasan status. Notifikasi, Integrasi, Anggota, Export, Import, Backup, Pemulihan, Periode, dan Audit memakai nested route sendiri.
- Setiap route hanya memuat resource yang dibutuhkan dan menampilkan loading/error/result dekat tindakan. Error Audit tidak boleh mengganggu Notifikasi, dan sebaliknya.
- Owner-only item boleh disembunyikan dari navigasi anggota, tetapi direct route tetap harus menampilkan guard dan backend selalu menjadi authorization utama.
- Tile layanan adalah `button` bila melakukan aksi. Status siap tanpa aksi tidak boleh diberi click handler pada elemen non-interaktif.

## HTML semantik

Gunakan elemen berdasarkan makna:

- `header`, `nav`, `main`, `section`, `article`, `aside`, `footer` untuk struktur.
- `button` untuk aksi dan `a`/`NavLink` untuk navigasi.
- `form`, `fieldset`, `legend`, `label` untuk input.
- `table` hanya untuk data tabular.
- `progress` untuk progres terukur.
- Dialog wajib memiliki `role="dialog"`, `aria-modal`, accessible name, focus trap, Escape handling, dan focus restoration.

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
- BCA, BNI, BTN, Mandiri, dan Permata memakai asset WebP 768×484 sebagai base visual. Wordmark dan chip dekoratif hanya berasal dari asset; HTML tidak boleh menggambarnya kembali.
- Semua kartu memakai rasio 1.586:1, container, radius, dan object sizing yang sama. Tidak boleh ada bank yang tampak lebih panjang, pendek, atau terbungkus panel dekoratif tambahan.
- Card face menambahkan contactless, nomor rekening yang sudah dinormalisasi, dan nama rekening. Pada stack mobile terautentikasi, saldo saat ini dan label kepemilikan boleh tampil sebagai overlay ringkas; status, timestamp, nomor lengkap, dan aksi tetap berada pada panel detail.
- Nomor rekening berasal dari `accounts.account_number`, dikelompokkan empat digit, dan hanya ditampilkan setelah authentication serta binding user backend. Kedua pengguna terotorisasi dapat membacanya; tombol salin berada di panel detail dan memiliki accessible name.
- Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap dilarang pada asset, DOM, payload, audit, dan integrasi.
- Desktop lebar memakai daftar ringkas di kiri dan satu panel detail sticky di kanan. Pada viewport yang tidak cukup, detail disembunyikan sampai item dipilih lalu tampil sebagai dialog overlay dengan focus trap, Escape handling, body scroll lock, dan focus restoration ke kartu pemicu.
- Mobile memakai circular 3D card stack dengan node kartu yang stabil. Satu rekening menampilkan satu kartu, dua rekening menampilkan dua kartu, dan tiga atau lebih menampilkan maksimal tiga kartu terlihat dengan ukuran serta rasio yang identik. Swipe vertikal pada kartu aktif dan tombol Arrow Up/Down memutar urutan secara sirkular; wheel, auto-rotate, pagination dots, dan panah samping tidak digunakan.
- Area kosong stack wajib memakai `touch-action: pan-y pinch-zoom`. Kartu aktif memakai `touch-action: pan-x pinch-zoom` agar gesture vertikal mengubah rekening tanpa mematikan pinch zoom. Gesture horizontal harus ditolak dan tidak boleh membuka detail atau mengubah rekening.
- Selama gesture, seluruh tumpukan mengikuti jari menggunakan `transform`/`opacity`; kartu depan bergerak ke belakang dan kartu berikutnya maju ke depan. Swipe pendek kembali ke posisi semula, reduced-motion mengurangi rotasi dan durasi, dan rekening aktif diumumkan tanpa membacakan saldo.
- Nomor rekening panjang boleh dipadatkan hanya pada muka kartu agar tidak overflow; panel detail, accessible copy action, dan data backend tetap memakai nomor lengkap.
- Bank yang tidak dikenali serta rekening non-bank memakai fallback flat berbasis satu design token, tanpa radial/linear gradient atau overlay glossy, dan tidak bergantung pada asset pihak ketiga.
- Rekening dan kategori tidak dicampur dalam satu halaman. `/rekening` memakai aksi `Tambah rekening`; `/kategori` memakai aksi `Tambah kategori`. Masing-masing membuka dialog desktop atau bottom sheet mobile tanpa tab domain lain. Field `No rekening` wajib untuk rekening bank dan memperbarui preview langsung.
- Template bank disimpan pada `accounts.bank_template` schema v5 dan tetap bersifat presentational. Mengubah template tidak mengubah nama, saldo, atau aturan transaksi.

## Mobile dan PWA

- Mobile adalah layout aplikasi, bukan desktop yang diperkecil.
- Navigasi bawah fixed harus menyisakan safe area dan ruang scroll.
- Indikator scrollbar mobile boleh disembunyikan untuk tampilan app-like, tetapi scroll vertikal tidak boleh dikunci, body tidak boleh membentuk nested scroll yang membingungkan, dan konten terakhir harus tetap dapat dijangkau.
- Full-height app memakai fallback `100vh` lalu `100dvh` pada root dan shell. Jangan memakai `100vh` sebagai satu-satunya sumber tinggi mobile.
- Route full-bleed atau route dengan surface khusus wajib memasang background pada shell/main/content, bukan hanya page component, agar reserved navigation gap dan safe area tetap menyatu secara visual.
- Loading/fatal error di luar shell memenuhi viewport. Loading/fatal error/404 di dalam shell memenuhi sisa area content, bukan menambah viewport penuh di dalam shell.
- Dialog menjadi bottom sheet pada viewport kecil tanpa menduplikasi business form.
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

- Information architecture canonical: Perencanaan memuat Anggaran, Alokasi, Jadwal rutin, dan Target; Data keuangan memuat Rekening serta Kategori; Rekonsiliasi berada pada Kontrol saldo; Pengaturan berada pada Aplikasi.
- `/anggaran` adalah route pengelolaan. `/laporan` bersifat analitis dan tidak memuat mutation anggaran. Route `/tagihan` dipertahankan, tetapi label UI canonical adalah `Jadwal rutin`.
- Sidebar desktop mempertahankan mask melengkung brand Saldo Bersama. Ukurannya boleh diperbesar untuk tap target dan proporsi layar, tetapi bentuk/aset canonical tidak boleh diganti tanpa approval visual baru.
- Kontrol utama desktop minimum 44×44px. Enam kontrol canonical dikelompokkan rapat di tengah rail tanpa mengubah mask organik. Submenu grup memakai anchored flyout di samping trigger, label satu baris, trigger-toggle, Escape, click-outside, route-close, dan focus restoration; tombol X tidak diperlukan untuk flyout navigasi.
- Theme toggle hanya tampil pada kontrol shell yang canonical. Menu mobile “Menu lainnya” tidak menduplikasi dark/light toggle; logout berada pada footer terpisah dan bottom navigation tetap tersedia.

## Login dan anggota

- Login desktop memakai artwork approved sebagai visual layer utuh agar komposisi light/dark konsisten dengan desain referensi. Artwork mempertahankan rasio 1672×941 dan ditampilkan tanpa menggambar ulang ilustrasi dengan CSS. Area autentikasi tetap menampilkan satu host Google Identity Services canonical di atas artwork; error konfigurasi/login dan retry hanya muncul saat diperlukan.
- Login mobile ≤820px memakai tiga slide total: onboarding “Rajin menabung, bijak belanja”, onboarding “Atur anggaran, hindari boros”, lalu slide login. Artwork mempertahankan rasio 941×1672, tombol `Lanjut` menggunakan hotspot semantik, swipe horizontal dan ArrowLeft/ArrowRight tersedia, dan `prefers-reduced-motion` mematikan transisi slide.
- Artwork tidak boleh menggantikan kontrol autentikasi. Tombol Google tetap dirender oleh Google Identity Services/Firebase flow existing. Karena Google membatasi tampilan provider, area tombol boleh berbeda sedikit dari artwork referensi; jangan menyamarkan iframe provider dengan tombol palsu.
- Link creator eksternal harus memakai `noopener noreferrer`, focus-visible, dan target sentuh minimum 44px. Theme toggle mobile adalah kontrol DOM asli yang ditempatkan di atas artwork login; artwork onboarding mobile yang disetujui saat ini tetap light agar pixel-match dengan referensi.
- Halaman Akses anggota tetap owner-only. Daftar memakai card profil yang mudah dipindai, search nama/email, filter role, dan Modal canonical untuk tambah/ubah. Destructive member action tetap memakai confirmation guarded dan backend authorization.
- `UserAvatar` memakai foto Google hanya bila URL profil tersedia dari session/read model tepercaya. Jika `users.list` tidak menyediakan foto anggota lain, gunakan initials fallback; jangan mengambil foto dari Google Search atau mengarang URL.
- Aktivitas anggota adalah audit-friendly view atas ledger existing berdasarkan `created_by`, bukan ledger baru dan bukan ukuran kontribusi finansial. Copy wajib menyebutnya sebagai pencatat, bukan pembayar/pemakai.
- Desktop menampilkan aktivitas anggota sebagai right drawer read-only. Mobile ≤820px menampilkan full-screen detail dengan focus trap, tombol kembali, body scroll lock, safe area, dan focus restoration.
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
- Error mutation, `row_version` conflict, outcome write yang tidak pasti, maintenance/read-only, backup/restore/import, dan status integrasi yang perlu ditindaklanjuti **tidak boleh** hanya berupa toast yang auto-dismiss; gunakan notice/error state persisten.
- Aksi destructive tetap memakai modal/confirmation guard. Label “undo” hanya boleh memanggil compensating action domain yang audited (mis. cancel/reverse), bukan hard rollback atau penghapusan histori.
- Halaman baru tidak boleh membuat toast/snackbar implementation sendiri; gunakan primitive feedback canonical.

## Kontrak capability desktop dan mobile

- Semua route, data, aksi, state, dan izin yang tersedia pada desktop wajib dapat dijangkau pada mobile PWA; begitu juga sebaliknya.
- Kesetaraan berarti **capability parity**, bukan tampilan piksel-identik. Desktop boleh memakai toolbar/panel, sedangkan mobile boleh memakai drawer, bottom sheet, `details`, atau card ringkas.
- Authorization dan business behavior tidak boleh bercabang berdasarkan viewport, user agent, atau status PWA. Keduanya memakai handler, API facade, serta backend guard yang sama.
- Komponen presentasi desktop/mobile wajib memakai view model dan state filter yang sama ketika menampilkan domain yang sama. Business form tidak boleh diduplikasi hanya untuk perangkat berbeda.
- Setiap breakpoint harus menyediakan jalur sesi yang terlihat. Desktop logout tidak boleh disembunyikan sebelum navigasi mobile yang memuat logout aktif.
- Route sekunder pada navigasi mobile harus memberi orientasi aktif melalui menu `Lainnya` dan `aria-current`.
- Pengurangan informasi pada mobile hanya boleh melalui progressive disclosure; data atau aksi tidak boleh dihapus tanpa pengganti yang dapat dijangkau.
- Perubahan dashboard/navigation wajib diuji pada batas 820/821 dan 940/941 CSS pixel, selain viewport ponsel, tablet, dan desktop umum.

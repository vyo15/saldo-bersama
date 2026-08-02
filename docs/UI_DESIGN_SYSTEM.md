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

## Mobile dan PWA

- Mobile adalah layout aplikasi, bukan desktop yang diperkecil.
- Navigasi bawah fixed harus menyisakan safe area dan ruang scroll.
- Dialog menjadi bottom sheet pada viewport kecil tanpa menduplikasi business form.
- Keyboard virtual tidak boleh menutup nominal atau action utama.
- PWA tetap `display: standalone`; Fullscreen API tidak dipaksakan.
- Offline write finansial tetap dilarang.

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

## Review checklist UI

- Apakah elemen semantik sudah tepat?
- Apakah shared component existing digunakan?
- Apakah token dipakai tanpa hardcoded visual value baru?
- Apakah focus, keyboard, error, loading, mobile, dan dark mode diuji?
- Apakah perubahan memengaruhi transaksi, saldo, authorization, atau data flow?
- Apakah screenshot/preview mencakup mobile dan desktop?
- Apakah docs, changelog, status, serta handoff diperbarui?

## Kontrak capability desktop dan mobile

- Semua route, data, aksi, state, dan izin yang tersedia pada desktop wajib dapat dijangkau pada mobile PWA; begitu juga sebaliknya.
- Kesetaraan berarti **capability parity**, bukan tampilan piksel-identik. Desktop boleh memakai toolbar/panel, sedangkan mobile boleh memakai drawer, bottom sheet, `details`, atau card ringkas.
- Authorization dan business behavior tidak boleh bercabang berdasarkan viewport, user agent, atau status PWA. Keduanya memakai handler, API facade, serta backend guard yang sama.
- Komponen presentasi desktop/mobile wajib memakai view model dan state filter yang sama ketika menampilkan domain yang sama. Business form tidak boleh diduplikasi hanya untuk perangkat berbeda.
- Setiap breakpoint harus menyediakan jalur sesi yang terlihat. Desktop logout tidak boleh disembunyikan sebelum navigasi mobile yang memuat logout aktif.
- Route sekunder pada navigasi mobile harus memberi orientasi aktif melalui menu `Lainnya` dan `aria-current`.
- Pengurangan informasi pada mobile hanya boleh melalui progressive disclosure; data atau aksi tidak boleh dihapus tanpa pengganti yang dapat dijangkau.
- Perubahan dashboard/navigation wajib diuji pada batas 820/821 dan 940/941 CSS pixel, selain viewport ponsel, tablet, dan desktop umum.

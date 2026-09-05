# ADR-0009 Mantine dan CSS Modules sebagai fondasi UI

**Status:** Accepted — toolkit adoption deferred until first runtime consumer
**Date:** 2026-08-02

## Context

Saldo Bersama memakai React/Vite dan custom CSS yang sudah memiliki token, light/dark theme, PWA responsive layout, serta shared component. Project perlu UI modern yang konsisten dan mudah dilanjutkan lintas developer/ChatGPT, tetapi pemilik menolak Tailwind dan utility-class-heavy styling karena dinilai kurang rapi dan kurang semantik.

Mengganti seluruh UI sekaligus berisiko merusak responsive behavior, accessibility, form transaksi, dan visual state yang sudah berjalan. Menambahkan dependency tanpa lockfile yang valid juga tidak dapat diterima karena akan mematahkan `npm ci`.

## Decision

1. CSS Modules dan design tokens project menjadi metode styling canonical.
2. Mantine tetap menjadi toolkit kandidat yang disetujui untuk perilaku kompleks dan aksesibilitas, tetapi tidak dipasang sampai ada shared wrapper runtime yang benar-benar membutuhkannya.
3. Mantine hanya boleh dipakai di balik shared wrapper component; feature/page dilarang mengimpor Mantine langsung.
4. HTML native tetap diprioritaskan untuk kontrol sederhana dan struktur semantik.
5. Tailwind CSS, shadcn/ui, utility-class-heavy styling, serta styling layout melalui `sx`/style props tidak digunakan.
6. Adopsi dilakukan bertahap. Tahap pertama memperkuat wrapper existing dan memindahkan primitive styling ke CSS Modules tanpa mengubah business logic.
7. Dependency Mantine tidak disimpan sebagai dependency idle. Saat wrapper pertama benar-benar mengadopsinya, package dan lockfile harus diperbarui atomik dan full quality gate wajib PASS pada Node 24.

## Consequences

### Positive

- JSX tetap terbaca dan styling terisolasi per komponen.
- Brand, dark mode, dan design token tetap dikendalikan project.
- Feature tidak terikat langsung ke toolkit sehingga migrasi/upgrade lebih aman.
- Komponen kompleks dapat memakai primitive teruji tanpa membangun focus/keyboard behavior berulang.
- Chat/developer baru memiliki aturan canonical dan tidak perlu memilih framework lagi.

### Trade-offs

- Ada adapter/wrapper layer yang harus dipelihara.
- Migrasi lebih lambat daripada mengganti seluruh UI sekaligus.
- Global compatibility classes masih ada selama transisi dan harus dihapus bertahap.
- Tidak ada dependency toolkit idle; Mantine baru ditambahkan saat shared wrapper memiliki consumer runtime yang nyata.

## Alternatives

- Ant Design: ditolak sebagai baseline karena design language enterprise kuat dan override branding besar.
- Material UI: tidak dipilih karena pola `sx`/styling prop mudah mencampur layout dengan JSX.
- React Aria saja: sangat fleksibel tetapi membutuhkan design-system implementation lebih besar.
- Custom-only: tetap mungkin, tetapi biaya menjaga komponen kompleks dan accessibility meningkat.
- Tailwind/shadcn: ditolak eksplisit oleh pemilik project.

## References

- `../UI_DESIGN_SYSTEM.md`
- `../../frontend/src/styles/tokens.css`
- `../../frontend/src/components/common/`

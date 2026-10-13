# Patch final — segmented filter dengan wrap teal stabil

Tanggal: 2026-10-13. Source baseline: ZIP `saldo-bersama-clean.zip` terbaru yang dilampirkan. Scope: CSS/React presentasional; tidak ada perubahan finance rules, API, database, izin, atau payload.

## Keputusan desain

- Background wrapper: `var(--surface-soft)` canonical.
- Indicator slider terpilih: **selalu** `var(--primary-soft)` (teal), bukan `var(--negative-soft)` saat Keluar dan bukan `var(--positive-soft)` saat Masuk.
- Teks/ikon filter yang aktif: warna semantik sesuai tipe, tanpa background berubah. Tidak ada animasi warna wrap. `transform` 220 ms dan `prefers-reduced-motion` dihormati.
- Wishlist yang sudah benar tidak dirombak; implementasi Transaksi mengikuti cara bergeraknya. Transfer/Refund/etc melalui dialog lanjutan tidak memaksa state Semua aktif.

## Cakupan audit dan perubahan

1. **Transaksi mobile:** segmen Semua, Keluar, Masuk sekarang memakai pseudo-element sliding tunggal; latar stabil teal; warna ikon/teks sesuai pemasukan/pengeluaran. Label compact pada 320–430px menjaga ruang tiga pilihan dan tombol search/filter.
2. **Shared `QuickSegmentedFilter`:** warna semantic ditetapkan opsional oleh consumer, tidak diambil dari semua label secara otomatis, sehingga ownership tetap netral. Dipakai pada Rekening, Investasi, Atur Dana aktif, Jadwal, Shopping, Anggota, dan Audit.
3. **Jadwal:** indikator Perlu perhatian menampilkan amber pada teks. **Belanja:** Selesai positif. **Aktivitas Anggota:** Pemasukan hijau, Pengeluaran merah. Pada semua consumer, *sliding wrap tetap teal*.
4. **Notifikasi:** dua filter Perlu tindakan/Pengingat tetap memakai data, count, dan layout yang sama, tetapi indicator slide tidak mewarnai tombol per pilihan.
5. **Detail Alokasi – Kebutuhan:** Semua/Perhatian/Belum dipakai memakai slider 3 posisi; lebar penanda mengikuti gap 4px desktop/3px mobile, tanpa mengubah filtering atau handler.
6. Reduced motion, focus, keyboard controls, tap target, dark/light tokens dipertahankan. Tidak ada library baru atau file lama yang perlu dihapus.

## Regression & quality gate

- `frontend/test/segmented-motion-consistency.test.js` mengunci latar teal stabil, state semantik hanya foreground, dan pola semua slider.
- Source regression lain: `filter-convergence.test.js`, `soft-surface-harmony.test.js`, `mobile-overflow-settings.test.js`, `icon-semantics.test.js`, `wishlist-mobile-layout.test.js`, `notification-center.test.js`, `theme-accessibility.test.js`, `budgets-ui.test.js`.
- Browser CSS fixture dark/light pada 320/390/430/820px memeriksa warna pseudo-element tetap sama dan tidak ada overflow pada keempat jenis rail (Transaksi, shared, Notifikasi, Kebutuhan). **Fixture tidak menggantikan QA React runtime yang terhubung ke data nyata.**
- `npm ci && npm run verify && npm run test:browser && npm run zip` wajib dilakukan pada instalasi lokal dengan dependency lengkap. Jika fail, jangan push/deploy sampai penyebab jelas.

## Aplikasi patch

ZIP berisi **hanya** path yang berubah, relatif terhadap root repository `saldo-bersama`. Ekstrak dari root folder project, jangan ke parent folder. Backup/commit pekerjaan lokal sebelum overwrite bila ada edit paralel. Lalu:

```bash
npm ci
npm run verify
npm run test:browser
npm run zip
git status --short
git add CHANGELOG.md docs frontend/src frontend/test
git commit -m "fix(ui): keep teal slider consistent across finance filters"
git push origin main
```

Tidak ada `git rm` yang diperlukan. Bila source lokal sudah mengandung patch berbeda dari ZIP lampiran, jangan overwrite membabi buta; lakukan merge diff terlebih dahulu.

## Hasil pemeriksaan pada source patch ini

- `node scripts/validate-source-tree.mjs`: PASS, 956 file canonical.
- `node scripts/check-node-syntax.mjs`: PASS, 254 file.
- `node scripts/check-apps-script-syntax.mjs`: PASS, 6 file.
- `node --test frontend/test/*.test.js`: 447/454 PASS, 7 tidak bisa berjalan karena `react`/`react-icons` belum tersedia di lingkungan audit (bukan assertion baru yang gagal).
- Browser Chromium CSS fixture: 32 kombinasi tema/lebar/rail PASS; pengecekan tambahan label Transaksi 320/360/390/391/400/430/431/440 juga tanpa overflow. Fixture menguji CSS asli pada DOM sederhana, bukan keseluruhan React app.
- `npm ci --offline` gagal `ENOTCACHED` pada paket Vite; lint, build, dan browser smoke aplikasi lengkap **belum tervalidasi**. Jangan menyebut patch ini production-ready sebelum quality gate pada mesin project berhasil.

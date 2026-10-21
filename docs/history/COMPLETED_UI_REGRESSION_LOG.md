# Log ringkas regresi UI yang telah ditangani

> **Status:** Historical. Catatan diagnosis dan pencegahan, **bukan** authority perilaku produk.
> **Sumber detail:** Git history/`CHANGELOG.md`; aturan aktif ada di `../UI_DESIGN_SYSTEM.md` dan `../TEST_PLAN.md`.

| Waktu | Gejala / penyebab | Pencegahan permanen |
|---|---|---|
| 13 Okt 2026 | Filter ownership mengganti warna saat berpindah scope; presentasi dan state saling melekat. | Teal tetap stabil, warna berperan sebagai identitas; filter tidak mengubah bisnis. Tes scope/theme/aksesibilitas. |
| 13 Okt 2026 | Animasi modal dan navigasi tidak konsisten saat unmount atau perangkat reduced-motion. | Motion finite di primitive bersama, pemeriksaan unmount/back/focus, reduced-motion dan device smoke. |
| 16 Okt 2026 | Penghapusan Alokasi/Kebutuhan terlihat diam karena handler tidak membuka modal pada view detail. | Uji handler → preview lifecycle → konfirmasi → hasil server; jangan menduplikasi action sheet dan backend menjadi authority. |
| 16 Okt 2026 | Audit Smart Delete 46 kategori menemukan istilah delete/archive/hide/cancel berpotensi tertukar. | Pakai preview dependensi, jangan hapus ledger atau histori; tes akses, retry, saldo, RDN, restore. |
| 21 Okt 2026 | Menu `···` Target terbuka ke bawah dan tertutup bottom navigation; menu kartu lain serta menu Keluarga memiliki pola positioning serupa. | Gunakan `ActionOverflowMenu` portal + kalkulasi ruang layar/navigation, flip ke atas, pembatas tinggi dan scroll, Escape, fokus; tes geometri dan manual iPhone/PWA. |
| 21 Okt 2026 | Pindah Atur Dana → Target tidak punya return parent; halaman mengandalkan arah browser. | Pintasan menyertakan asal dan Target menyediakan `ContextBack` ke `/perencanaan/kantong` ketika masuk dari Atur Dana; fallback deep-link tetap normal. |
| 21 Okt 2026 | Callback `WishlistPage` memiliki complexity 25 (batas 20) sehingga `npm run zip` gagal pada lint. | Pisahkan konfirmasi arsip dan overlay dialog tanpa mengubah state server/unknown retry; tetap `--max-warnings 0`. |

## Aturan perawatan

- Kasus yang **belum selesai** dicatat di issue/roadmap aktif, bukan diberi tanda selesai di tabel ini.
- Setelah perbaikan terverifikasi, simpan **satu baris**: gejala, akar penyebab, regression guard. Riwayat lengkap tetap di Git.
- Jangan menambahkan salinan screenshot, full test output, daftar 46 item, atau laporan kandidat bertanggal ke current docs; gunakan referensi Git/CI jika perlu rekonstruksi.
- Hasil test spesifik patch ada di manifest artefak; jangan diklaim sebagai status rilis terbaru.

### Dokumen snapshot lama yang diringkas ke log ini

- `docs/FILTER_TEAL_STABLE_PATCH_2026-10-13.md`
- `docs/MOTION_UX_CHANGELOG_2026-10-13.md`
- `docs/SMART_DELETE_COVERAGE_2026-10-16.md`
- `docs/SMART_DELETE_COVERAGE_MATRIX_2026-10-16.md`

Sumber asli tetap dapat dibaca pada commit Git sebelum konsolidasi; keempat dokumen tidak digunakan untuk memutuskan current runtime.

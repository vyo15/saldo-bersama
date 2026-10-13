# Motion & UX Psychology — patch implementation (13 Oktober 2026)

## Scope dan batas

Perubahan ini **tidak mengubah** API, schema database, saldo/RDN, nominal, validasi transaksi, hak akses, atau desain visual utama. Yang diselaraskan adalah semantik waktu, siklus hidup animasi, feedback, dan aksesibilitas. Pekerjaan mengacu pada audit/rundown 12 Oktober serta source terbaru dari `saldo-bersama-clean.zip`.

## Implementasi yang benar-benar berubah

| Lapisan/halaman | Perubahan aktual | Bukti source/test |
|---|---|---|
| Semua modal berbasis `Modal` yang tetap mounted saat `open` menjadi false | `useModalPresence` menahan portal selama animasi exit; backdrops dan dialog mempunyai exit desktop/mobile; `transitionend`/`animationend` dengan fallback token; history marker dilepas saat *logical close*, focus trap/body lock sampai visual exit | `Modal.jsx`, `useModalPresence.js`, `Modal.module.css`, `motion-polish-regression.test.js` |
| Swipe bottom sheet mobile | Durasi CSS dan JS sama (`--motion-sheet-exit`), tunggu transition event; jangan dua kali keluar saat swipe sudah selesai. Swipe gesture tidak ditawarkan saat form `discardGuard.dirty` sehingga draft tetap bisa diproteksi melalui close confirmation | `useMobileSwipeDismiss.js`, `Modal.jsx` |
| Notifikasi | Fase swipe → collapse diselesaikan berurutan via transition events dengan fallback aman; `will-change` hanya saat gesture/exit; Delete keyboard mengembalikan fokus ke row/fungsi filter; screen reader mendapat konfirmasi dari operasi `dismiss` yang berhasil atau gagal | `NotificationRow.jsx`, `NotificationsPage.jsx`, CSS terkait |
| Target | Celebration deposit biasa auto-close 6 detik; postcard milestone/100% tidak auto-close, ada tombol **Tutup** ber-hit target 44px. Data target tetap di kartu/halaman hasil server; reduced motion tidak memainkan confetti | `GoalAchievementPostcard.jsx` dan CSS |
| Navigasi mobile | Marker aktif digeser via `transform` alih-alih tweening posisi `left` | `styles/responsive.css` |
| Login mobile | Lepas compositing hint `will-change` yang permanen pada track, gunakan hanya saat drag | `LoginMobile.module.css` |
| Perencanaan / Kebutuhan | Input nominal besar tidak melakukan transisi `font-size` ketika pengguna mengetik | `BudgetBatchEditor.module.css` |
| Transaksi antrean review | Timer handoff form edit berpatokan token durasi modal, dibersihkan saat unmount | `TransactionsPage.jsx` |
| Global | Token `dialog-exit`, `sheet-exit`, `swipe-exit`, `swipe-collapse`; helper `finishMotionPhase` yang membatalkan listener+fallback saat cleanup dan menghormati reduced motion | `tokens.css`, `shared/motion.js` |

## Halaman yang mendapat dampak komponen bersama

Seluruh pengguna `Modal` akan memakai lifecycle baru **bila komponen `Modal` masih mounted ketika prop `open` berubah ke false**. Ini mencakup beberapa alur Transaksi, Atur Dana/Kebutuhan, Jadwal, Kategori, Rekening, Investasi, Target, Reminder, anggota, persetujuan, dan pengaturan yang memakai komponen tersebut. Konten lain di Dashboard, Wishlist, Laporan, Belanja, Rekonsiliasi, 404/offline, dll. tidak diubah desainnya hanya demi menciptakan motion baru. Kontrak filter/picker/reduced-motion existing dipertahankan.

**Batas teknis yang penting:** beberapa parent memakai mount kondisional (`{target ? <Dialog ... /> : null}`) atau `if (!target) return null`, sehingga instance modal dapat di-unmount sebelum `open=false` diteruskan. Untuk jalur tersebut exit animation tidak dijamin berfungsi oleh perubahan di komponen bersama saja; perlu pembenahan parent per kasus dan uji UI nyata. Tidak benar mengklaim semua jenis exit sudah diperbaiki menyeluruh sebelum hal tersebut teruji. Tidak ada perubahan destruktif dan tidak perlu `git rm`.

## Verifikasi minimum sebelum deploy

1. `npm ci` (node/npm sesuai `package.json`).
2. `npm run lint` — harus 0 warning.
3. `npm test` atau `npm run test` — frontend & backend harus lulus penuh.
4. `npm run build` lalu `npm run verify`, `npm run test:browser`, `npm run zip` menurut prosedur operator project.
5. Manual di Chrome desktop/mobile Android dan Safari iOS: semua cara menutup dialog (X, Escape, backdrop, Back, swipe, batal), modal subview, dirty form, rapid open/close, keyboard + scroll body, reduced motion, notifikasi swipe/keyboard dan Target; cek 320, 360, 390, 430, 820, 821, 1440px; light/dark.
6. Periksa bahwa modal kondisional yang langsung unmount sudah tercakup atau catat sebagai pengecualian; jangan menyebutnya 10/10 hanya berdasar test source.
7. Profil Chrome DevTools Performance pada mobile kelas menengah dan periksa tidak ada jank/forced reflow besar pada swipe/list panjang.

## Hasil verifikasi di lingkungan penyusunan patch

- Regresi motion khusus: **22/22 lulus** (`motion-polish-regression`, `motion-system`, `goal-achievement-celebration`, `mobile-overflow-settings`).
- Full frontend final `node --test frontend/test/*.test.js`: **440/447 lulus**, **7 gagal karena modul `react`/`react-icons` tidak tersedia di lingkungan lokal audit**, bukan karena assertion domain yang gagal. Setelah memasang dependency, harus diuji ulang penuh.
- Parser TypeScript JSX: 324 file JavaScript/JSX frontend lolos pemeriksaan *syntax*; **bukan** pengganti build/runtime.
- `npm ci --offline` gagal `ENOTCACHED` untuk `vite@7.3.6`; `npm ci` online tidak selesai karena koneksi registry. `npm run lint` dan `npm run build` juga gagal `MODULE_NOT_FOUND` karena ESLint/Vite belum terpasang. Oleh karena itu **lint/build/browser smoke belum tervalidasi** dan tidak boleh diklaim PASS.
- `node scripts/validate-source-tree.mjs`: PASS, 952 file; `node scripts/check-node-syntax.mjs`: PASS, 254 file.

## Tidak diubah

Migrasi database, API server, idempotency/transaksi, purchase RDN, permisi, state filter bisnis, warna, font, radius global, urutan menu, dan aset gambar. Jangan menghapus file canonical lama tanpa bukti tidak ada consumer.

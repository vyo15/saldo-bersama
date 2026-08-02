# Test Plan

## Otomatis

```bash
npm run validate:source
npm run lint
npm run lint:backend
npm run test
npm run build
npm run build:budget
npm run check
npm run test:browser
npm run zip
```

Cakupan wajib:

- schema STRICT, FK, integer Rupiah, ownership, bentuk transaksi, cancellation metadata, dan saldo awal negatif;
- backend `no-undef` dan `no-unused-vars` untuk mencegah import dependency hilang saat service dipecah;
- transport session login/logout wajib menunggu objek `Response`, mempertahankan `credentials: include` dan payload action, serta meneruskan API error terstruktur tanpa raw parser `TypeError`;
- authenticated `app.initialState`, budget, recurring create/update/pay/reverse, import apply, restore apply, dan integrity maintenance recovery dijalankan pada SQLite in-memory;
- income/expense/transfer/refund/adjustment;
- saldo historis per urutan transaksi, termasuk saldo minus sementara pada hari yang sama dan edit yang mempertahankan `created_at`;
- row-version conflict dan idempotency replay;
- personal/shared authorization dan IDOR;
- recurring, envelope, budget, goal, reconciliation, close/reopen period;
- read snapshot consistency, maintenance recheck, outbox coalescing, stale worker lock ownership, scheduler replay guard, dan duplicate Calendar prevention;
- formula injection dan valid XLSX;
- backup checksum, preview expiry, safety backup, rollback restore, identity conflict, current allowlist precedence, dan push credential exclusion;
- service worker tanpa API cache dan tanpa offline write queue;
- artifact cleanup/archive tidak menghapus protected path atau memuat secret/generated output;
- browser smoke unauthenticated redirect, mobile overflow, target sentuh 44px untuk kontrol aplikasi, host 44px serta minimum 24px untuk widget provider-managed, accessible name, landmark, dan accessibility tree;
- browser smoke mendeteksi Chrome, Edge, Brave, atau Chromium; kegagalan startup wajib menutup server test tanpa proses menggantung;
- browser smoke memblokir script Google Identity Services eksternal sebelum navigasi dan memakai mock lokal deterministik, sehingga quality gate tidak bergantung pada jaringan provider;
- workflow CI membangun frontend browser smoke dengan nilai public dummy untuk `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY`; nilai ini bukan secret dan hanya mencegah guard konfigurasi menghentikan render mock login;
- gzip bundle dan source archive tetap di bawah budget.

## Manual

Uji dua browser/perangkat dengan owner dan member:

1. Login/logout dan redirect route; uji dari sesi bersih, pastikan login/logout berhasil tanpa reload dan tidak muncul error parser seperti `i.json is not a function`.
2. Edit record yang sama untuk memastikan 409 conflict jelas.
3. Double-click/retry menggunakan idempotency yang sama.
4. Putus jaringan sebelum write; UI harus menolak tanpa menyatakan sukses.
5. Install PWA iPhone/Android, update app shell, push notification.
6. Sinkronisasi Sheets dan Calendar, termasuk failure/retry.
7. Export Excel dan periksa formula-like input.
8. Backup/restore drill pada salinan terisolasi sementara; jangan gunakan database aktif.
9. Responsive, keyboard, focus, contrast, loading/empty/error/unauthorized/maintenance.
10. Full axe scan, authenticated browser journey, visual regression, dan Chrome/Firefox/Safari device coverage.

Tidak boleh mengklaim production-ready hanya berdasarkan unit test; real resource integration dan migration parity wajib lulus.


## Browser smoke cleanup guard

Browser smoke wajib menutup process tree Chromium dan koneksi Chrome DevTools Protocol pada semua jalur sukses maupun gagal. Workflow memberi batas waktu dua menit pada langkah browser agar runner tidak menggantung bila executable browser atau proses turunannya bermasalah.

## Product-control alignment

Perubahan sistem pengendali uang bersama wajib mencakup skenario berikut:

- filter transaksi berdasarkan rekening, kategori, dan pencatat tetap mengikuti projection personal/shared backend;
- laporan tren 3, 6, dan 12 bulan tidak menghitung transfer sebagai pemasukan atau pengeluaran;
- breakdown per pencatat diberi label aktivitas pencatatan, bukan kontribusi finansial;
- breakdown rekening, kategori, dan nature hanya memakai transaksi aktif yang terlihat oleh actor;
- peringatan budget dan kantong muncul pada threshold, tidak menggandakan notifikasi, dan tidak membocorkan scope personal;
- target dengan tanggal selesai menghitung sisa, kebutuhan setoran bulanan, dan status pace secara deterministik;
- rekonsiliasi berbeda atau terlalu lama menghasilkan peringatan tanpa membuat adjustment otomatis;
- notification queue memakai dedupe key stabil dan retry tidak menghasilkan push ganda;
- setiap `REQ-*` dalam product requirements tercatat pada implementation matrix;
- setiap gap yang membutuhkan schema baru memiliki RFC `Proposed` sebelum migration atau API baru dibuat.

Fitur planned seperti receipt, utang/piutang, contribution split, category hierarchy, goal stages, privacy granular, dan Partner role tidak boleh dianggap implemented hanya karena RFC tersedia.

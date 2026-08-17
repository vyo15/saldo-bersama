# Project Status

Dokumen ini adalah snapshot kondisi project sekarang, bukan jurnal perubahan.

## Runtime canonical

- **Frontend:** React 19 + Vite 7 PWA.
- **Backend:** Vercel Functions.
- **Database/source of truth:** Turso/SQLite HTTP pipeline.
- **Auth desktop:** Google Identity Services button → Firebase ID token exchange → server session.
- **Auth mobile:** tombol Google custom pada UI Saldo Bersama tetap sama. Pada production canonical `saldo-bersama.vercel.app`, Firebase Web SDK memakai `signInWithRedirect` dengan authDomain same-origin `/__/auth/*` → Firebase ID token → server session; localhost/device emulation mempertahankan popup sebagai fallback development. Service Worker v8 memperlakukan `/__/auth/*` sebagai network-only dan halaman `/login` mengaktifkan waiting worker sebelum flow redirect agar worker lama tidak memutus auth callback. Backend session tetap authority.
- **Session/authorization authority:** signed HttpOnly server session + backend allowlist/role.
- **Google integration:** Apps Script bridge; Sheets mirror satu arah, Calendar reminder bersama, Drive backup teknis.
- **Active schema contract:** v9.
- Runtime lokal dan Vercel Production dirancang memakai database Turso bersama; operasi destructive/migration tetap guarded.

## Workflow saat ini

- Source terbaru + test aktual adalah sumber kebenaran.
- Tidak ada task card/Task ID/branch automation sebagai workflow wajib.
- Quality gate lokal canonical: `npm run verify`; `npm run zip` menjalankannya otomatis sebelum packaging dan pre-push guard menjalankannya lagi sebelum push. Setelah setiap verification PASS maupun gagal, generated build/test artifact dan cache Vite generated dibersihkan tanpa menghapus dependency, `.env.local`, `.vercel`, atau Git metadata.
- Setelah PASS: commit pada branch, push branch, buka Pull Request, tunggu workflow **Quality** lulus, lalu merge ke `main`. Ruleset GitHub tetap memerlukan verifikasi operasional.
- `npm run zip` membuat clean source canonical fail-closed.
- Guarded/high-risk tetap membutuhkan approval eksplisit sebelum coding/operation.

## Rekening mobile saat ini

- `MobileAccountsExperience` tetap lazy untuk menjaga route-chunk budget. Capability mobile/desktop divalidasi oleh frontend regression dan pemeriksaan manual pada viewport relevan; browser automation tidak menjadi gate canonical.
- Transfer adalah quick action, bukan tab. Form tetap memakai `TransactionForm` canonical dan sukses hanya ditampilkan setelah server mengonfirmasi write.
- `Riwayat` dan `Grafik` adalah dua tab informasi. Transfer tetap tidak dihitung sebagai pemasukan/pengeluaran.
- Kartu rekening memakai asset WebP 768×484 untuk bank, Tunai, Tabungan, serta provider E-wallet ShopeePay, DANA, GoPay, OVO, dan LinkAja. Provider E-wallet disimpan canonical pada `accounts.ewallet_template` schema v8; nama rekening hanya dipakai sebagai fallback untuk object/backup legacy yang belum memiliki field tersebut. Provider `generic` tetap aman untuk E-wallet lain.

## Open operational risks

1. Repository tidak membuktikan seluruh setting Production/GitHub/Vercel; verifikasi operasional tetap diperlukan.
2. Production schema/runtime parity dan resource Google nyata harus diverifikasi melalui runbook.
3. Real-device Web Push dan restore drill memerlukan evidence operasional bila belum dilakukan.
4. Secret rotation mengikuti runbook; secret tidak boleh disalin ke chat/ZIP/source.

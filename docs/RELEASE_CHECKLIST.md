# Release Checklist

## Pre-release

- [ ] Semua perubahan yang termasuk release sudah disetujui dan validation relevan sudah selesai.
- [ ] Perubahan masuk melalui branch + Pull Request; **Quality / check** wajib PASS sebelum merge ke `main`.
- [ ] `npm run check` lulus pada Node 24 canonical.
- [ ] Untuk perubahan frontend/UI, `npm run verify` lulus dan pemeriksaan manual device/viewport relevan sudah dilakukan; tidak ada automated browser gate.
- [ ] Migration/schema impact direview bila relevan.
- [ ] Untuk schema v11, backup teknis pra-migration terverifikasi tersedia; `009_transaction_cost_sharing.sql` diterapkan eksplisit dan `npm run db:integrity` lulus sebelum traffic normal.
- [ ] Shared planning diuji dengan Administrator dan Member: Member hanya dapat mengelola scope Bersama; personal, lifecycle destruktif, dan recovery tetap ditolak.
- [ ] Alokasi existing diuji add/release tanpa perubahan saldo ledger; dashboard memisahkan dana tersedia dari pengeluaran tanpa Alokasi Dana.
- [ ] Cost sharing expense shared diuji `unspecified`/50:50/persentase dan report menyebut pembagian beban, bukan kontribusi aktual.
- [ ] Backup/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Jika auth mobile berubah, Firebase Google provider dan Authorized Domains (`localhost`, `saldo-bersama.vercel.app`) sudah diverifikasi tanpa mengubah allowlist/role backend; OAuth Web Client yang sama dengan `VITE_GOOGLE_CLIENT_ID` memuat `https://saldo-bersama.vercel.app/api/auth/google/callback`, `GOOGLE_OAUTH_CLIENT_SECRET` tersedia hanya pada secret store tepercaya/Vercel Production Sensitive, dan tidak ada secret pada `VITE_*`, Git, ZIP, log, screenshot, atau chat.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] Migration hanya dijalankan bila disetujui.
- [ ] Smoke test Administrator/Member sesuai scope.
- [ ] Login desktop dan mobile memakai tombol branded yang sama: production harus berpindah full-page melalui Google OAuth server flow lalu callback membentuk server session tanpa freeze/double-submit; localhost/device emulation boleh memakai Firebase popup fallback. Vercel Logs harus menunjukkan `session.oauth.start`, callback `session.login` dengan `flow=google-oauth-server` dan status 200, lalu `GET /api/session` 200. Production tidak lagi diharapkan membuat client `POST /api/session`.
- [ ] Saldo/data integrity diverifikasi bila transaksi/data terdampak.

## Close

- [ ] Commit/tag release dicatat bila digunakan.
- [ ] Known issue/rollback window dicatat.
- [ ] Known issue, follow-up, atau pekerjaan tersisa dicatat bila ada.
- [ ] `PROJECT_STATUS.md` mencerminkan kondisi aktual.

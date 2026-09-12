# Release Checklist

## Pre-release

- [ ] Semua perubahan yang termasuk release sudah disetujui dan validation relevan sudah selesai.
- [ ] Commit release berada di `main`; `git push origin main` hanya dilanjutkan setelah managed pre-push memverifikasi ref/SHA aktual, full `npm run verify` PASS, dan Production schema/binding preflight read-only PASS. **Quality / check** server-side dipantau setelah push.
- [ ] `npm run verify` lulus pada Node 22.15.0+ (22.x) atau Node 24.x.
- [ ] Untuk perubahan frontend/UI, `npm run verify` lulus termasuk rendered browser smoke; pemeriksaan manual device/viewport relevan tetap dilakukan untuk authenticated journey, virtual keyboard, dan real-device behavior yang tidak dicakup anonymous smoke.
- [ ] Migration/schema impact direview bila relevan.
- [ ] Untuk schema v18, backup teknis **verified pada schema v17** tersedia sebelum migration Production; `016_global_sync_revisions.sql` diterapkan setelah `015_investment_asset_centric.sql`, database di-bind ke environment yang benar, dan integrity lulus (`npm run db:integrity` untuk Development atau `npm run db:integrity -- production` untuk Production) **sebelum runtime schema baru dipush**. Production migration existing fail-closed bila tidak ada backup `verified` pada schema saat ini.
- [ ] Planning diuji dengan Administrator dan Member: Member dapat mengelola scope Bersama serta planning personal yang bersumber dari rekening pribadinya sendiri; planning personal anggota lain tetap read-only, assignee Alokasi tetap dihormati, sedangkan lifecycle destruktif dan recovery tetap Administrator-only.
- [ ] Alokasi existing diuji add/release tanpa perubahan saldo ledger; dashboard memisahkan dana tersedia dari pengeluaran tanpa Alokasi Dana.
- [ ] Cost sharing expense shared diuji `unspecified`/50:50/persentase dan report menyebut pembagian beban, bukan kontribusi aktual.
- [ ] Investment v17 diuji end-to-end pada data test terisolasi: `investments.assets.create` dapat membuat saham/reksa dana langsung tanpa setup broker/RDN; compatibility account baru `is_system_hidden=1` tidak muncul pada `accounts.list`; hero/Dashboard memakai `market_value`; direct opening position serta Buy/Sell baru memiliki `cash_effect_enabled=0` dan tidak mengubah/bergantung pada Saldo RDN; over-sell/stale `row_version`/IDOR/invalid fee/tanggal tetap ditolak; weighted cost basis + valuation/P&L benar; Member tidak dapat reuse portfolio personal user lain. Fixture histori v15/v16 tetap membuktikan `cash_effect_enabled=1` dan ledger cash lama tidak berubah.
- [ ] Backup schema v18 memuat seluruh history Investment authoritative + opening-position/trade notes + `is_system_hidden` + `cash_effect_enabled`; restore drill v17→v18 dan v18→v18 lulus foreign-key + business integrity. Hasil restore dibandingkan untuk hidden-account visibility, holding, cost basis, P/L, chronology, cash-effect flags, dan ledger parity sebelum success diklaim.
- [ ] Backup/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Jika auth mobile berubah, Firebase Google provider dan Authorized Domains (`localhost`, `saldo-bersama.vercel.app`) sudah diverifikasi tanpa memindahkan authorization dari registry `users`/role backend; OAuth Web Client yang sama dengan `VITE_GOOGLE_CLIENT_ID` memuat `https://saldo-bersama.vercel.app/api/auth/google/callback`, `GOOGLE_OAUTH_CLIENT_SECRET` tersedia hanya pada secret store tepercaya/Vercel Production Sensitive, dan tidak ada secret pada `VITE_*`, Git, ZIP, log, screenshot, atau chat.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] `DATABASE_ENVIRONMENT=production`, binding database Production cocok, database Development berbeda, dan Preview tidak membawa credential database aktif.
- [ ] `npm run env:check:production` memastikan public app/Google/Firebase/origin selaras dengan Development, sementara host/token Turso, `SESSION_SECRET`, dan pasangan VAPID berbeda lintas environment.
- [ ] Migration hanya dijalankan bila disetujui.
- [ ] Smoke test Administrator/Member sesuai scope.
- [ ] Setelah cutover session v2, perangkat legacy diarahkan login ulang; halaman Perangkat dapat list/revoke own session dan revoke-all tanpa IDOR.
- [ ] Login desktop dan mobile memakai tombol branded yang sama: production harus berpindah full-page melalui Google OAuth server flow lalu callback membentuk server session tanpa freeze/double-submit; localhost/device emulation boleh memakai Firebase popup fallback. Vercel Logs harus menunjukkan `session.oauth.start`, callback `session.login` dengan `flow=google-oauth-server` dan status 200, lalu `GET /api/session` 200. Production tidak lagi diharapkan membuat client `POST /api/session`.
- [ ] Saldo/data integrity diverifikasi bila transaksi/data terdampak.

## Close

- [ ] Commit/tag release dicatat bila digunakan.
- [ ] Known issue/rollback window dicatat.
- [ ] Known issue, follow-up, atau pekerjaan tersisa dicatat bila ada.
- [ ] `PROJECT_STATUS.md` mencerminkan kondisi aktual.

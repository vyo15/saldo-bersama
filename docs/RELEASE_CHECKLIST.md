# Release Checklist

> **Status:** Runbook  
> **Purpose:** Checklist release current yang reusable dan tidak terikat nomor patch/migration tertentu.  
> **Authority:** Detail deployment di `DEPLOYMENT.md`, regression di `TEST_PLAN.md`, dan recovery di `RECOVERY_RUNBOOK.md`.

## 1. Source dan quality

- [ ] Scope release jelas dan authority docs yang terdampak sudah diperbarui.
- [ ] `npm run verify` lulus pada runtime Node yang didukung.
- [ ] Untuk perubahan UI: rendered/browser smoke yang tersedia lulus dan manual device/viewport check dilakukan untuk journey authenticated, keyboard/gesture, theme, serta responsive behavior yang relevan.
- [ ] Tidak ada secret, `.env*`, database dump, `node_modules`, archive lama, atau generated junk pada source delivery.
- [ ] `npm run zip` hanya digunakan setelah full verification PASS; gate gagal harus menghasilkan exit non-zero tanpa archive baru.

## 2. Database dan recovery

- [ ] Dampak schema/data direview. Bila ada migration Production, jalankan workflow canonical `npm run prod:update`; tooling harus membuat backup **verified fresh** dari schema aktif sebelum mutation dan menjalankan pending migration secara atomik.
- [ ] Migration canonical mencapai schema current, integrity PASS, dan candidate source yang sama berhasil dipromosikan serta health live diverifikasi.
- [ ] `DATABASE_ENVIRONMENT`, database URL/token, dan binding target cocok; rebind silang Development/Production harus fail-closed.
- [ ] Untuk perubahan data berisiko tinggi, restore drill atau rollback evidence yang relevan tersedia sesuai `RECOVERY_RUNBOOK.md`.
- [ ] Tidak ada klaim restore/migration sukses sebelum foreign-key + business-integrity checks selesai.

## 3. Financial/domain smoke

- [ ] Rekening/saldo/Dana Tersedia tetap memenuhi invariant ledger; Transfer internal netral terhadap income/expense.
- [ ] Alokasi/Kebutuhan: pembuatan Alokasi tidak meminta budget awal sebagai flow utama; Kebutuhan fund/release Alokasi dari Dana Tersedia secara atomic; shortage menjelaskan gap dan tidak membuat partial state.
- [ ] Administrator/Member diuji sesuai capability shared/own-personal; backend tetap menjadi authorization authority.
- [ ] Investasi asset-centric dapat menambah saham/reksa dana tanpa setup broker/RDN UI; Buy/Sell current bersifat accounting-only, oversell/stale write/invalid fee/tanggal tetap ditolak, dan compatibility histori tetap readable.
- [ ] Realtime/pull-to-refresh tidak memerlukan hard reload dan draft lokal tidak hilang saat sync/reconnect.
- [ ] Bila perubahan menyentuh report/notification/reconciliation, targeted smoke pada surface tersebut selesai.

## 4. Environment dan authentication

- [ ] Production env scope benar dan berbeda dari Development untuk database/token/session/VAPID sebagaimana diwajibkan `ENVIRONMENT_VARIABLES.md`.
- [ ] `npm run env:check:production` lulus tanpa membocorkan secret.
- [ ] Production OAuth Web Client memuat callback `https://saldo-bersama.vercel.app/api/auth/google/callback`.
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET` hanya berada pada secret store/Vercel Production Sensitive dan tidak pernah masuk `VITE_*`, Git, ZIP, log, screenshot, atau chat.
- [ ] Login Production desktop/mobile memakai branded server OAuth flow; localhost/device emulation tetap memakai Firebase popup fallback.
- [ ] Vercel Logs/health menunjukkan session/login/read path sukses tanpa freeze/double-submit pada smoke release yang relevan.

## 5. Deploy

- [ ] Gunakan staged Vercel Production build sesuai `DEPLOYMENT.md`.
- [ ] Migration hanya dijalankan bila memang bagian release; gunakan `npm run prod:update` agar backup, migration, integrity, promotion, dan live verification tidak terpisah.
- [ ] Smoke Administrator/Member dilakukan sesuai area yang berubah.
- [ ] Saldo/data integrity diverifikasi bila ledger/planning/investment/data migration terdampak.
- [ ] Google bridge/Calendar/Drive/Web Push dicek bila release menyentuh integrasi tersebut.

## 6. Close release

- [ ] Known issue, rollback window, dan follow-up dicatat di tempat yang benar.
- [ ] `PROJECT_STATUS.md` diperbarui hanya jika **current state** berubah; jangan append kronologi release.
- [ ] Perubahan historis dicatat di `CHANGELOG.md`/Git bila diperlukan.
- [ ] Commit/tag release dicatat bila workflow release menggunakannya.

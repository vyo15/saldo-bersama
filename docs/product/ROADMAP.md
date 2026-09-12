# Roadmap

> **Status:** Canonical planning view  
> **Purpose:** Menunjukkan pekerjaan yang belum selesai atau belum memiliki evidence operasional.  
> **Authority:** Status implementasi detail tetap berada di `../IMPLEMENTATION_MATRIX.md`; history berada di `../../CHANGELOG.md`.

Roadmap menunjukkan **arah berikutnya**, bukan daftar fitur yang sudah selesai dan bukan janji tanggal. Fitur yang sudah menjadi runtime current tidak diulang di sini kecuali masih memiliki pekerjaan verifikasi/operasional yang nyata.

## Now — verification dan operasi

- Jalankan full `npm run verify` pada runtime Node yang didukung untuk setiap perubahan; perubahan UI tetap memerlukan pemeriksaan manual pada viewport/perangkat relevan.
- Lengkapi real-resource backup/restore drill pada database terisolasi, termasuk parity saldo, investasi, histori, dan integrity sebelum/sesudah restore.
- Aktifkan dan verifikasi branch protection/ruleset GitHub dengan workflow **Quality** sebagai required check; enforcement platform tetap merupakan setting GitHub, bukan source code.
- Verifikasi Google bridge, Calendar, Web Push, auth Production, dan notification cadence pada resource/perangkat nyata yang memang dipakai.
- Kumpulkan evidence multi-device Production untuk realtime sync/pull-to-refresh pada perubahan sync-critical.
- Tetapkan dan dokumentasikan keputusan RPO, RTO, serta retention backup sebelum data finansial nyata bergantung pada recovery operasional.
- Verifikasi rotasi secret sesuai `../SECRET_ROTATION_RUNBOOK.md` bila credential pernah keluar dari secret store tepercaya.

## Next — membutuhkan RFC sebelum model/schema/authorization berubah

- **RFC-0011:** lifecycle transaksi, participant role eksplisit (`payer`/`beneficiary`/`liable_party`), draft/rencana, dan receipt privat.
- **RFC-0012:** utang/piutang sebagai obligation + settlement ledger.
- **RFC-0014:** kategori bertingkat dan tahapan target.
- **RFC-0019:** satu cash movement dengan beberapa line item kategori/Kebutuhan tanpa double-count saldo/report.
- Follow-up RFC-0013 dipersempit ke relasi refund → expense asli dan compatibility histori cost-share. Payer/beneficiary/actual contribution tidak diprioritaskan selama model produk tetap satu keuangan keluarga.

## Later — maturity

- Kalender internal lintas event finansial.
- Alerting eksternal, client error reporting, dan retensi observability.
- Axe penuh, authenticated E2E, visual regression, dan performance SLO.
- Enkripsi backup aplikasi dengan key lifecycle yang disetujui.
- Contract schema machine-readable per action.
- Disaster-recovery drill berkala.
- Candidate product gap: reminder konsistensi pencatatan actor-scoped dengan cadence configurable/opt-in; belum ada runtime alert type dan tidak boleh hardcode inactivity global.

## Keputusan RFC yang sudah tercermin di runtime

Bagian ini hanya menjaga keterlacakan keputusan; item berikut **bukan pekerjaan roadmap baru**:

- **RFC-0013** — Accepted: compatibility cost sharing/contribution domain dipertahankan secara terbatas sesuai product decision current.
- **RFC-0016** — Accepted: permission partner planning shared + own-personal sudah menjadi runtime contract.
- **RFC-0017** — Accepted and implemented: manual reminder actor-scoped tersedia.
- **RFC-0018** — Accepted and implemented: session/device registry dan revoke lifecycle tersedia.
- **RFC-0015** — Rejected: granular personal privacy tidak masuk runtime selama positioning tetap full transparency keluarga.

## Bukan roadmap aktif

- Full-transparency keluarga adalah keputusan produk current; granular personal privacy yang ditolak tidak diperlakukan sebagai pekerjaan tertunda.
- Compatibility data lama dipertahankan sesuai schema/recovery contract, tetapi tidak otomatis menjadi flow UI yang perlu dikembangkan kembali.
- Fitur yang sudah Implemented dan hanya membutuhkan evidence release dicatat sebagai verification di bagian **Now**, bukan sebagai proyek implementasi baru.

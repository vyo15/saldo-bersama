# Roadmap

Roadmap menunjukkan urutan, bukan janji tanggal. Status detail berada di `../IMPLEMENTATION_MATRIX.md`.

## Completed / active source

- Ledger rekening, transaksi, transfer netral, soft cancel, audit, idempotency, dan conflict.
- Alokasi Dana lintas periode termasuk add/release dana tersedia ke Alokasi Dana existing, Jadwal Rutin, Target, Kebutuhan, rekonsiliasi, dan laporan bulanan.
- Filter transaksi berdasarkan rekening, kategori, dan pencatat.
- Tren 3/6/12 bulan, breakdown rekening/nature/pencatat, target projection, dashboard alerts; pembagian beban schema v11 hanya dipertahankan untuk compatibility histori/API lama.
- Push actionable untuk Jadwal Rutin, Kebutuhan, Alokasi Dana, Target, dan transaksi belum dialokasikan.
- Pengingat manual one-shot actor-scoped untuk Jadwal Rutin, Kebutuhan, Alokasi Dana, dan Target melalui scheduler/Web Push existing (RFC-0017).
- Partner planning shared + own-personal untuk Alokasi/Kebutuhan/Jadwal Rutin dengan guard backend RFC-0016; Target baru tetap shared; destructive lifecycle tetap Administrator-only.
- Compatibility pembagian beban biaya schema v11 tetap dipertahankan untuk histori/backup/API lama, tetapi UI canonical transaksi baru tidak lagi menawarkan split karena pengeluaran diperlakukan sebagai pengeluaran keluarga.
- Registry session per perangkat, revoke own/all, PKCE S256, dan session lifecycle server-side (RFC-0018, schema v12).
- Investment manual schema v17 **asset-centric**: saham/reksa dana ditampilkan langsung tanpa hierarchy broker/RDN/portfolio; posisi baru dibuat lewat `investments.assets.create`; compatibility portfolio/rekening internal tetap dipertahankan untuk FK/histori lama tetapi rekening baru disembunyikan dari surface rekening. Direct opening position dan Buy/Sell v17 memakai `cash_effect_enabled=0`, sehingga pencatatan aset tidak mensyaratkan atau mengubah saldo RDN. Weighted cost basis, valuation/P&L, reconciliation/correction legacy, Dashboard `market_value`, backup/restore, dan integrity guard tetap authoritative tanpa credential broker/live market API.
- Governance, handoff, build/archive guard, Turso, PWA, dan Google bridge.
- Full transparency keluarga menjadi policy produk canonical; RFC-0015 granular personal privacy berstatus Rejected dan tidak masuk roadmap runtime.

## Now — verification dan operasi

- Jalankan full `npm run verify` pada runtime Node yang didukung setelah patch. Perubahan UI tetap memerlukan pemeriksaan manual pada viewport/perangkat relevan.
- Verifikasi operasional rotasi `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` yang pernah ikut ZIP manual mengikuti `SECRET_ROTATION_RUNBOOK.md`; source tidak dapat membuktikan credential lama sudah direvoke.
- Migration parity Turso v17 dan real-resource backup/restore drill, termasuk direct asset → multi-buy → partial sell → valuation → restore parity serta verifikasi histori v15/v16 tetap mempertahankan cash effect.
- Aktifkan branch protection/ruleset GitHub dan jadikan workflow **Quality** sebagai required check; source workflow/CONTRIBUTING sudah disiapkan, enforcement tetap setting GitHub. Direct push ke `main` yang masih diterima berarti langkah ini belum selesai.
- Pisahkan database/token/session secret Development dan Production sesuai exit plan ADR-0007 sebelum data finansial nyata menjadi dependency operasional.
- Verifikasi Google bridge, Calendar, Web Push, dan notification cadence pada resource nyata.

## Next — RFC sebelum schema/authorization berubah

- RFC-0011: lifecycle transaksi, participant role eksplisit (`payer`/`beneficiary`/`liable_party`), draft/rencana, dan receipt privat.
- RFC-0012: utang/piutang sebagai obligation + settlement ledger.
- RFC-0014: kategori bertingkat dan tahapan target.
- RFC-0019: satu cash movement dengan beberapa line item kategori/Kebutuhan tanpa double-count saldo/report.
- Follow-up RFC-0013 dipersempit ke relasi refund → expense asli dan compatibility histori cost-share. Payer/beneficiary/actual contribution tidak diprioritaskan selama model produk tetap satu keuangan keluarga.

## Later — maturity

- Kalender internal lintas event finansial.
- Alerting eksternal, client error reporting, dan retensi observability.
- Axe penuh, authenticated E2E, visual regression, dan performance SLO.
- Enkripsi backup aplikasi dengan key lifecycle yang disetujui.
- Contract schema machine-readable per action.
- Disaster-recovery drill berkala.

- Candidate product gap: reminder konsistensi pencatatan actor-scoped dengan cadence configurable/opt-in; belum ada runtime alert type dan tidak boleh hardcode inactivity global.

# Roadmap

Roadmap menunjukkan urutan, bukan janji tanggal. Status detail berada di `../IMPLEMENTATION_MATRIX.md`.

## Completed / active source

- Ledger rekening, transaksi, transfer netral, soft cancel, audit, idempotency, dan conflict.
- Kantong lintas periode, recurring/tagihan, target, budget, rekonsiliasi, laporan bulanan.
- Filter transaksi berdasarkan rekening, kategori, dan pencatat.
- Tren 3/6/12 bulan, breakdown rekening/nature/pencatat, target projection, dashboard alerts.
- Push actionable untuk recurring, budget, kantong, target, dan transaksi belum dialokasikan.
- Governance, handoff, build/archive guard, Turso, PWA, dan Google bridge.

## Now — verification dan operasi

- Jalankan full Node 24 `npm run verify` setelah patch. Perubahan UI tetap memerlukan pemeriksaan manual pada viewport/perangkat relevan.
- Verifikasi operasional rotasi `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` yang pernah ikut ZIP manual mengikuti `SECRET_ROTATION_RUNBOOK.md`; source tidak dapat membuktikan credential lama sudah direvoke.
- Migration parity Turso dan real-resource backup/restore drill.
- Aktifkan branch protection/ruleset GitHub dan jadikan workflow **Quality** sebagai required check; source workflow/CONTRIBUTING sudah disiapkan, enforcement tetap setting GitHub.
- Verifikasi Google bridge, Calendar, Web Push, dan notification cadence pada resource nyata.

## Next — RFC sebelum schema/authorization berubah

- RFC-0011: lifecycle transaksi, `used_by`, draft/rencana, dan receipt privat.
- RFC-0012: utang/piutang sebagai obligation + settlement ledger.
- RFC-0013: kontribusi pasangan dan cost sharing.
- RFC-0014: kategori bertingkat dan tahapan target.
- RFC-0015: privasi rekening granular dengan backend projection.
- RFC-0016: perluasan hak member menjadi partner planning.

## Later — maturity

- Kalender internal lintas event finansial.
- Alerting eksternal, client error reporting, dan retensi observability.
- Axe penuh, authenticated E2E, visual regression, dan performance SLO.
- Enkripsi backup aplikasi dengan key lifecycle yang disetujui.
- Contract schema machine-readable per action.
- Disaster-recovery drill berkala.

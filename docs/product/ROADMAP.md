# Roadmap

Roadmap menunjukkan urutan, bukan janji tanggal. Status detail berada di `../IMPLEMENTATION_MATRIX.md`.

## Completed / active source

- Ledger rekening, transaksi, transfer netral, soft cancel, audit, idempotency, dan conflict.
- Alokasi Dana lintas periode termasuk add/release dana tersedia ke Alokasi Dana existing, Jadwal Rutin, Target, Kebutuhan, rekonsiliasi, dan laporan bulanan.
- Filter transaksi berdasarkan rekening, kategori, dan pencatat.
- Tren 3/6/12 bulan, breakdown rekening/nature/pencatat/pembagian beban biaya, target projection, dashboard alerts.
- Push actionable untuk Jadwal Rutin, Kebutuhan, Alokasi Dana, Target, dan transaksi belum dialokasikan.
- Pengingat manual one-shot actor-scoped untuk Jadwal Rutin, Kebutuhan, Alokasi Dana, dan Target melalui scheduler/Web Push existing (RFC-0017).
- Partner planning shared untuk Member dengan guard backend RFC-0016; destructive lifecycle tetap Administrator-only.
- Pembagian beban biaya expense shared `equal`/`percentage` melalui schema v11 sebagai MVP RFC-0013; payer/beneficiary/kontribusi aktual tetap deferred.
- Registry session per perangkat, revoke own/all, PKCE S256, dan session lifecycle server-side (RFC-0018, schema v12).
- Governance, handoff, build/archive guard, Turso, PWA, dan Google bridge.

## Now — verification dan operasi

- Jalankan full Node 24 `npm run verify` setelah patch. Perubahan UI tetap memerlukan pemeriksaan manual pada viewport/perangkat relevan.
- Verifikasi operasional rotasi `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` yang pernah ikut ZIP manual mengikuti `SECRET_ROTATION_RUNBOOK.md`; source tidak dapat membuktikan credential lama sudah direvoke.
- Migration parity Turso dan real-resource backup/restore drill.
- Aktifkan branch protection/ruleset GitHub dan jadikan workflow **Quality** sebagai required check; source workflow/CONTRIBUTING sudah disiapkan, enforcement tetap setting GitHub. Direct push ke `main` yang masih diterima berarti langkah ini belum selesai.
- Pisahkan database/token/session secret Development dan Production sesuai exit plan ADR-0007 sebelum data finansial nyata menjadi dependency operasional.
- Verifikasi Google bridge, Calendar, Web Push, dan notification cadence pada resource nyata.

## Next — RFC sebelum schema/authorization berubah

- RFC-0011: lifecycle transaksi, participant role eksplisit (`payer`/`beneficiary`/`liable_party`), draft/rencana, dan receipt privat.
- RFC-0012: utang/piutang sebagai obligation + settlement ledger.
- RFC-0014: kategori bertingkat dan tahapan target.
- RFC-0015: privasi rekening granular dengan backend projection.
- RFC-0019: satu cash movement dengan beberapa line item kategori/Kebutuhan tanpa double-count saldo/report.
- Follow-up RFC-0013: payer/beneficiary/actual contribution serta relasi refund ke expense asli sebelum refund boleh mengembalikan Alokasi Dana/Kebutuhan/cost split.

## Later — maturity

- Kalender internal lintas event finansial.
- Alerting eksternal, client error reporting, dan retensi observability.
- Axe penuh, authenticated E2E, visual regression, dan performance SLO.
- Enkripsi backup aplikasi dengan key lifecycle yang disetujui.
- Contract schema machine-readable per action.
- Disaster-recovery drill berkala.

- Candidate product gap: reminder konsistensi pencatatan actor-scoped dengan cadence configurable/opt-in; belum ada runtime alert type dan tidak boleh hardcode inactivity global.

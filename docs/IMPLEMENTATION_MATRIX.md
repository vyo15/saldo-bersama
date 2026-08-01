# Matriks implementasi

| Area | Status source | Gate operasional |
| --- | --- | --- |
| React/Vite shell dan responsive navigation | Implemented | Test browser/mobile manual |
| Google login + Firebase token + HttpOnly session | Implemented | Kredensial dan origin DEV/PROD |
| Allowlist/role deny-by-default | Implemented + test | Sinkronkan Vercel dan `Users` |
| Google Apps Script gateway/HMAC/replay guard | Implemented + test | Secret sama dan URL `/exec` |
| Schema Google Sheets v2 | Implemented | Setup baru atau migration v1→v2 |
| Personal/shared read/write isolation | Implemented + behavior test | E2E dua akun |
| Ledger income/expense/transfer/refund/adjustment | Implemented + unit/behavior test | Uji data DEV |
| Edit/cancel/row_version/idempotency | Implemented + test | Conflict/double-submit manual |
| Rekening/kategori create/edit/archive | Implemented | Uji lifecycle DEV |
| Envelope/budget/period close/reopen | Implemented + behavior test; dependency archived terdeteksi integrity | Uji rollover dan reopen latest-first DEV |
| Recurring pay/update/reverse | Implemented + real linked-transaction test | Uji partial/late/manual DEV |
| Goal move/reverse | Implemented + real linked-transaction test | Uji progress/saldo DEV |
| Dashboard/report monthly | Implemented + historical as-of test | Cocokkan angka dataset DEV |
| Calendar | Implemented; personal skipped | Set `CALENDAR_ID`, uji DEV |
| Web Push | Implemented opsional | Set VAPID/endpoint, uji browser |
| Backup/import/restore | Implemented + preview/rollback/fail-closed test | Restore drill nyata DEV wajib |
| Migration v1→v2 | Implemented + guarded | Preview, safety backup, drill DEV |
| Clean ZIP/source validator | Implemented | Gunakan `npm run zip` |
| Auto bootstrap Vercel Development env | Implemented + test | Login browser satu kali per perangkat |
| Read model/index + request metrics | Implemented + test; cancelled tetap terlihat di ledger | Benchmark Sheets DEV 1k/5k/10k row |
| Automated E2E browser/accessibility | Belum tersedia | Masih wajib test manual |
| Global distributed rate limit | Belum tersedia | Current rate limit best-effort |

## Release status

Source dapat masuk tahap setup/integration DEV. Production dengan data nyata tetap **NO-GO** sampai connector, schema/migration, personal isolation dua akun, backup/restore drill, lint/test/build, dan checklist QA selesai diverifikasi pada resource nyata.

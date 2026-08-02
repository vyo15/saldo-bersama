# Changelog

Format mengikuti prinsip Keep a Changelog dan commit yang konsisten. Versi production harus menunjuk commit SHA yang sudah diuji.

## [Unreleased]

### Added

- Governance foundation untuk kolaborasi tim dan handoff antar-ChatGPT.
- `AGENTS.md`, contribution/security policy, code ownership, PR/issue templates.
- Project status, handoff protocol, product glossary, API/authorization/data contracts.
- ADR/RFC workflow, release/rollback, incident, operations, dan observability catalog.
- Drift tests untuk required reading, local Markdown reference, index coverage, schema overview/data dictionary, environment classification, dan Git workflow cross-reference.
- Command `env:clean` dan `env:push:production` untuk environment lokal/Production yang canonical dan aman di Windows.

### Changed

- Kebijakan environment diselaraskan: Vercel hanya memakai Production, runtime lokal memakai `.env.local`, dan bootstrap Vercel Development dihapus.
- Environment diklasifikasikan sebagai 8 key core wajib + 1 key logging opsional; seluruh script memakai daftar canonical yang sama.
- README dan Git workflow diarahkan ke onboarding serta handoff canonical; `CONTRIBUTING.md` dan `GIT_WORKFLOW.md` kini memiliki scope terpisah dan saling merujuk.
- Dokumentasi one-time cutover di-rename menjadi `LEGACY_SHEETS_TO_TURSO_CUTOVER.md`; policy schema jangka panjang tetap terpisah.
- `TURSO_SCHEMA.md` sekarang mencatat `request_nonces` sebagai guard anti-replay persisten.
- Implementation matrix membedakan implementasi source dari konfigurasi dan verifikasi resource nyata.
- Source validator menerima hanya root governance files yang disetujui.
- Navigasi bawah mobile dan desktop module dock ditempatkan terhadap viewport, dengan safe area dan ruang scroll yang sesuai.
- Turso HTTP transaction routing menggunakan `base_url` pipeline apa adanya dan menserialkan operasi dalam baton yang sama.
- Service worker menghindari clone response setelah body digunakan; API finansial tetap tidak dicache.
- Browser Fullscreen API tidak ditambahkan; PWA tetap menggunakan mode `standalone`.

# Changelog

Format mengikuti prinsip Keep a Changelog dan commit yang konsisten. Versi production harus menunjuk commit SHA yang sudah diuji.

## [Unreleased]

### Added

- Artifact policy terpusat, safe generated cleanup, explicit dependency cleanup, archive size guard, build budget, dan Chromium/CDP browser smoke.
- Domain service folders untuk planning, reporting, maintenance, action registry/policy, frontend API facade per feature, serta test folders berdasarkan domain.
- Document lifecycle policy dan regression guard untuk dead global CSS serta direct API transport usage.
- Bootstrap first-run `npm run dev` untuk dependency otomatis, Vercel login/link, Development env pull terjaga, sanitasi, validasi, dan atomic `.env.local` replacement.
- Command `env:push:development` dan ADR-0010 untuk seed environment komputer baru tanpa input key satu per satu.
- Governance foundation untuk kolaborasi tim dan handoff antar-ChatGPT.
- `AGENTS.md`, contribution/security policy, code ownership, PR/issue templates.
- Project status, handoff protocol, product glossary, API/authorization/data contracts.
- ADR/RFC workflow, release/rollback, incident, operations, dan observability catalog.
- Drift tests untuk required reading, local Markdown reference, index coverage, schema overview/data dictionary, environment classification, dan Git workflow cross-reference.
- Command `env:clean` dan `env:push:production` untuk environment lokal/Production yang canonical dan aman di Windows.
- UI design-system contract, ADR-0009, dan CSS Modules untuk Button, Card, Modal, ThemeToggle, StatusBadge, ProgressBar, serta MoneyInput.

### Changed

- Browser smoke kini mendeteksi Google Chrome, Microsoft Edge, Brave, dan Chromium lintas platform; kegagalan startup menutup server test tanpa proses menggantung.
- Packager staging menormalisasi line ending tanpa warning CRLF/LF yang memenuhi output.
- Dashboard dipecah menjadi orchestration page dan komponen mobile/desktop tanpa mengubah data flow.
- Test backend dipindahkan dari `test/api` ke folder business/database/security/maintenance/integration/tooling/governance/migration/performance.
- Global CSS orphan yang tidak memiliki pemilik runtime dihapus.
- `npm run check` sekarang juga menegakkan build budget.
- Kebijakan environment kini memakai Vercel Development sebagai source bootstrap lokal tepercaya, Production sebagai runtime deployment, dan Preview tetap kosong.
- Runner Vercel memakai `npx --yes` agar first-run tidak berhenti pada prompt instalasi CLI.
- Shared UI primitive memakai token control/motion/shadow yang konsisten; modal mobile menjadi bottom sheet aksesibel dan progress memakai elemen HTML `progress`.
- Mantine ditetapkan sebagai toolkit target melalui wrapper; dependency dan lockfile sudah tersedia, tanpa Tailwind atau direct feature import.
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

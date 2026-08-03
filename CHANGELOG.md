# Changelog

Format mengikuti prinsip Keep a Changelog dan commit yang konsisten. Versi production harus menunjuk commit SHA yang sudah diuji.

## [Unreleased]

- Mengubah halaman Rekening menjadi daftar ringkas dengan panel detail terpilih, detail overlay pada mobile, dan ukuran kartu konsisten 1.586:1 untuk BCA/BNI/BTN/Mandiri/Permata.
- Menambahkan migration schema v4 untuk `accounts.account_number`, validasi backend 6–34 digit, form create/edit, preview langsung, clipboard detail, audit bertopeng, serta kompatibilitas restore backup v3.
- Menormalisasi asset Mandiri menjadi kanvas 768×484 agar tidak berbeda proporsi dari empat template bank lain; Sheets mirror dan export baca tetap tidak membawa nomor rekening.
- Mengintegrasikan base asset baru BNI, BCA, BTN, dan Permata pada kartu rekening, mempertahankan logo di kanan serta chip di dalam gambar, menghapus overlay wordmark/chip yang duplikatif, dan menjaga saldo tetap di panel ringkasan.
- Mendesain ulang halaman Rekening menjadi list-first dengan kartu finansial responsif BCA/BNI/BTN/Mandiri/Permata, fallback non-bank, satu dialog tambah Rekening/Kategori, owner action mobile, category listing untuk member, serta refresh dashboard setelah rekonsiliasi.
- Memperbaiki browser parity follow-up: selector privacy desktop kini mengikuti class runtime `.dashboard-desktop`, `useApiResource` tidak lagi merender konten semu pada status awal `idle`, dan route journey menolak loading screen serta memverifikasi heading stabil dua kali.
- Memperbaiki race pada authenticated Chromium route journey: helper kini menunggu dokumen selesai dan heading route yang tepat, sehingga DOM route sebelumnya atau loading state tidak lagi menghasilkan kegagalan palsu pada `/rekening`.
- Menyamakan capability dashboard desktop/mobile melalui shared view model, filter, transaction detail, alerts, account/category insights, daily safe spend, unallocated funds, dan privacy nominal tanpa menduplikasi business form.
- Memperbaiki gap logout pada viewport 821–940px serta menandai menu mobile `Lainnya` aktif untuk seluruh route sekunder.
- Menambahkan authenticated Chromium fixture owner/member, seluruh route parity journey, dan breakpoint regression 820/821/940/941.
- Mendokumentasikan kontrak capability parity: layout boleh berbeda, tetapi data, aksi, authorization, state, dan workflow wajib tersedia pada desktop serta mobile.

- Memperbaiki transport login/logout frontend agar menunggu `Response` dari `fetch` sebelum parsing, mencegah error minified `i.json is not a function` dan inkonsistensi status sesi.
- Menambahkan regression test kontrak request sesi, structured API error, serta guard source agar `Promise<Response>` tidak kembali diberikan langsung kepada `parseResponse`.
- Membersihkan import test financial insights yang tidak digunakan agar backend lint dan Quality gate kembali hijau.

- Menggabungkan patch product-control dengan hotfix browser-smoke CI tanpa menimpa perubahan salah satu patch.
- Browser smoke GitHub Actions memblokir script Google Identity Services eksternal sebelum navigasi dan memakai mock lokal deterministik agar CI tidak bergantung pada jaringan/provider.
- Workflow Quality membangun fixture browser smoke dengan public dummy `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY`; nilai hanya untuk CI dan bukan secret.

- Menjadikan 17 area kebutuhan sistem pengendali uang bersama sebagai requirement canonical dan implementation traceability.
- Menambahkan filter transaksi server-side/UI berdasarkan rekening, kategori, dan pencatat dengan option yang scope-filtered.
- Menambahkan tren laporan 3/6/12 bulan, total saldo bulanan, breakdown rekening/nature/pencatat, target projection, serta dashboard/report alerts.
- Memperluas scheduled notification queue untuk budget, kantong, target, dan transaksi belum dialokasikan secara idempotent.
- Menambahkan RFC Proposed untuk transaction lifecycle/receipt, debt, contribution split, category hierarchy/goal stages, granular privacy, dan partner planning permissions tanpa mengubah schema v3.
- Memperbaiki bootstrap/sinkronisasi Vercel Development agar `VERCEL_OIDC_TOKEN` dibersihkan otomatis pada jalur sukses/gagal dan `env:push:development` idempotent.
- Menegakkan traceability seluruh `REQ-*` ke implementation matrix serta keberadaan enam RFC schema/authorization Proposed melalui governance test.

- Hotfix backend memulihkan import dependency yang tertinggal setelah pemecahan service reporting, planning, dan maintenance.
- Backend lint kini menolak identifier tidak terdefinisi dan import/variabel tidak terpakai sebelum deployment.
- Regression test authenticated menjalankan initial state, budget, recurring, import, restore, dan integrity recovery pada SQLite in-memory.
- Callback `publicRow` pada list kategori, rekonsiliasi, dan push subscription dibuat eksplisit agar index `Array.map` tidak salah dianggap sebagai daftar field boolean.
- Import apply sekarang mengizinkan hanya field internal hasil normalisasi preview server, bukan field internal dari input client.
- Browser smoke CI sekarang menutup seluruh process tree Chromium dan koneksi CDP secara deterministik, memakai timeout workflow, serta tidak lagi menahan GitHub Actions setelah assertion selesai.
- GitHub Actions resmi diperbarui ke `actions/checkout@v5` dan `actions/setup-node@v5` agar memakai runtime Node 24.

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

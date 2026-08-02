# Project Handoff

## Current task — Browser parity stability follow-up

**Source:** `saldo-bersama-clean(95).zip`  
**Scope:** browser test reliability and initial resource loading state only.

### Evidence from Node 24

- `npm ci`: PASS, 0 vulnerability.
- `npm run check`: PASS.
- frontend: 49/49.
- backend/governance: 104/104.
- build and build budget: PASS.
- browser: 5/7; failures were privacy selector desktop and transient `/laporan` heading.

### Root cause and patch

1. Browser assertion referenced nonexistent `.desktop-finance-dashboard`; runtime component uses `.dashboard-desktop`.
2. `useApiResource` exposed `idle` on its first enabled render. Reports and several list pages only gate `loading`, allowing a transient content frame before the request effect starts.
3. Route readiness now rejects `main.loading-screen`, waits the canonical heading, pauses briefly, and verifies the same state again.

### Files changed

```text
frontend/src/hooks/useApiResource.js
frontend/test/api-client.test.js
test/browser/authenticated-app.test.mjs
test/browser/helpers/app-runtime.mjs
CHANGELOG.md
docs/PROJECT_STATUS.md
docs/PROJECT_HANDOFF.md
docs/TEST_PLAN.md
```

### Guarded areas

No schema, migration, balance, transfer, auth, role, API contract, environment, backup, restore, or dependency changes.

### Next verification

Run on Node 24:

```bash
npm ci
npm run check
npm run test:browser
npm run zip
```

Expected browser result: `7 pass, 0 fail`.

---

**Updated:** 2026-08-02  
**Task:** Desktop/mobile capability parity — browser route-readiness hotfix  
**Status:** Quality gate lokal lulus; authenticated browser journey menemukan race test `/rekening` dan hotfix sudah diterapkan. Browser journey perlu diulang pada Node 24.

## Source yang divalidasi

- Arsip: `saldo-bersama-clean(93).zip`
- Root: `saldo-bersama/`
- Stack terkait: React 19, React Router, Vite PWA, CSS Modules, Turso schema v3.
- Path utama yang diperiksa: `AppShell`, konfigurasi/navigation desktop-mobile, Dashboard orchestration/presentations, responsive/page CSS, frontend static tests, browser CDP helpers, workflow Quality, UI/test/status docs.

## Implementasi

1. Menutup gap logout viewport 821–940px; header logout tetap terlihat sampai bottom navigation aktif pada 820px.
2. Menu mobile `Lainnya` mengenali route sekunder, menampilkan state aktif, dan membawa `aria-current="page"`.
3. Dashboard memakai satu shared view model untuk account/category lookup, filtering, transaction selection, insight, envelope, dan sync metadata.
4. Mobile mendapat capability yang sebelumnya hanya tersedia di desktop: batas aman harian, dana belum dialokasikan, rincian rekening/kategori, semua alert melalui progressive disclosure, filter rekening/kategori/jenis/search, serta detail transaksi bottom sheet.
5. Desktop mendapat privacy toggle nominal; filter jenis transaksi tidak lagi disembunyikan pada compact desktop.
6. Business form tetap satu `TransactionForm`; tidak ada handler/API/write path khusus mobile.
7. Browser fixture authenticated owner/member dan breakpoint 820/821/940/941 ditambahkan untuk seluruh route tanpa memakai service eksternal.

## Temuan dari verifikasi Node 24

Perintah pengguna menghasilkan:

```text
npm ci: PASS — 0 vulnerability
npm run check: PASS
frontend test: 49/49
backend/governance test: 104/104
production build: PASS
build budget: PASS — main JS 94.844 B gzip; global CSS 15.669 B gzip
npm run test:browser: 5/7 PASS
```

Dua kegagalan owner/member sama-sama berhenti pada heading `/rekening`. Source `AccountsPage.jsx` sudah memiliki `PageHeader` canonical `Rekening & kategori`; root cause berada pada helper test yang menganggap route siap hanya berdasarkan pathname dan keberadaan heading apa pun. Saat full navigation, pathname baru dapat terlihat sementara DOM lama atau loading state masih aktif.

Hotfix:

1. `waitForAppRoute` menunggu dokumen selesai.
2. Bila heading expected diberikan, helper menunggu heading tersebut secara tepat.
3. Seluruh authenticated route assertion mengirim heading canonical masing-masing.
4. Runtime aplikasi tidak diubah.

## File utama berubah

```text
frontend/src/config/navigation.js
frontend/src/components/navigation/MobileNavigation.jsx
frontend/src/features/dashboard/DashboardPage.jsx
frontend/src/features/dashboard/components/DesktopFinanceDashboard.jsx
frontend/src/features/dashboard/components/MobileFinanceDashboard.jsx
frontend/src/features/dashboard/components/MobileDashboardFilters.jsx
frontend/src/features/dashboard/components/MobileTransactionDetail.jsx
frontend/src/styles/pages.css
frontend/src/styles/responsive.css
frontend/test/navigation-layout.test.js
frontend/test/financial-insights.test.js
frontend/test/ui-foundation.test.js
test/browser/helpers/app-runtime.mjs
test/browser/helpers/authenticated-fixture.mjs
test/browser/authenticated-app.test.mjs
docs/UI_DESIGN_SYSTEM.md
docs/IMPLEMENTATION_MATRIX.md
docs/TEST_PLAN.md
docs/PROJECT_STATUS.md
docs/PROJECT_HANDOFF.md
CHANGELOG.md
```

## Guarded area

Tidak ada perubahan pada schema/migration Turso, saldo, transfer, soft cancel, idempotency, row version, Firebase Auth, role/authorization, API action/contract, environment, backup/restore, dependency, atau deployment.

## Test yang dijalankan

Bukti aktual dari komputer project Node 24 sebelum hotfix browser:

```text
npm ci: PASS — 183 package; 0 vulnerability
npm run validate:source: PASS — 296 file
npm run lint: PASS
frontend test: PASS — 49/49
backend/database/governance test: PASS — 104/104
Total unit/backend: PASS — 153/153
npm run build: PASS — 181 module
npm run build:budget: PASS
npm run test:browser: 5/7 PASS — dua false failure heading `/rekening`
npm run zip: PASS — 296 file canonical
```

Setelah hotfix, syntax/source checks dapat dijalankan pada patch, tetapi hasil browser final harus dibuktikan ulang melalui `npm run test:browser` pada Node 24.

## Risiko dan verifikasi lanjutan

- Jalankan `npm ci && npm run check && npm run test:browser` pada Node 24 di komputer project.
- Lakukan smoke nyata owner/member pada iPhone PWA, Android/Chrome, tablet 820/821/940/941, dan desktop.
- Browser fixture membuktikan route/capability source, bukan integrasi resource Production.
- axe penuh, Firefox/Safari automation, dan visual regression masih belum menjadi dependency project.

## Next safe step

1. Verifikasi full quality gate Node 24 dan browser journey.
2. Deploy preview/Production hanya setelah hasil hijau.
3. Uji seluruh route owner/member pada perangkat nyata dan periksa keyboard, focus, safe area, modal/bottom sheet, serta logout.
4. Lanjutkan RFC fitur schema hanya setelah approval terpisah; parity patch ini tidak memberi izin perubahan guarded.

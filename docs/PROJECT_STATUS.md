# Project Status

**Last source verification:** 2026-08-02
**Repository:** `vyo15/saldo-bersama`
**Source baseline:** hasil merge `saldo-bersama-clean(89).zip` + patch product-control + patch CI browser public environment
**Schema:** version 3, migration `database/migrations/001_initial_schema.sql`
**Runtime baseline:** Node 24.x, npm 10+

Dokumen ini adalah snapshot. Source dan test aktual tetap menjadi bukti implementasi utama.

## Arsitektur aktif

- React 19, React Router, dan Vite PWA.
- Shared UI primitive memakai CSS Modules serta design tokens; feature dilarang direct import toolkit.
- Firebase Google Authentication dan signed HttpOnly session.
- Lima Vercel Functions canonical: session, gateway, export, health, jobs.
- Turso/libSQL sebagai satu-satunya source of truth finansial.
- Apps Script hanya integration bridge bertanda tangan untuk Sheets mirror, Calendar, Drive backup, dan scheduler.
- Google Sheets hanya mirror data `shared`; data personal tidak dikirim ke spreadsheet bersama.
- Web Push diproses melalui queue backend.

## Struktur dan quality guard

- Backend planning, reporting, dan maintenance telah dipisah per domain dengan facade kompatibel.
- Metadata read/write, maintenance allowance, external side effect, dan kebutuhan idempotency berada di `api/_lib/actions/policy.js`; handler canonical berada di `api/_lib/actions/registry.js`.
- Frontend API transport, cache, error, dan facade feature telah dipisah; page/form tidak melakukan direct write melalui transport global.
- Dashboard dipisah menjadi orchestration page dan komponen desktop/mobile.
- Test backend dikelompokkan berdasarkan business, database, security, maintenance, integration, tooling, governance, migration, dan performance.
- Artifact policy, safe cleanup, clean ZIP verification, serta build budget tersedia.
- Browser smoke berbasis Chromium/CDP tersedia untuk redirect login, viewport mobile, overflow, target sentuh, landmark, accessible name, dan accessibility tree tanpa dependency browser-test tambahan.
- Integrasi axe penuh dan visual-regression baseline masih belum tersedia karena dependency tersebut belum menjadi bagian lockfile.


## CI browser-smoke hardening 2026-08-02

- Workflow Quality menyediakan public dummy `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY` hanya saat build/check CI.
- Browser smoke memblokir Google Identity Services eksternal dan memakai mock lokal deterministik, sehingga tidak menunggu jaringan/provider.
- Governance test menjaga fixture public CI tetap tersedia dan tidak mengubah environment Production.

## Product-control alignment 2026-08-02

- Dokumen kebutuhan 17 area kini menjadi requirement canonical dengan status Implemented/Partial/Planned.
- `transactions.list` mendukung filter rekening, kategori, dan pencatat serta mengembalikan filter option yang sudah scope-filtered.
- `reports.monthly` menambah tren 3/6/12 bulan, total saldo lintas bulan, breakdown rekening, category nature, dan aktivitas pencatatan.
- Dashboard/laporan menampilkan alert budget, kantong, recurring, target, transaksi belum dialokasikan, serta rekonsiliasi.
- Goal read model menambah sisa target, proyeksi pace, dan kebutuhan setoran bulanan tanpa menyimpan angka turunan.
- Scheduled notification queue menambah budget/kantong threshold, goal behind, dan unallocated expense dengan dedupe key.
- Fitur yang memerlukan schema/authorization baru tidak dipaksakan; enam RFC Proposed mencakup transaction lifecycle/receipt, debt, contribution, hierarchy/stages, privacy, dan partner permission.
- Bootstrap dan sinkronisasi Vercel Development kini membersihkan `VERCEL_OIDC_TOKEN` secara otomatis sebelum memakai env dan setelah `vercel link`, termasuk jalur gagal; `env:push:development` dapat dijalankan ulang tanpa `env:clean` manual.

## Hotfix runtime backend 2026-08-02

- Refactor service sebelumnya meninggalkan import dependency pada reporting, budget, recurring, import, restore, dan integrity recovery. Import tersebut sudah dipulihkan tanpa mengubah schema atau kontrak API.
- `app.initialState` sekarang diuji melalui dispatcher authenticated dan database SQLite in-memory, sehingga error `GATEWAY_ERROR` akibat `ReferenceError` tidak dapat lolos hanya dengan syntax check.
- Backend ESLint `no-undef` dan `no-unused-vars` menjadi bagian `npm run lint`.
- Import/restore/integrity regression test menjalankan jalur apply dan maintenance recovery dengan Google bridge stub lokal.

## Status implementasi dan aktivasi

- Auth, authorization, transaksi, saldo, transfer, idempotency, conflict, audit, planning, report, integration outbox, export XLSX, backup/restore guard, PWA, dan push tersedia pada source.
- Production migration tetap **pending real-data parity**.
- Backup/restore real-resource drill tetap wajib sebelum dinyatakan siap recovery production.
- Google bridge dan Web Push hanya aktif bila grup environment terkait lengkap dan telah diuji pada resource nyata.
- Branch protection, repository ruleset, GitHub Security features, serta Vercel dashboard settings harus diverifikasi di dashboard; source tidak dapat membuktikannya.
- Alerting eksternal dan retensi observability belum lengkap.

## Keputusan dan risiko aktif

1. Runtime lokal dan Vercel Production memakai satu database Turso sesuai keputusan pemilik. Jangan menjalankan data dummy atau operasi destruktif.
2. Vercel Development menjadi source bootstrap `.env.local` untuk komputer tepercaya; Production tetap runtime deployment dan Preview tetap kosong.
3. Environment canonical terdiri dari delapan key core wajib, satu logging opsional, serta grup integrasi opsional yang harus lengkap.
4. Rate limit runtime masih best-effort per instance.
5. Backup teknis terkompresi dan ber-checksum; enkripsi aplikasi belum menjadi baseline yang terbukti.
6. Mantine tetap staged dependency dan hanya boleh dipakai melalui wrapper shared.
7. ZIP manual penuh pernah memuat `.env.local`; `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` harus dirotasi sebelum deployment berikutnya.

## Validasi terakhir pada patch product-control

```text
Source validation: 291 file PASS
Frontend unit/static tests: 42/42 PASS
Backend/database/security/tooling/governance tests: 104/104 PASS
Total automated tests: 146/146 PASS
Node syntax: 88 file PASS
Apps Script syntax/boot: 6 file, 2 urutan load PASS
npm ci/lint/build pada sandbox: belum dapat dijalankan karena registry internal tidak menyediakan vite-7.3.6.tgz dan runtime sandbox Node 22.16.0; Node 24 check pada komputer project wajib
browser smoke: belum dijalankan pada sandbox karena build/dependency tidak tersedia
```

## Prioritas berikutnya

1. Jalankan `npm ci`, `npm run check`, dan `npm run test:browser` pada Node 24 setelah menerapkan patch.
2. Uji filter transaksi, tren laporan, dashboard alert, target projection, dan push queue pada dua akun nyata.
3. Rotasi secret yang pernah ikut ZIP manual dan sinkronkan Development/Production secara guarded.
4. Putuskan RFC-0016 sebelum mengubah hak planning member; RFC schema lain tetap Proposed.
5. Terapkan branch protection/ruleset dan required `Quality` check.
6. Jalankan migration parity serta backup/restore real-resource drill.
7. Lengkapi axe/visual regression dan observability eksternal melalui dependency/RFC yang disetujui.

## Cara melanjutkan

Baca `../AGENTS.md`, dokumen ini, `PROJECT_HANDOFF.md`, dan source/test aktual. Jangan memakai ringkasan chat sebagai source of truth ketika repository tersedia.

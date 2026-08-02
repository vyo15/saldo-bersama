# Project Status

**Last source verification:** 2026-08-02
**Repository:** `vyo15/saldo-bersama`
**Branch baseline:** hotfix source `saldo-bersama(8).zip` on `fix/ci-browser-smoke-cleanup`
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

## Validasi terakhir pada patch struktur

```text
npm run lint: PASS
frontend unit/static tests: 39/39 PASS
backend/database/security/tooling tests: 90/90 PASS
Node syntax: 85 file PASS
Apps Script syntax/boot: 6 file, 2 urutan load PASS
npm run build pada sandbox: belum dapat diulang karena registry sandbox tidak menyediakan vite/Rollup Linux; build Node 24 pada komputer project tetap wajib
browser smoke: source tersedia; jalankan setelah build dengan npm run test:browser
```

## Prioritas berikutnya

1. Terapkan patch pada repository, hapus path lama yang tercantum di manifest, lalu jalankan `npm ci` dan `npm run check` pada Node 24.
2. Jalankan `npm run test:browser` dengan Chrome, Edge, Brave, atau Chromium lokal.
3. Rotasi secret yang pernah ikut ZIP manual dan sinkronkan Development/Production secara guarded.
4. Terapkan branch protection/ruleset dan required `Quality` check.
5. Jalankan migration parity serta backup/restore real-resource drill.
6. Tambahkan axe/visual regression hanya melalui dependency + lockfile yang tervalidasi.
7. Lengkapi observability eksternal dan alerting melalui RFC/approval.

## Cara melanjutkan

Baca `../AGENTS.md`, dokumen ini, `PROJECT_HANDOFF.md`, dan source/test aktual. Jangan memakai ringkasan chat sebagai source of truth ketika repository tersedia.

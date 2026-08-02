# Project Handoff

**Updated:** 2026-08-02
**Task:** Project structure, artifact hygiene, and maintainability hardening
**Status:** Patch implemented and unit/static validation passed; final Node 24 build/browser smoke must run after applying the patch locally.

## Source yang divalidasi

- Arsip penuh: `saldo-bersama(6).zip`
- Root: `saldo-bersama/`
- Canonical boundaries: `frontend/`, `api/`, `database/`, `apps-script/`, `scripts/`, `test/`, `docs/`.
- Source runtime reachability diperiksa; tidak ada source frontend/API canonical atau asset yang dihapus secara spekulatif.

## Perubahan utama

1. Artifact policy tunggal, cleanup generated yang fail closed, cleanup dependency eksplisit, archive size guard, dan test ZIP bersih.
2. Backend `planning`, `reporting`, dan `maintenance` dipecah per domain dengan facade kompatibel.
3. Action handler/operational metadata menjadi registry/policy canonical tanpa mengubah permission map authorization.
4. Frontend API dipecah menjadi transport, cache, error, client facade, dan facade per feature.
5. Dashboard menjadi orchestration page kecil dengan komponen mobile/desktop dan presentation helper bersama.
6. Selector CSS global yang tidak memiliki pemilik runtime dihapus dan dijaga regression test.
7. Test backend dipindahkan dari folder generik `test/api` ke domain test yang tepat.
8. Build budget, browser smoke Chromium/CDP, docs lifecycle, CODEOWNERS, CI, dan PR checklist diperbarui.

## Guarded area

Tidak ada perubahan pada:

- schema/migration Turso;
- action name atau request/response contract;
- Firebase auth, allowlist, role, ownership, atau authorization;
- perhitungan saldo, transfer, soft cancel, audit, idempotency, dan row version;
- backup/restore/import semantics;
- Apps Script endpoint, HMAC, resource ID, environment value, atau deployment production.

## Validasi yang sudah dijalankan

```text
npm run lint: PASS
frontend tests: 39/39 PASS
backend/database/security/tooling tests: 90/90 PASS
Node syntax: 85 file PASS
Apps Script syntax/boot: 6 file, 2 urutan load PASS
artifact clean/archive tests: PASS
```

Sandbox memakai Node 22.16.0 dan registry internal tidak menyediakan `vite-7.3.6.tgz`, Rollup Linux, Playwright, atau axe packages. Karena itu production build terbaru dan browser smoke belum dapat dijalankan ulang di sandbox. Komputer project sebelumnya membuktikan build baseline pada Node 24; patch final tetap wajib menjalankan command di bawah setelah diterapkan.

## Apply dan validasi lokal

```bash
npm ci
npm run check
npm run test:browser
npm run clean:dry-run
npm run clean
npm run zip
```

Pada Windows, browser smoke mencari Google Chrome, Microsoft Edge, dan Brave secara otomatis. Bila browser Chromium berada di lokasi khusus:

```bash
CHROMIUM_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npm run test:browser
```

## Delete/move yang harus tercermin di Git

Folder lama `test/api/` telah diganti oleh folder test berbasis domain. Saat patch changed-files-only diterapkan manual, hapus folder lama dengan command yang disediakan pada laporan patch. Jangan menghapus source lain, `.git`, `.vercel`, atau `.env.local`.

## Risiko dan tindak lanjut

- Rotasi `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` karena ZIP manual pernah memuat `.env.local`.
- Full axe scan dan visual regression belum ditambahkan karena dependency tidak tersedia/terverifikasi dalam lockfile saat patch dibuat.
- Real-resource Google integration, push, migration parity, dan restore drill tetap harus dilakukan terpisah.

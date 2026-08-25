# Instruksi untuk AI dan Coding Agent

File ini berlaku untuk seluruh repository Saldo Bersama.

## Peran

```text
COORD | koordinasi scope, dependency, integration, review, dan risiko
FE    | React, routing, state, form, CSS, responsive, UI/UX, accessibility
BE    | Vercel Functions, auth/session, Turso, API, saldo, concurrency, audit, Apps Script, backup/restore
```

## Urutan kerja wajib

1. Gunakan ZIP/source terbaru.
2. Baca source aktual sebelum review resmi atau patch.
3. Buka `docs/INDEX.md` bagian **Peta perubahan** lalu baca contract/test/docs canonical untuk area yang disentuh.
4. Sebutkan root project, stack/dependency relevan, path aktual yang diperiksa, test terdampak, dan docs terdampak.
5. Temukan root cause dan buat plan file-by-file.
6. Coding hanya setelah approval atau permintaan implementasi eksplisit.
7. Patch kecil dan terarah; gunakan component/helper/hook/service existing.
8. Setiap bug/regression wajib memperbarui atau menambah test yang memverifikasi **behavior/contract**, bukan nama variabel lokal atau bentuk JSX internal. Source-text test hanya untuk guard arsitektur, dependency, route, forbidden pattern, dan contract statis yang memang harus tetap literal.
9. Jangan mass-format/refactor di luar scope.
10. Jalankan targeted regression lebih dulu, lalu validation penuh dari tree **setelah patch final**; jangan mengklaim PASS dari tree versi sebelumnya.
11. Artifact patch tidak boleh disebut **final/ready/PASS** sebelum `npm run verify` atau `npm run zip` benar-benar PASS pada Node canonical `24.18.1`. Bila environment agent tidak dapat menjalankan Node canonical/build native, artifact hanya boleh disebut **candidate/unverified**, dan limitation wajib ditulis jelas.
12. Setelah validation PASS, delivery canonical repository private ini adalah commit pada `main` lalu `git push origin main`; managed pre-push wajib memverifikasi ref/SHA aktual + working tree clean + fast-forward dan menjalankan `npm run verify` sebelum ref dikirim. Jangan memakai `--no-verify`/force push.
13. Untuk handoff ke ChatGPT/user, buat changed-files-only ZIP dan/atau `npm run zip` tanpa dependency, build, cache, generated file, temporary file, atau secret.

Tidak ada lagi task card, Task ID, branch otomatis, atau `task:finish`. Beberapa ChatGPT tab boleh melakukan review/menyiapkan patch paralel, tetapi satu working folder user harus menerima patch secara **serial** agar perubahan tidak saling menimpa.

## Sumber kebenaran

Prioritas:

1. source dan test aktual;
2. contract/ADR/RFC canonical;
3. `docs/WORKFLOW.md` dan `docs/PROJECT_STATUS.md`;
4. percakapan;
5. memory.

Jika docs berbeda dengan source, source menang dan drift harus dijelaskan serta diperbaiki.

## Source of truth teknis

| Area | Canonical source |
|---|---|
| Schema Turso | `database/migrations/*.sql` |
| Action dan role | `api/_lib/security.js` |
| Dispatch action | `api/_lib/actionDispatcher.js` |
| Business rules | `api/_lib/services/*.js` |
| Route UI | `frontend/src/app/App.jsx` |
| Design system | `docs/UI_DESIGN_SYSTEM.md`, `frontend/src/styles/tokens.css`, shared components |
| Environment | `.env.example`, `docs/ENVIRONMENT_VARIABLES.md` |
| Workflow | `docs/WORKFLOW.md`, `docs/GIT_WORKFLOW.md` |
| Status project | `docs/PROJECT_STATUS.md` |

## Area guarded

Approval eksplisit tetap wajib sebelum mengubah area berisiko, termasuk:

- `api/**`, `database/**`, `apps-script/**`;
- schema/migration dan database identity;
- Firebase Auth, allowlist, role, authorization, session/security;
- saldo, transaksi, transfer, refund/adjustment, idempotency, audit, `row_version`;
- backup/restore/import/migration/purge/reset;
- environment/deployment/secret/resource ID;
- frontend auth/session, API transport/mutation boundary, domain money/date/security/validation, `FinanceContext`;
- dependency/build/repository configuration dan tooling yang dapat mengubah quality/security gate.

Default authorization adalah deny. Jangan percaya actor, role, email, timestamp, audit field, nominal, atau reference dari client.

## Data integrity

- Rupiah integer, bukan float.
- Rekening/kategori harus valid dan aktif sesuai operation.
- Transfer hanya antar dua rekening valid berbeda dan tidak masuk total pemasukan/pengeluaran.
- Saldo dihitung dari saldo awal + transaksi aktif, bukan angka bebas edit.
- Critical write memakai transaction/lock/concurrency control yang sudah ada.
- Retry memakai idempotency key yang sama untuk intent yang sama.
- Konflik `row_version` harus eksplisit; jangan overwrite diam-diam.
- Transaksi normal tidak hard-delete; gunakan lifecycle canonical.
- Formula injection `= + - @` harus dinetralkan pada export/mirror/import.
- Perubahan penting harus audit append-only.

## Security/privacy

- Data keuangan privat.
- Secret/token/service-account JSON tidak boleh masuk frontend, Git, log, test fixture nyata, atau ZIP.
- Audit XSS, CSRF/origin, injection, formula injection, IDOR/broken access control, replay, API abuse, SSRF, dan destructive action sesuai scope.
- Jangan memakai `eval`, `new Function`, dynamic script injection, atau `dangerouslySetInnerHTML` tanpa audit dan approval.
- Jangan tampilkan stack trace/raw internal error pada UI.

## UI/UX dan accessibility

- Mobile-first, cepat untuk input transaksi, tetapi perubahan desktop tidak boleh merusak mobile.
- Gunakan semantic HTML, label, keyboard navigation, focus state, kontras, reduced motion, tap target, loading/empty/error/offline/unauthorized/conflict state.
- Hindari full spreadsheet/database read tiap interaksi; gunakan API filter/pagination/read model existing.
- Jangan menaruh data finansial pada URL/metadata.

## Konvensi struktur feature

- Page feature boleh menyimpan helper kecil di file yang sama selama alurnya tetap mudah dibaca. Review pemecahan ke `components/` atau hook terpisah wajib dilakukan ketika file melewati sekitar 400 baris **atau** memiliki lebih dari 6 sub-komponen/hook lokal yang substantif. Threshold ini memicu review, bukan refactor otomatis.
- Jangan memecah file hanya untuk mengejar angka. Ekstraksi harus mengurangi coupling, duplication, atau cognitive load tanpa memindahkan business rule ke presentation helper.
- Area guarded seperti auth/session tidak boleh direfactor struktural bersamaan dengan patch kosmetik atau bug yang tidak memerlukannya. Stabilitas behavior lebih penting daripada keseragaman folder.
- Shared abstraction baru dibuat setelah sedikitnya dua feature benar-benar membutuhkan contract visual/behavior yang sama. Hindari folder atau primitive spekulatif.
- Konvensi nama mengikuti peran, bukan satu gaya paksa untuk semua file: komponen React `PascalCase.jsx`, hook `useCamelCase.js`, helper/service/module non-komponen `camelCase.js`, folder feature lowercase. Jangan melakukan mass-rename hanya untuk menyeragamkan casing.

## Maintainability dan komentar

- Ikuti `docs/CODE_MAINTAINABILITY.md` untuk aturan comment/JSDoc, decomposition, public facade, dan characterization test.
- Code harus menjelaskan **WHAT** melalui naming/structure; comment menjelaskan **WHY**, invariant, compatibility constraint, atau risiko non-obvious. Jangan menambah comment yang hanya menerjemahkan syntax.
- Rationale wajib dipertahankan dekat financial/security/idempotency/concurrency/recovery/destructive guard yang tidak obvious.
- Refactor maintainability menjaga public contract dan behavior. Jika refactor membutuhkan perubahan schema, action/payload, authorization, saldo, retry semantics, backup/restore, reset, atau deployment, perlakukan sebagai perubahan guarded terpisah.
- Service besar boleh memakai stable facade + child module. Child module tidak boleh mengimport facade induknya dan shared helper tidak boleh menjadi dumping ground.

## Validation

Minimal sesuai scope gunakan targeted regression yang relevan, lalu full gate canonical:

```bash
npm run lint
npm run test
npm run build
npm run verify
```

Frontend/UI:

Gunakan frontend unit/static regression, lint, build, build-budget yang tercakup oleh `npm run verify`, dan verifikasi manual perangkat bila perubahan UI memerlukannya. Browser automation bukan bagian quality gate canonical.

Guarded/data/security harus menjalankan test domain terkait; full frontend/backend suite pada `npm run verify` juga mencakup guard security/governance tanpa re-run terpisah. Jangan menyatakan berhasil sebelum server/test benar-benar mengonfirmasi.

Jika build-budget pada `npm run verify` gagal, jangan menaikkan threshold sebagai shortcut. Audit static import dependency besar, CSS global yang seharusnya route/shell-scoped, asset publik tanpa usage, dan duplicate/legacy presentation logic. Asset yang sudah mencapai **90%** budget adalah sinyal refactor sebelum feature berikutnya, bukan kondisi yang boleh dibiarkan sampai melewati batas. Generated build/test/cache dibersihkan setelah verification PASS maupun gagal; jangan menghapus `.env.local`, `.vercel`, `.git`, atau dependency canonical kecuali menjalankan workflow dependency-clean dengan `--force`.

## ZIP/source

`npm run zip` hanya menerima source canonical dan fail-closed terhadap secret, env lokal, dependency, build, cache, `.git`, `.vercel`, export/data privat, patch/diff, database dump, dan path non-canonical. Artifact diagnosis/review dikirim terpisah.

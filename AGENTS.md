# Instruksi untuk AI dan Coding Agent

File ini berlaku untuk seluruh repository Saldo Bersama.

## Peran

```text
COORD | koordinasi scope, dependency, integration, review, dan risiko
FE    | React, routing, state, form, CSS, responsive, UI/UX, accessibility, browser
BE    | Vercel Functions, auth/session, Turso, API, saldo, concurrency, audit, Apps Script, backup/restore
```

## Urutan kerja wajib

1. Gunakan ZIP/source terbaru.
2. Baca source aktual sebelum review resmi atau patch.
3. Sebutkan root project, stack/dependency relevan, dan path aktual yang diperiksa.
4. Temukan root cause dan buat plan file-by-file.
5. Coding hanya setelah approval atau permintaan implementasi eksplisit.
6. Patch kecil dan terarah; gunakan component/helper/hook/service existing.
7. Jangan mass-format/refactor di luar scope.
8. Jalankan validation yang benar-benar didukung stack; jangan mengklaim test yang tidak dijalankan.
9. Setelah validation PASS, gunakan branch + Pull Request: `git add -A`, `git commit`, `git push -u origin HEAD`, tunggu workflow **Quality** PASS, lalu merge ke `main` sesuai ruleset.
10. Untuk handoff ke ChatGPT/user, buat changed-files-only ZIP dan/atau `npm run zip` tanpa dependency, build, cache, generated file, temporary file, atau secret.

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

## Validation

Minimal sesuai scope:

```bash
npm run validate:source
npm run lint
npm run test
npm run build
npm run build:budget
```

Frontend/browser:

```bash
npm run test:browser
```

Guarded/data/security harus menjalankan test domain terkait dan `npm run test:guard` bila relevan. Jangan menyatakan berhasil sebelum server/test benar-benar mengonfirmasi.

## ZIP/source

`npm run zip` hanya menerima source canonical dan fail-closed terhadap secret, env lokal, dependency, build, cache, `.git`, `.vercel`, export/data privat, patch/diff, database dump, dan path non-canonical. Artifact diagnosis/review dikirim terpisah.

# Workflow Canonical

## Team

```text
COORD | koordinasi/review/integration
FE    | frontend/UI/UX/accessibility/responsive
BE    | backend/data/auth/security/integrations
```

## Alur kerja

```text
request
  -> validasi source terbaru
  -> baca docs/INDEX.md -> peta perubahan
  -> audit path/contract/test/docs terkait
  -> root cause
  -> plan file-by-file
  -> approval atau implementasi eksplisit
  -> patch kecil
  -> validation
  -> review diff
  -> commit pada branch
  -> push branch + Pull Request
  -> Quality PASS + review
  -> merge ke main
  -> clean ZIP bila diperlukan
```

### 1. Source validation

ZIP/source terbaru wajib menjadi dasar review. Abaikan `node_modules`, build/dist, cache, `.git`, generated output, temporary file, dan secret. Review resmi menyebut nama source, root, stack relevan, path aktual yang diperiksa, file penting yang tidak ditemukan, dan limitation.

### 2. Impact scan dan scope

Sebelum coding, petakan **source -> behavior/contract -> test -> docs** memakai `docs/INDEX.md`. Cari test yang sudah mengunci area tersebut agar refactor tidak meninggalkan assertion lama. Jangan mengarang path/schema/route/dependency. Gunakan helper/component/service existing. Jika implementasi membutuhkan area guarded yang belum disetujui, berhenti dan minta approval.

Untuk bug/regression, test harus membuktikan behavior yang rusak. Jangan memakai source-text regex untuk mengunci nama variabel lokal, urutan helper internal, atau bentuk JSX yang boleh berubah tanpa mengubah behavior. Static/source tests tetap tepat untuk route literal, dependency boundary, forbidden API, security invariant, dan contract arsitektur yang memang harus literal.

### 3. Parallel work

Beberapa chat/tab boleh melakukan audit atau menyiapkan patch paralel bila scope tidak overlap. Karena user bekerja dari satu folder fisik, **penerapan patch dilakukan serial**: patch A -> validate/commit/push -> patch B.

Tidak ada task registry atau branch automation. Branch dibuat manual per perubahan dan koordinasi scope dilakukan melalui plan serta diff source aktual.

### 4. Guarded changes

Approval eksplisit wajib untuk schema/migration, auth/allowlist/role, API contract, saldo/transfer/audit/idempotency, backup/restore/import/purge, env/secret/deployment, serta trust-boundary/security tooling. Guarded change tetap memakai branch/PR setelah approval; pengaman utama adalah review + test + required Quality + fail-closed runtime contract.

### 5. Validation

Urutan validation patch:

1. jalankan test regression/area yang terdampak;
2. jalankan lint/build relevan;
3. setelah seluruh edit dan docs final, jalankan full gate dari tree yang sama;
4. bila edit dilakukan lagi setelah PASS, PASS lama gugur dan gate relevan harus diulang.
5. handoff patch hanya boleh diberi status final bila full gate tree final PASS pada Node `24.18.1`; environment non-canonical hanya boleh menghasilkan candidate yang diberi label unverified.

Default full local gate setelah setiap patch:

```bash
npm run verify
```

`npm run verify` melakukan preflight Node 24 dan dependency yang sudah terpasang, lalu menjalankan source validation, lint/syntax, frontend regression, production build, build budget, serta seluruh backend regression satu kali dengan coverage. Guard security/governance sudah berada di suite frontend/backend sehingga tidak ada re-run `test:guard` terpisah. Ia tidak menjalankan `npm ci` atau menghapus dependency. Browser automation telah dipensiunkan dari quality gate; UI/responsive diperiksa dengan regression frontend dan manual device QA sesuai scope.

Command `lint`, `test`, dan `build` tetap tersedia untuk diagnosis terarah. Full gate hanya memiliki satu entry point publik, `npm run verify`, supaya contributor tidak perlu memilih antara beberapa alias yang fungsinya bertumpuk. Build + budget dijalankan sebelum backend coverage agar kegagalan bundle/source frontend muncul lebih cepat dan tidak membuang waktu pada coverage yang mahal.

Build-budget checker juga memberi warning saat main JS, global CSS, atau route chunk mencapai 90% batas. Warning bukan kegagalan gate, tetapi wajib dianggap sinyal headroom rendah dan dipertimbangkan untuk lazy boundary/ekstraksi sebelum feature berikutnya. Jika build budget gagal, jangan ubah threshold sebagai shortcut. Audit route chunk, static dependency import, CSS global, dan asset tidak terpakai. Auth Google tetap lazy: production canonical desktop/mobile memakai Google OAuth Authorization Code flow server-side melalui `/api/auth/google/start` dan `/api/auth/google/callback`, sedangkan localhost/device emulation memakai Firebase popup fallback. Perubahan auth wajib ikut security/deployment regression, menguji state/nonce, PKCE S256 (`code_challenge`/`code_verifier`), redirect internal, Google→Firebase token exchange, registry `users`/`user_sessions` backend, dan tidak boleh memindahkan authorization dari backend. Verification wrapper selalu membersihkan generated build/test output sesudah PASS maupun gagal, sehingga retry dimulai dari artefak bersih tanpa menghapus dependency atau env lokal.

```bash
npm run db:integrity   # hanya bila operasi DB memang disetujui
```

`npm ci` hanya untuk bootstrap/reinstall dependency atau clean CI. Test yang tidak dijalankan harus dilaporkan sebagai limitation, bukan diklaim PASS.

### 6. Git delivery

Setelah validation PASS:

```bash
git status --short
git switch -c fix/deskripsi-singkat
git add -A
git commit -m "type: deskripsi perubahan"
git push -u origin HEAD
```

Buat Pull Request ke `main`. Workflow **Quality** wajib lulus dan ruleset mengikuti `GITHUB_RULESET.md` sebelum merge.

### 7. Changed-files ZIP

Jika user meminta patch ZIP, isi hanya file berubah dengan path asli. Jangan sertakan dependency, build, cache, generated file, temporary file, export/data privat, atau secret. Bila ada delete, laporkan path delete secara eksplisit.

### 8. Clean source ZIP

`npm run zip` selalu menjalankan full verification terlebih dahulu. Jika PASS, archive verified `saldo-bersama-clean.zip` dibuat. Jika verification gagal tetapi source masih canonical, command tetap exit non-zero namun membuat `saldo-bersama-UNVERIFIED.zip` khusus diagnosis dan menambahkan `docs/UNVERIFIED_BUILD_REPORT.md` hanya ke staging archive. Archive UNVERIFIED tidak boleh dipakai untuk release/deploy dan tidak menghapus clean ZIP verified terakhir. Root/path arbitrary, patch/diff, export CSV/XLSX, database dump, env lokal, secret, dependency, dan build output tetap tidak boleh masuk.

## Keputusan

Prioritas selalu: security/privacy -> data integrity/saldo -> correctness -> accessibility/UX -> maintainability -> cosmetic cleanup. Warning complexity bukan alasan untuk refactor massal tanpa manfaat dan coverage yang memadai.
## Refactor maintainability

Urutan untuk refactor struktur/maintainability:

```text
source aktual
→ identifikasi invariant dan public contract
→ temukan test characterization/regression
→ tambah test bila contract kritis belum terkunci
→ extract satu responsibility pada satu waktu
→ jalankan targeted regression
→ cek dependency/circular import
→ sinkronkan docs
→ full quality gate
```

Refactor tidak boleh memakai perubahan behavior sebagai jalan pintas. Stable facade dipertahankan bila consumer sudah bergantung pada service/action public. Comment/JSDoc mengikuti `docs/CODE_MAINTAINABILITY.md`; targetnya rationale yang tahan lama, bukan comment pada setiap function.


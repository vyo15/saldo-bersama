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

Default full local gate setelah setiap patch:

```bash
npm run verify
```

`npm run verify` melakukan preflight Node 24 dan dependency yang sudah terpasang, lalu menjalankan `npm run check` dan `npm run test:guard`. Ia tidak menjalankan `npm ci` atau menghapus dependency. Browser automation telah dipensiunkan dari quality gate; UI/responsive diperiksa dengan regression frontend dan manual device QA sesuai scope.

`npm run check` tetap menjadi gate inti yang mencakup source validation, lint, frontend/backend tests, backend coverage, production build, dan build budget. Gunakan command penyusun secara terarah hanya untuk diagnosis kegagalan atau bila scope membutuhkan test tambahan:

Jika build budget gagal, jangan ubah threshold sebagai shortcut. Audit route chunk, static dependency import, CSS global, dan asset tidak terpakai. Firebase auth mobile adalah lazy provider chunk: production canonical memakai redirect same-origin dengan reverse proxy `/__/auth/*`, sedangkan localhost/device emulation memakai popup fallback; desktop GIS tetap terpisah. Perubahan auth mobile wajib ikut security/deployment regression, memastikan `/__/auth/*` tetap network-only di Service Worker, dan tidak boleh memindahkan authorization dari backend. Verification wrapper selalu membersihkan generated build/test output sesudah PASS maupun gagal, sehingga retry dimulai dari artefak bersih tanpa menghapus dependency atau env lokal.

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

`npm run zip` menghasilkan archive source canonical yang fail-closed. Root/path arbitrary, patch/diff, export CSV/XLSX, database dump, env lokal, secret, dependency, dan build output tidak boleh masuk.

## Keputusan

Prioritas selalu: security/privacy -> data integrity/saldo -> correctness -> accessibility/UX -> maintainability -> cosmetic cleanup. Warning complexity bukan alasan untuk refactor massal tanpa manfaat dan coverage yang memadai.

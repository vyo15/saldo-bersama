# Workflow Canonical

## Team

```text
COORD | koordinasi/review/integration
FE    | frontend/UI/UX/accessibility/browser
BE    | backend/data/auth/security/integrations
```

## Alur kerja

```text
request
  -> validasi source terbaru
  -> audit path/contract/test terkait
  -> root cause
  -> plan file-by-file
  -> approval atau implementasi eksplisit
  -> patch kecil
  -> validation
  -> review diff
  -> commit langsung ke main
  -> push
  -> clean ZIP bila diperlukan
```

### 1. Source validation

ZIP/source terbaru wajib menjadi dasar review. Abaikan `node_modules`, build/dist, cache, `.git`, generated output, temporary file, dan secret. Review resmi menyebut nama source, root, stack relevan, path aktual yang diperiksa, file penting yang tidak ditemukan, dan limitation.

### 2. Scope

Jangan mengarang path/schema/route/dependency. Gunakan helper/component/service existing. Jika implementasi membutuhkan area guarded yang belum disetujui, berhenti dan minta approval.

### 3. Parallel work

Beberapa chat/tab boleh melakukan audit atau menyiapkan patch paralel bila scope tidak overlap. Karena user bekerja dari satu folder fisik, **penerapan patch dilakukan serial**: patch A -> validate/commit/push -> patch B.

Tidak ada task registry atau branch automation. Koordinasi scope dilakukan melalui plan dan diff source aktual.

### 4. Guarded changes

Approval eksplisit wajib untuk schema/migration, auth/allowlist/role, API contract, saldo/transfer/audit/idempotency, backup/restore/import/purge, env/secret/deployment, serta trust-boundary/security tooling. Guarded change tetap memakai Git normal setelah approval; pengaman utama adalah review + test + fail-closed runtime contract.

### 5. Validation

Default full local gate setelah setiap patch:

```bash
npm run verify
```

`npm run verify` melakukan preflight Node 24 dan dependency yang sudah terpasang, lalu menjalankan `npm run check`, `npm run test:guard`, dan `npm run test:browser`. Ia tidak menjalankan `npm ci` atau menghapus dependency.

`npm run check` tetap menjadi gate inti yang mencakup source validation, lint, frontend/backend tests, backend coverage, production build, dan build budget. Gunakan command penyusun secara terarah hanya untuk diagnosis kegagalan atau bila scope membutuhkan test tambahan:

```bash
npm run db:integrity   # hanya bila operasi DB memang disetujui
```

`npm ci` hanya untuk bootstrap/reinstall dependency atau clean CI. Test yang tidak dijalankan harus dilaporkan sebagai limitation, bukan diklaim PASS.

### 6. Direct Git

Setelah validation PASS:

```bash
git status --short
git add -A
git commit -m "type: deskripsi perubahan"
git push origin main
```

PR/branch hanya opsional bila user meminta atau repository rules mengharuskan.

### 7. Changed-files ZIP

Jika user meminta patch ZIP, isi hanya file berubah dengan path asli. Jangan sertakan dependency, build, cache, generated file, temporary file, export/data privat, atau secret. Bila ada delete, laporkan path delete secara eksplisit.

### 8. Clean source ZIP

`npm run zip` menghasilkan archive source canonical yang fail-closed. Root/path arbitrary, patch/diff, export CSV/XLSX, database dump, env lokal, secret, dependency, dan build output tidak boleh masuk.

## Keputusan

Prioritas selalu: security/privacy -> data integrity/saldo -> correctness -> accessibility/UX -> maintainability -> cosmetic cleanup. Warning complexity bukan alasan untuk refactor massal tanpa manfaat dan coverage yang memadai.

# Contributing

Repository ini private dan workflow default sengaja sederhana.

## Sebelum mengubah source

1. Baca `AGENTS.md`, `docs/WORKFLOW.md`, dan `docs/GIT_WORKFLOW.md`.
2. Gunakan source terbaru dan review path aktual.
3. Untuk area guarded/high-risk, dapatkan approval eksplisit terlebih dahulu.
4. Jangan memasukkan secret, data finansial nyata, dependency/generated output, atau perubahan di luar scope.

## Validation

Setelah setiap patch, jalankan full local gate:

```bash
npm run verify
```

`npm run verify` tidak reinstall dependency. Ia melakukan preflight Node/dependency lalu menjalankan quality gate inti, guard regression, dan browser regression. Jalankan test domain tambahan bila perubahan menyentuh auth, saldo, transfer, idempotency, import, backup/restore, notifikasi, atau security.

Gunakan `npm ci` hanya untuk bootstrap/reinstall dependency atau clean CI, bukan sebelum setiap validation.

## Commit dan push

Setelah validation PASS:

```bash
git status --short
git add -A
git commit -m "type: deskripsi perubahan"
git push origin main
```

PR/branch bersifat opsional dan dipakai hanya bila user meminta review tambahan atau repository rules mengharuskannya. Panduan lengkap ada di `docs/GIT_WORKFLOW.md`.

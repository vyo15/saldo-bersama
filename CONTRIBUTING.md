# Contributing

Repository ini private dan workflow default sengaja sederhana.

## Scope repository

Repository ini private dan deployment canonical memakai Vercel Git integration. Karena itu Dockerfile/CD container, public `LICENSE`, dan `CODE_OF_CONDUCT.md` bukan requirement aktif. Jangan menambahkannya hanya untuk memenuhi checklist generik; evaluasi ulang bila repository dipublikasikan, didistribusikan, atau model kontribusinya berubah.

Konvensi nama mengikuti peran: komponen React `PascalCase.jsx`, hook `useCamelCase.js`, helper/service/module non-komponen `camelCase.js`, dan folder feature lowercase. Struktur frontend tetap feature-based di `frontend/src/features/`; backend memakai service/domain boundary existing.

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

`npm run verify` tidak reinstall dependency. Ia melakukan preflight Node/dependency lalu menjalankan quality gate inti dan guard regression. Patch/handoff tidak dianggap final sebelum gate ini PASS pada Node `24.18.1`; hasil dari environment lain harus diberi label candidate/unverified. Jalankan test domain tambahan bila perubahan menyentuh auth, saldo, transfer, idempotency, import, backup/restore, notifikasi, atau security. UI/responsive tetap diverifikasi manual pada perangkat yang relevan; browser automation tidak memblokir quality gate.

Gunakan `npm ci` hanya untuk bootstrap/reinstall dependency atau clean CI, bukan sebelum setiap validation.

## Commit dan delivery

Setelah validation PASS:

```bash
git status --short
git switch -c fix/deskripsi-singkat
git add -A
git commit -m "type: deskripsi perubahan"
git push -u origin HEAD
```

Buat Pull Request ke `main`. Workflow **Quality** wajib lulus sebelum merge sesuai `docs/GITHUB_RULESET.md`. Panduan lengkap ada di `docs/GIT_WORKFLOW.md`.

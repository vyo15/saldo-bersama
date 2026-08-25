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

## Maintainability review

Ikuti `docs/CODE_MAINTAINABILITY.md`. Reviewer harus memastikan extraction benar-benar mengurangi responsibility/coupling, bukan hanya memindahkan baris. Comment dipakai untuk rationale/invariant non-obvious; business rule kritis tidak boleh diduplikasi demi membuat component atau service tampak lebih sederhana. Guarded refactor wajib menjaga public facade/API, authorization, saldo, idempotency, lifecycle, dan recovery semantics.

## Validation dan delivery

Quality gate canonical tetap:

```bash
npm run verify
```

Namun untuk workflow rutin pengguna tidak perlu menjalankannya manual sebelum setiap push karena managed pre-push hook menjalankan full verification lalu Production schema/binding preflight read-only secara otomatis pada:

```bash
git push origin main
```

Urutan rutin:

```bash
git add .
git commit -m "type: deskripsi perubahan"
git push origin main
```

Push hanya dilanjutkan bila ref `main` yang akan dikirim sama dengan `HEAD`, working tree bersih, push fast-forward, dan full verification PASS pada Node `24.18.1`. Jangan memakai `--no-verify` atau force push.

`npm ci` hanya untuk bootstrap/reinstall dependency atau clean CI, bukan sebelum setiap validation. Test domain tambahan tetap wajib bila perubahan menyentuh auth, saldo, transfer, idempotency, import, backup/restore, notifikasi, atau security. UI/responsive tetap diverifikasi manual pada perangkat yang relevan.

# Definition of Done

Perubahan dianggap selesai bila:

- acceptance criteria/request terpenuhi;
- diff tetap dalam scope yang disetujui;
- bug/regression memiliki test behavior/contract yang relevan; static source test tidak mengunci detail implementasi yang tidak menjadi contract;
- `npm run lint` PASS pada tree final; bila lint sempat gagal, root cause diperbaiki dan lint diulang sampai PASS tanpa menonaktifkan rule sebagai shortcut;
- targeted regression PASS, lalu `npm run verify` benar-benar dijalankan pada tree final yang sama; bila source/test/docs berubah setelah PASS, lint/gate relevan diulang;
- security, privacy, data integrity, accessibility, compatibility, dan performance diperiksa sesuai scope;
- authority docs/contract/runbook terdampak diperbarui sesuai `docs/INDEX.md`; snapshot tetap current-state, history tetap di CHANGELOG/Git/archive, dan tidak ada instruction lama yang menyamar sebagai aturan aktif;
- tidak ada secret, data finansial nyata, raw stack trace, dependency, build/generated artifact, atau file lokal dalam commit/ZIP;
- bila user meminta delivery Git, perubahan sudah di-commit pada `main` dan `git push origin main` hanya berhasil setelah managed pre-push memverifikasi ref/SHA aktual + full `npm run verify` + Production gate sesuai scope: DB schema/binding read-only untuk diff database-compatibility atau core Vercel health untuk diff non-schema; workflow **Quality** server-side tetap dipantau;
- clean/changed-files ZIP dibuat bila diperlukan.

Untuk guarded/high-risk, Done juga mensyaratkan approval eksplisit dan evidence test domain yang sesuai. Tidak ada task-card/archive requirement.
- Critical rationale/non-obvious invariant pada financial, security, idempotency/concurrency, dan destructive workflow terdokumentasi dekat code terkait sesuai `docs/CODE_MAINTAINABILITY.md`.
- Structural refactor menjaga public facade/API dan tidak menambah business-rule implementation kedua. Circular dependency tetap nol.
- File besar direview berdasarkan responsibility/cognitive load; line count sendiri bukan alasan refactor.


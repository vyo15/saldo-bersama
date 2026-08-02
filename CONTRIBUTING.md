# Contributing

Dokumen ini berisi kebijakan kontribusi. Command branch, sync, commit, push, dan pull request yang canonical berada di `docs/GIT_WORKFLOW.md`; jangan menduplikasi workflow operasional di dokumen lain.

## Sebelum mulai

1. Baca `AGENTS.md`.
2. Baca `docs/PROJECT_STATUS.md` dan `docs/PROJECT_HANDOFF.md`.
3. Pastikan task memenuhi `docs/DEFINITION_OF_READY.md`.
4. Untuk perubahan guarded atau lintas arsitektur, siapkan RFC/approval sebelum coding.
5. Ikuti `docs/GIT_WORKFLOW.md` untuk branch dan command quality gate.

## Prinsip kontribusi

- Satu branch dan pull request memiliki scope jelas.
- Commit kecil, dapat direview, dan tidak mencampur refactor tidak terkait.
- Source aktual lebih tinggi prioritasnya daripada chat, screenshot, atau dokumentasi lama.
- Setiap perubahan implementasi harus memperbarui dokumentasi yang terdampak pada patch yang sama.
- Jangan mengubah schema, auth/role, API contract, saldo, audit, migration, backup/restore, secret, atau deployment tanpa approval eksplisit.

## RFC dan ADR

Buat RFC sebelum implementasi bila perubahan menyentuh database, auth/role, API contract, saldo, offline mode, backup/restore, integrasi baru, dependency utama, atau deployment. Setelah keputusan diterima, catat hasilnya sebagai ADR.

## Pull request

PR wajib menjelaskan tujuan, scope, file utama, dampak data/saldo/security, migration atau environment change, hasil test aktual, manual test, dokumentasi, risiko, dan rollback. Gunakan template repository dan tunggu approval code owner.

## Definition of Done

Pekerjaan baru selesai setelah memenuhi `docs/DEFINITION_OF_DONE.md`, termasuk:

- quality gate aktual;
- dokumentasi/handoff/changelog;
- tidak ada secret atau data nyata di Git/ZIP/log;
- rollback atau forward-fix plan untuk perubahan berisiko.

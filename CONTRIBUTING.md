# Contributing

Dokumen ini berisi kebijakan kontribusi. Multi-team lifecycle berada di `docs/WORKFLOW.md`; command Git canonical berada di `docs/GIT_WORKFLOW.md`.

## Sebelum mulai

1. Baca `AGENTS.md`.
2. Baca `docs/WORKFLOW.md` dan `docs/PROJECT_STATUS.md`.
3. Pastikan task card aktif tersedia dan memenuhi `docs/DEFINITION_OF_READY.md`.
4. Jalankan `npm run task:check` sebelum patch.
5. Untuk perubahan UI, baca `docs/UI_DESIGN_SYSTEM.md` dan gunakan shared primitive existing.
6. Untuk perubahan guarded atau lintas arsitektur, siapkan RFC/approval sebelum coding.
7. Ikuti `docs/GIT_WORKFLOW.md` untuk branch/worktree dan quality gate.

## Prinsip kontribusi

- Satu branch/task memiliki satu Primary Team dan scope jelas.
- Branch wajib membawa Task ID `SB-xxx`.
- Commit kecil, dapat direview, dan tidak mencampur refactor tidak terkait.
- Same-team/same-area findings boleh dibatch bila masih dalam write scope dan risk class yang sama.
- Temuan lintas team atau guarded area baru menjadi linked task, bukan automatic patch.
- Source aktual lebih tinggi prioritasnya daripada chat, screenshot, memory, atau snapshot docs.
- Setiap perubahan implementasi memperbarui contract/runbook/ADR yang benar-benar terdampak pada patch yang sama.
- `PROJECT_STATUS.md` hanya diubah bila current project state berubah. `CHANGELOG.md` diubah oleh `COORD`/release saat perubahan memang masuk ke release history.
- Jangan mengubah schema, auth/role, API contract, saldo, audit, migration, backup/restore, secret, dependency, atau deployment tanpa approval eksplisit.

## RFC dan ADR

Buat RFC sebelum implementasi bila perubahan menyentuh database, auth/role, API contract, saldo, offline mode, backup/restore, integrasi baru, dependency utama, atau deployment. Setelah keputusan diterima, catat hasilnya sebagai ADR bila keputusan arsitektural perlu dipertahankan.

## Pull request

PR wajib menyebut Task ID, Primary Team, task card, objective, scope, guarded impact, hasil test aktual, manual test, dokumentasi, risiko, dan rollback/forward-fix. Gunakan template repository dan tunggu approval code owner.

## Definition of Done

Pekerjaan baru selesai setelah memenuhi `docs/DEFINITION_OF_DONE.md`. Coding selesai hanya menghasilkan `READY_FOR_QA`; `DONE` membutuhkan integration/post-merge verification dan task card di archive.

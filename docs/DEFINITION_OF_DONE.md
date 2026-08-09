# Definition of Done

Task hanya boleh menjadi `DONE` bila:

- acceptance criteria terpenuhi;
- scope tidak melebar di luar task card;
- modified path sesuai `Write Scope` dan `npm run task:check` lulus;
- code review/code owner approval selesai;
- unit/integration/contract test relevan ditambah dan lulus;
- lint, build, source validation, full test, serta test khusus dijalankan sesuai stack aktual;
- manual test role/device/flow relevan dilakukan;
- perubahan UI mengikuti `UI_DESIGN_SYSTEM.md` dan diuji pada mobile/desktop, light/dark, keyboard, focus, loading, error, serta reduced motion yang relevan;
- security, privacy, data integrity, accessibility, dan offline state diperiksa;
- migration/parity/backup/rollback diverifikasi bila relevan;
- observability dan audit event tersedia bila perilaku baru memerlukannya;
- API/data/env/docs/runbook/ADR yang terdampak diperbarui;
- QA result `PASS`;
- integration check `PASS`;
- perubahan sudah merge dan post-merge verification `PASS`;
- `PROJECT_STATUS.md` diperbarui bila current state berubah;
- `CHANGELOG.md` diperbarui oleh `COORD`/release bila perubahan masuk release history;
- task card berstatus `DONE` dan dipindahkan ke `docs/tasks/archive/`;
- tidak ada secret, raw error, generated artifact, atau data nyata dalam commit/ZIP.

Command yang tidak dijalankan harus ditulis sebagai belum diuji. Coding selesai hanya cukup untuk `READY_FOR_QA`, bukan `DONE`.

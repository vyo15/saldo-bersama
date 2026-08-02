# Definition of Done

Perubahan selesai hanya bila:

- acceptance criteria terpenuhi;
- scope tidak melebar;
- code review/code owner approval selesai;
- unit/integration/contract test relevan ditambah dan lulus;
- lint, build, source validation, dan full test dijalankan;
- manual test role/device/flow relevan dilakukan;
- security, privacy, data integrity, accessibility, dan offline state diperiksa;
- migration/parity/backup/rollback diverifikasi bila relevan;
- observability dan audit event tersedia bila perilaku baru memerlukannya;
- API/data/env/docs/runbook/ADR diperbarui;
- `PROJECT_STATUS`, `PROJECT_HANDOFF`, dan `CHANGELOG` diperbarui;
- deployment smoke test dan monitoring normal;
- tidak ada secret, raw error, build artifact, atau data nyata dalam commit/ZIP.

Command yang tidak dijalankan harus ditulis sebagai belum diuji.

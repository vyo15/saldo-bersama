# Definition of Done

Task `DONE` bila:

- acceptance criteria terpenuhi;
- perubahan tetap dalam `Write Scope`;
- validation yang relevan benar-benar dijalankan dan hasilnya dicatat;
- security, privacy, data integrity, accessibility, dan compatibility diperiksa sesuai scope;
- docs/contract/runbook yang benar-benar terdampak diperbarui;
- perubahan sudah masuk `main`;
- task card dipindahkan ke `docs/tasks/archive/`;
- tidak ada secret, raw error, generated artifact, atau data nyata dalam commit/ZIP.

Normal task dapat ditutup otomatis oleh `npm run task:finish`.

Guarded/HIGH/CRITICAL hanya `DONE` setelah Guard Approval APPROVED, local validation PASS, merge ke `main` berhasil, dan status task di-archive.

# Definition of Done

Perubahan dianggap selesai bila:

- acceptance criteria/request terpenuhi;
- diff tetap dalam scope yang disetujui;
- validation relevan benar-benar dijalankan dan PASS;
- security, privacy, data integrity, accessibility, compatibility, dan performance diperiksa sesuai scope;
- docs/contract/runbook terdampak diperbarui;
- tidak ada secret, data finansial nyata, raw stack trace, dependency, build/generated artifact, atau file lokal dalam commit/ZIP;
- bila user meminta delivery Git, perubahan sudah di-commit pada branch, dipush, melewati Pull Request + workflow **Quality**, lalu di-merge ke `main` sesuai ruleset;
- clean/changed-files ZIP dibuat bila diperlukan.

Untuk guarded/high-risk, Done juga mensyaratkan approval eksplisit dan evidence test domain yang sesuai. Tidak ada task-card/archive requirement.

# Definition of Done

Perubahan dianggap selesai bila:

- acceptance criteria/request terpenuhi;
- diff tetap dalam scope yang disetujui;
- bug/regression memiliki test behavior/contract yang relevan; static source test tidak mengunci detail implementasi yang tidak menjadi contract;
- targeted regression PASS, lalu validation penuh benar-benar dijalankan pada tree final yang sama; bila source/test/docs berubah setelah PASS, gate relevan diulang;
- security, privacy, data integrity, accessibility, compatibility, dan performance diperiksa sesuai scope;
- docs/contract/runbook terdampak diperbarui sesuai `docs/INDEX.md` dan tidak meninggalkan snapshot/checklist historis yang menyamar sebagai aturan aktif;
- tidak ada secret, data finansial nyata, raw stack trace, dependency, build/generated artifact, atau file lokal dalam commit/ZIP;
- bila user meminta delivery Git, perubahan sudah di-commit pada branch, dipush, melewati Pull Request + workflow **Quality**, lalu di-merge ke `main` sesuai ruleset;
- clean/changed-files ZIP dibuat bila diperlukan.

Untuk guarded/high-risk, Done juga mensyaratkan approval eksplisit dan evidence test domain yang sesuai. Tidak ada task-card/archive requirement.

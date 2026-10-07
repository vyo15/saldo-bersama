# Definition of Done

Perubahan dianggap selesai bila:

- acceptance criteria/request terpenuhi;
- diff tetap dalam scope yang disetujui;
- bug/regression memiliki test behavior/contract yang relevan; static source test tidak mengunci detail implementasi yang tidak menjadi contract;
- `npm run lint` PASS pada tree final; bila lint sempat gagal, root cause diperbaiki dan lint diulang sampai PASS tanpa menonaktifkan rule sebagai shortcut;
- targeted regression PASS, lalu `npm run verify` benar-benar dijalankan pada tree final yang sama; bila source/test/docs berubah setelah PASS, lint/gate relevan diulang;
- security, privacy, data integrity, accessibility, compatibility, dan performance diperiksa sesuai scope;
- untuk perubahan UI/responsive/accessibility, `npm run test:browser` PASS pada production build dan tidak ada known mobile native touch target <44px, critical horizontal overflow, focus-visible regression, contrast-AA token regression, atau reduced-motion regression pada scope terdampak;
- status UX **10/10** tidak boleh diklaim hanya dari static/source audit: full axe scan serta real-device Administrator/Member pada browser target tetap evidence release yang harus dicatat bila target penilaian meminta coverage tersebut;
- authority docs/contract/runbook terdampak diperbarui sesuai `docs/INDEX.md`; snapshot tetap current-state, history tetap di CHANGELOG/Git/archive, dan tidak ada instruction lama yang menyamar sebagai aturan aktif;
- tidak ada secret, data finansial nyata, raw stack trace, dependency, build/generated artifact, atau file lokal dalam commit/ZIP;
- bila user meminta delivery Git, perubahan sudah di-commit pada `main` dan `git push origin main` hanya berhasil setelah managed pre-push memverifikasi ref/SHA aktual + full `npm run verify` + Production gate sesuai scope: DB schema/binding read-only untuk diff database-compatibility atau core Vercel health untuk diff non-schema; workflow **Quality** server-side tetap dipantau;
- changed-files-only ZIP menjadi default handoff patch; patch paralel mencatat baseline/scope/touched paths/validation mengikuti `docs/templates/PATCH_MANIFEST_TEMPLATE.md`, sedangkan clean full-source ZIP hanya dibuat bila diperlukan;
- bila ada delete/rename, usage audit selesai, path lama absent pada final tree, dan handoff menyertakan command Git Bash `rm -f`/`rm -rf` yang tepat;
- bila beberapa patch digabung di akhir, project terbaru dipakai sebagai source of truth, overlap di-merge secara semantic (bukan overwrite ZIP mentah), targeted regression overlap PASS, lalu lint + full verify PASS pada hasil integrasi;
- status handoff adalah `FINAL / VERIFIED` hanya setelah full gate PASS; jika full gate benar-benar terblokir environment eksternal, gunakan `CANDIDATE / UNVERIFIED` dan jangan membawa known failure yang dapat direproduksi.

Untuk guarded/high-risk, Done juga mensyaratkan approval eksplisit dan evidence test domain yang sesuai. Tidak ada task-card/archive requirement.
- Critical rationale/non-obvious invariant pada financial, security, idempotency/concurrency, dan destructive workflow terdokumentasi dekat code terkait sesuai `docs/CODE_MAINTAINABILITY.md`.
- Structural refactor menjaga public facade/API dan tidak menambah business-rule implementation kedua. Circular dependency tetap nol.
- File besar direview berdasarkan responsibility/cognitive load; line count sendiri bukan alasan refactor.


### Human-error safety
- Financial mutation tidak memungkinkan double-submit atau changed-payload retry setelah outcome unknown.
- Field error yang dapat diketahui client tampil inline dan dapat ditemukan keyboard/screen reader.
- Reversible low-risk action menyediakan recovery/Undo bila contract backend mendukung.
- Perubahan privilege existing user memiliki review acknowledgement eksplisit.


- Human-error hardening final: create anggota dengan email aktif harus berhenti tanpa silent update; privilege Administrator baru/perubahan role wajib direview; Shopping Undo mengembalikan status sebelum dihapus dan tidak kedaluwarsa saat restore; editor Shopping, Rekening, Kategori, Target, Rekonsiliasi, lifecycle Transaksi, Anggota, dan Jadwal Rutin mempertahankan exact-retry saat outcome mutation belum pasti; Target baru/edit tidak menerima tanggal masa lalu.

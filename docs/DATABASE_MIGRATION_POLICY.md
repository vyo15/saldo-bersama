# Database Migration Policy

1. `database/migrations/` adalah satu-satunya sumber schema.
2. Migration yang sudah diterapkan tidak boleh diedit; buat file bernomor baru.
3. Setiap migration mempunyai tujuan, compatibility window, backup, parity, rollback/forward-fix, dan test.
4. API tidak membuat/mengubah schema otomatis saat request.
5. Migration Production hanya eksplisit melalui workflow disetujui. Workflow canonical operator adalah `npm run prod:update`; `npm run db:migrate -- production` menjadi alias kompatibilitas ke workflow yang sama, bukan jalur mutation terpisah.
6. Sebelum mengubah schema Production existing, tooling wajib membuat **backup teknis `verified` fresh** dari schema aktif. Seluruh pending migration menuju runtime current wajib dijalankan dalam **satu transaksi atomik**; bila salah satu statement atau integrity check gagal, transaksi rollback dan schema awal tetap utuh. Bila backup/Drive/owner verification gagal, migration fail-closed sebelum mutation schema. Operator tidak perlu membuat backup manual hanya untuk melewati guard.
7. Target schema migration dibaca dari deklarasi `system_config.schema_version` di isi SQL, bukan dari prefix nama file. `schema_migrations.version` tetap ID urutan migration; keduanya tidak boleh disamakan secara implisit.
8. Sebelum transaksi migration commit, engine/FK/business integrity harus lulus pada state target. Sesudah commit, integrity final dijalankan ulang; hanya setelah itu candidate yang sama boleh dipromosikan. Runtime dan database tidak boleh dipromosikan melalui dua flow operator yang terpisah.
9. Bila rollback tidak aman setelah write baru, gunakan forward-fix terkontrol.
10. Runtime Development dan Vercel Production memakai profile/database terpisah dan binding `database_environment` yang berbeda. Migration eksperimen tetap dilarang pada Production; target Production harus eksplisit dan didahului backup/integrity sesuai runbook.
11. Update `TURSO_SCHEMA.md`, `DATA_DICTIONARY.md`, `PROJECT_STATUS.md`, test schema, changelog, dan release checklist.

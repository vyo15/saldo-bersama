# Database Migration Policy

1. `database/migrations/` adalah satu-satunya sumber schema.
2. Migration yang sudah diterapkan tidak boleh diedit; buat file bernomor baru.
3. Setiap migration mempunyai tujuan, compatibility window, backup, parity, rollback/forward-fix, dan test.
4. API tidak membuat/mengubah schema otomatis saat request.
5. Migration production hanya eksplisit melalui workflow disetujui.
6. Sebelum migration berisiko: maintenance bila perlu, safety backup, integrity baseline.
7. Sesudah apply: schema version, FK, integrity, financial fingerprint, saldo, dan laporan diverifikasi.
8. Bila rollback tidak aman setelah write baru, gunakan forward-fix terkontrol.
9. Runtime Development dan Vercel Production memakai profile/database terpisah dan binding `database_environment` yang berbeda. Migration eksperimen tetap dilarang pada Production; target Production harus eksplisit dan didahului backup/integrity sesuai runbook.
10. Update `TURSO_SCHEMA.md`, `DATA_DICTIONARY.md`, `PROJECT_STATUS.md`, test schema, changelog, dan release checklist.

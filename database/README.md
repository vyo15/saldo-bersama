# Database Turso

`database/migrations` adalah satu-satunya definisi schema runtime. Migration dijalankan eksplisit dengan `npm run db:migrate`; API tidak pernah membuat atau mengubah schema otomatis saat request pengguna.

Aturan utama:
- nominal IDR disimpan sebagai `INTEGER`;
- foreign key wajib aktif pada setiap koneksi;
- transaksi normal memakai status, bukan hard delete;
- audit append-only;
- seluruh mutasi kritis memakai transaction, idempotency, dan `row_version`;
- Google Sheets hanya mirror satu arah dan dapat dibangun ulang dari Turso.

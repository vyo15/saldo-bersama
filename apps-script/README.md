# Google Integration Bridge

Apps Script ini bukan database dan tidak menerima operasi finansial. Turso tetap menjadi source of truth.

Fungsi bridge:
- membangun ulang Google Sheets mirror satu arah;
- membangun ulang event Google Calendar yang dikelola Saldo Bersama;
- menyimpan/membaca backup teknis pada folder Google Drive yang ditentukan;
- memanggil scheduled job Vercel setiap 10 menit.

Script Properties wajib:
- `GOOGLE_BRIDGE_SHARED_SECRET`
- `MIRROR_SPREADSHEET_ID`
- `GOOGLE_CALENDAR_ID`
- `BACKUP_FOLDER_ID`
- `JOBS_ENDPOINT_URL`
- `JOBS_SHARED_SECRET`

Deploy Web App dengan **Execute as: user deploying** dan **Who has access: anyone/anonymous** agar Vercel dapat memanggilnya tanpa sesi Google. Endpoint publik ini hanya menerima action allowlist dengan HMAC, timestamp, dan nonce; URL serta shared secret tidak boleh dibagikan.

Daftar pemisahan Vercel environment dan Script Properties berada di `docs/ENVIRONMENT_VARIABLES.md`.

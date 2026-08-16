# Observability

## Health

`/api/health` adalah endpoint publik minimum dan hanya mengembalikan `status`, `timestamp`, serta `requestId`; status publik dinormalisasi menjadi `ok` atau `degraded`. Detail database/schema/maintenance/build tidak diekspos pada endpoint publik. Action terautentikasi `system.health` menyediakan status operasional yang diperlukan UI Administrator. `system.health` tidak melakukan network probe ke Google; provider yang belum diprobe harus tetap berstatus belum terverifikasi. Health resource Google yang dapat mengaktifkan action berasal dari `integrations.status`. Response tidak boleh memuat URL/token database, secret, full Spreadsheet/Calendar/Drive ID, stack trace, atau internal path.

## Logging

Log terstruktur minimal: request ID, action, status, duration, actor user ID teredaksi, dan error code. Jangan log payload finansial penuh, session cookie, Firebase token, push key, backup body, atau SQL parameter sensitif.

## Alert operasional

Periksa:

- schema mismatch;
- maintenance aktif;
- integration pending/failed/dead-letter;
- notification queue macet;
- backup harian gagal;
- integrity run gagal;
- repeated auth/rate-limit failure.

Worker `processing` yang melewati batas waktu direclaim secara terbatas. Dead-letter memerlukan tindakan owner, bukan retry tanpa batas.


## Event catalog dan runbook

Nama event, field minimum/terlarang, owner, dan alert dicatat pada `LOG_EVENT_CATALOG.md`. Tindakan operasional mengikuti `OPERATIONS_RUNBOOK.md` dan `INCIDENT_RESPONSE.md`.

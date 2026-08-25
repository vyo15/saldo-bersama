# Observability

## Health

`/api/health` adalah endpoint publik minimum dan hanya mengembalikan `status`, `timestamp`, serta `requestId`; status publik dinormalisasi menjadi `ok` atau `degraded`. Status publik merepresentasikan **core availability** dan hanya degraded bila database/schema/binding tidak siap, maintenance aktif, atau integrity failure menjadi blocker. Scheduler, integration, notification, dan backup warning tidak mematikan core availability. Detail database/schema/maintenance/build tidak diekspos pada endpoint publik. Action terautentikasi `system.health` menyediakan status operasional yang diperlukan UI Administrator, termasuk scheduler dan aggregate signal tanpa payload untuk unresolved integration dead-letter, notification queue dead-letter yang masih actionable, per-device Push dead-letter yang belum terbukti pulih, backup terbaru gagal, serta integrity run terbaru gagal. `system.health` tidak melakukan network probe ke Google; provider yang belum diprobe harus tetap berstatus belum terverifikasi. Health resource Google yang dapat mengaktifkan action berasal dari `integrations.status`. Response tidak boleh memuat URL/token database, secret, full Spreadsheet/Calendar/Drive ID, stack trace, atau internal path.

## Logging

Log terstruktur minimal: request ID, action, status, duration, actor user ID teredaksi, dan error code. Jangan log payload finansial penuh, session cookie, Firebase token, push key, backup body, atau SQL parameter sensitif.

## Alert operasional

Status saat ini: event/log/health tersedia, tetapi external alerting independen belum diimplementasikan. Pemeriksaan manual atau monitor platform harus dipakai sampai provider/kanal alert disetujui. Jangan memakai Web Push aplikasi sebagai satu-satunya alarm untuk kegagalan Web Push itu sendiri.

Scheduler menulis heartbeat aman ke `system_config` (`last_run`, `last_success`, `last_failure`, error code teredaksi). Bila `JOBS_SHARED_SECRET` dikonfigurasi tetapi heartbeat sukses belum ada, stale >35 menit, failure lebih baru dari success, integration worker menghasilkan failure, Push menghasilkan queue failure, atau satu run Push hanya berhasil sebagian karena ada delivery perangkat yang gagal, scheduler health menjadi `degraded`. Aggregate operational health juga menandai unresolved integration dead-letter, notification queue `dead_letter` yang masih mempunyai subscription aktif dan belum diikuti keberhasilan untuk tipe notifikasi yang sama, per-device delivery `dead_letter` pada subscription aktif yang belum diikuti delivery sukses, backup terbaru `failed`, atau integrity run terbaru `failed`. Public `/api/health` tetap tidak mengekspos detail heartbeat dan tidak menjadi degraded hanya karena warning scheduler/integration/notification/backup; detail dan aggregate operational warning tersedia pada `system.health` terautentikasi. Integrity failure tetap core blocker pada keduanya.

Kondisi minimum yang harus menghasilkan tindakan operator:

- schema mismatch;
- maintenance aktif;
- integration pending/failed/dead-letter;
- notification queue macet;
- backup harian gagal;
- integrity run gagal;
- repeated auth/rate-limit failure;
- scheduler tidak berjalan sesuai cadence yang diharapkan.

Alert eksternal, bila nanti disetujui, hanya boleh membawa metadata operasional minimum seperti environment, status, timestamp, request ID, dan error code aman. Nominal, rekening, merchant, token, raw payload, stack trace, atau identifier resource Google tidak boleh dikirim.

Worker `processing` yang melewati batas waktu direclaim secara terbatas. Dead-letter memerlukan tindakan owner, bukan retry tanpa batas. Signal health dead-letter bersifat unresolved/actionable: histori failure tetap berada di database/log, tetapi health boleh kembali sehat setelah delivery yang lebih baru membuktikan jalur tersebut pulih.


## Event catalog dan runbook

Nama event, field minimum/terlarang, owner, dan alert dicatat pada `LOG_EVENT_CATALOG.md`. Tindakan operasional mengikuti `OPERATIONS_RUNBOOK.md` dan `INCIDENT_RESPONSE.md`.

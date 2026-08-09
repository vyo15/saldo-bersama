# Definition of Ready

Task siap masuk `READY` bila:

- memiliki Task ID `SB-xxx` dan task card di `docs/tasks/active/`;
- objective dan outcome jelas;
- acceptance criteria dapat diuji;
- Primary Team tepat satu dan Supporting Teams ditentukan bila perlu;
- Work Package/Parent/Related diisi sesuai kebutuhan;
- scope dan non-goal jelas;
- `Write Scope`, `Read Only`, dan `Forbidden` ditulis;
- source terbaru tersedia dan root/path aktual sudah dipetakan;
- baseline branch/commit dicatat;
- dependency (`Depends On`) dinilai;
- dampak API, schema, auth, saldo, audit, backup, security, UI, environment, dependency, dan deployment dinilai;
- guarded assessment dan kebutuhan approval/RFC/ADR diputuskan;
- data test memakai dummy;
- test plan dan rollback/forward-fix awal tersedia;
- checkpoint awal memiliki `Resume From` dan `Last Verified Commit`.

`READY` berarti plan siap direview, **belum izin coding**. Coding baru boleh dimulai setelah user menyetujui plan, status menjadi `APPROVED`, dependency clear, branch/worktree cocok, dan `npm run task:check` lulus.

Task guarded tidak boleh dimulai hanya dari instruksi singkat tanpa source review dan approval plan.

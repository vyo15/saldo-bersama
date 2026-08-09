# Release Checklist

## Pre-release

- [ ] Seluruh task release yang wajib sudah `READY_FOR_MERGE` dan `npm run task:check` lulus.
- [ ] PR approved dan conversation resolved.
- [ ] Commit SHA/version ditentukan.
- [ ] `npm ci`, env check, full quality gate lulus pada Node 24.
- [ ] Migration/schema impact direview.
- [ ] Backup/parity/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Changelog/current project status/docs/ADR diperbarui sesuai dampak aktual.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] Deployment baru dibuat setelah env change.
- [ ] Migration eksplisit dijalankan hanya bila disetujui.
- [ ] Smoke test owner dan member.
- [ ] Create/update/cancel, transfer, conflict, report/export diuji sesuai scope release.
- [ ] Health, audit, queue, backup/integration normal.
- [ ] Saldo/verifikasi data lulus.

## Close

- [ ] Release tag/commit dicatat.
- [ ] Monitoring window selesai.
- [ ] Rollback window dan known issues dicatat.
- [ ] Post-merge verification task terkait `PASS`.
- [ ] Task selesai dipindahkan dari `docs/tasks/active/` ke `docs/tasks/archive/`.
- [ ] `PROJECT_STATUS.md` menunjukkan current state dan next operational risk tanpa menyalin histori release.

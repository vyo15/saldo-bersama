# Release Checklist

## Pre-release

- [ ] PR approved dan conversation resolved.
- [ ] Commit SHA/version ditentukan.
- [ ] `npm ci`, env check, full quality gate lulus pada Node 24.
- [ ] Migration/schema impact direview.
- [ ] Backup/parity/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Changelog, project status, handoff, docs/ADR diperbarui.
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
- [ ] `PROJECT_HANDOFF` menunjuk next safe step.

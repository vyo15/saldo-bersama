## Tujuan

Jelaskan masalah dan hasil yang diharapkan.

## Scope dan file utama

- Issue/RFC/ADR:
- File utama:
- Di luar scope:

## Dampak

- [ ] Tidak mengubah schema/migration
- [ ] Tidak mengubah auth, role, atau authorization
- [ ] Tidak mengubah API/action contract
- [ ] Tidak mengubah perhitungan saldo/transfer
- [ ] Tidak mengubah audit, idempotency, row version, atau soft cancel
- [ ] Tidak mengubah import/export/backup/restore
- [ ] Tidak mengubah environment/deployment/dependency
- [ ] Perubahan UI mengikuti `docs/UI_DESIGN_SYSTEM.md` dan tidak membuat primitive duplikat
- [ ] Tidak memuat secret atau data finansial nyata

Jelaskan semua checkbox yang tidak dapat dicentang.

## Validasi

```text
npm run validate:source:
npm run lint:
npm run test:
npm run build:
npm run build:budget:
npm run check:
npm run test:browser:
npm run zip:
```

Manual test:

- [ ] Mobile 360/390/412px dan desktop
- [ ] Light/dark mode
- [ ] Keyboard/focus/accessible name
- [ ] Tidak ada horizontal overflow atau target sentuh <44px

## Data, security, dan rollback

- Dampak data:
- Risiko security/privacy:
- Migration/compatibility:
- Rollback/forward-fix:

## Dokumentasi dan handoff

- [ ] Docs kontrak/runbook diperbarui
- [ ] `docs/PROJECT_STATUS.md` diperbarui
- [ ] `docs/PROJECT_HANDOFF.md` diperbarui
- [ ] `CHANGELOG.md` diperbarui
- [ ] Screenshot UI hanya memakai data dummy
- [ ] `npm run clean:dry-run` ditinjau dan clean ZIP tidak memuat artefak/secret

## Task

- Task ID: `SB-___`
- Primary Team: `COORD / UIUX / FE / BE / DB / QA`
- Task Card: `docs/tasks/active/SB-___.md`
- Work Package:
- Status target: `READY_FOR_MERGE`

## Tujuan dan scope

- Objective:
- File/path utama:
- Di luar scope:
- Dependency/related task:

## Ownership dan guarded impact

- [ ] `npm run task:check` lulus dan diff hanya berada dalam `Write Scope`
- [ ] Branch cocok dengan Task ID/task card
- [ ] Tidak ada dependency unresolved untuk status saat ini
- [ ] Guarded assessment pada task card benar
- [ ] Tidak mengubah schema/migration tanpa approval
- [ ] Tidak mengubah auth, role, authorization, atau session guard tanpa approval
- [ ] Tidak mengubah API/action contract tanpa approval
- [ ] Tidak mengubah perhitungan saldo/transfer tanpa approval
- [ ] Tidak mengubah audit, idempotency, row version, atau soft lifecycle tanpa approval
- [ ] Tidak mengubah import/export/backup/restore tanpa approval
- [ ] Tidak mengubah environment/deployment/dependency tanpa approval
- [ ] Perubahan UI mengikuti `docs/UI_DESIGN_SYSTEM.md` dan tidak membuat primitive duplikat
- [ ] Tidak memuat secret atau data finansial nyata

Jelaskan semua checkbox yang tidak dapat dicentang.

## Validasi aktual

```text
npm run task:check:
npm run validate:source:
npm run lint:
npm run test:
npm run build:
npm run build:budget:
npm run check:
npm run test:browser:
npm run zip:
```

Manual test yang relevan:

- [ ] Mobile 360/390/412px dan desktop
- [ ] Light/dark mode
- [ ] Keyboard/focus/accessible name
- [ ] Tidak ada horizontal overflow atau target sentuh <44px
- [ ] Owner/member/unauthorized flow sesuai scope

## Data, security, dan rollback

- Dampak data:
- Risiko security/privacy:
- Migration/compatibility:
- Rollback/forward-fix:

## Dokumentasi dan checkpoint

- [ ] Task card memuat `Completed`, `Remaining`, `Resume From`, dan test aktual
- [ ] Contract/runbook/ADR yang benar-benar terdampak diperbarui
- [ ] `PROJECT_STATUS.md` diperbarui hanya bila current state berubah
- [ ] `CHANGELOG.md` diperbarui bila perubahan masuk release history
- [ ] Screenshot UI hanya memakai data dummy
- [ ] `npm run clean:dry-run` ditinjau dan clean ZIP tidak memuat artefak/secret

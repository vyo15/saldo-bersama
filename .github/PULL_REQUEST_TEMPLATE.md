## Ringkasan

- Objective:
- Area terdampak:
- Guarded/high-risk: `Ya / Tidak`

## Validation aktual

```text
npm run check:
npm run test:browser (bila frontend):
test khusus:
```

## Review wajib

- [ ] Diff hanya dalam scope yang disetujui
- [ ] Approval guarded tersedia bila diperlukan
- [ ] Tidak ada secret/data finansial nyata/generated artifact
- [ ] Dampak schema/auth/API/saldo/backup/deployment diperiksa sesuai scope
- [ ] Rollback/forward-fix jelas untuk perubahan berisiko

PR bersifat opsional; workflow default project adalah direct push ke `main` setelah validation PASS.

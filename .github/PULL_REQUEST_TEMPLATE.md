## Ringkasan

- Objective:
- Area terdampak:
- Guarded/high-risk: `Ya / Tidak`

## Dampak contract/test/docs

- Behavior/contract yang berubah:
- Regression test terkait:
- Docs canonical yang diperbarui, atau alasan `N/A`:

## Validation aktual

```text
targeted regression:
npm run verify:
test domain tambahan:
```

## Review wajib

- [ ] Diff hanya dalam scope yang disetujui
- [ ] Approval guarded tersedia bila diperlukan
- [ ] Tidak ada secret/data finansial nyata/generated artifact
- [ ] Dampak schema/auth/API/saldo/backup/deployment diperiksa sesuai scope
- [ ] Regression test menguji behavior/contract, bukan detail implementasi yang rapuh
- [ ] Docs impact sudah diperiksa mengikuti docs/INDEX.md
- [ ] Rollback/forward-fix jelas untuk perubahan berisiko

PR bersifat opsional untuk review kolaboratif. Workflow rutin repository private adalah `git push origin main` dengan managed pre-push fail-closed; bila PR dipakai, tetap tunggu **Quality / check** PASS dan review/approval guarded sesuai risiko.

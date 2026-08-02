# Incident Response

## Severity

- SEV-1: data bocor/rusak, auth bypass, saldo salah luas, restore rollback gagal.
- SEV-2: write finansial utama gagal atau sebagian pengguna terdampak serius.
- SEV-3: integrasi/fitur sekunder gagal tanpa risiko data canonical.
- SEV-4: defect kecil atau hardening.

## Proses

1. Declare severity dan incident commander.
2. Contain: blok write, maintenance, revoke token, atau rollback sesuai bukti.
3. Preserve evidence aman: request ID, commit, timestamps, sanitized logs, integrity output.
4. Diagnose root cause tanpa manual mutation data.
5. Recover melalui patch/restore/forward-fix yang disetujui.
6. Verify saldo, audit, user access, queue, backup, dan monitoring.
7. Communicate status tanpa data sensitif.
8. Postmortem maksimal setelah stabil.

## Postmortem template

```text
Incident:
Severity:
Timeline:
Impact:
Detection:
Root cause:
Contributing factors:
Containment:
Recovery:
Data verification:
What worked:
What failed:
Corrective actions (owner + due date):
Docs/test/runbook updated:
```

Security incident juga mengikuti `SECURITY.md`.

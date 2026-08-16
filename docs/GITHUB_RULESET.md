# GitHub Ruleset Baseline

Dokumen ini mendefinisikan setting repository yang harus diaktifkan di GitHub untuk branch `main`. File source tidak dapat mengaktifkan ruleset GitHub dengan sendirinya; verifikasi pada repository settings tetap diperlukan.

## Target `main`

Aktifkan ruleset/branch protection dengan minimum berikut:

1. Require a pull request before merging.
2. Require status checks to pass before merging.
3. Required check: workflow **Quality**, job `check`.
4. Require branch to be up to date before merging bila opsi repository mendukungnya tanpa menghambat workflow.
5. Block force pushes.
6. Block branch deletion.
7. Jangan izinkan bypass untuk perubahan rutin. Emergency bypass hanya untuk pemilik repository dan harus terdokumentasi.

Dependency Audit adalah scheduled/manual control dan tidak dijadikan required merge check karena bukan per-commit workflow.

## Workflow canonical

```text
branch fix/feat/chore
  -> npm run verify
  -> commit
  -> push branch
  -> Pull Request ke main
  -> Quality PASS
  -> review sesuai CODEOWNERS/risk
  -> merge
  -> main
```

Setelah merge:

```bash
git switch main
git pull origin main
```

## Verification evidence

Simpan bukti tanpa secret:

- ruleset aktif untuk `main`;
- PR required;
- `Quality / check` required;
- force push dan delete diblokir;
- satu PR uji yang gagal Quality tidak dapat di-merge;
- satu PR sehat yang lulus Quality dapat di-merge.

Repository source hanya dapat menyediakan workflow dan policy. Enforcement dianggap selesai hanya setelah setting GitHub diverifikasi.

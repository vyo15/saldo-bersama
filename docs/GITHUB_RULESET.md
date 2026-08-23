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

## Source-side GitHub controls

Repository juga menjaga beberapa kontrol yang tidak bergantung pada ruleset:

- workflow read-only tidak mempertahankan credential checkout setelah source tersedia (`persist-credentials: false`);
- workflow **Quality** membatalkan run lama pada ref yang sama agar PR/main tidak menumpuk validation yang sudah superseded;
- Dependabot memantau dependency npm dan GitHub Actions secara terpisah; update tetap masuk melalui Pull Request dan harus melewati **Quality**;
- workflow memakai permission minimum `contents: read` kecuali ada kebutuhan reviewed yang lebih tinggi.

Kontrol source di atas tidak menggantikan branch protection/ruleset. Ruleset `main` tetap harus diverifikasi langsung di GitHub Settings.

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

## Fail-closed verification

Local `pre-push` hanya quality guard dan **bukan** branch protection. Repository belum boleh diberi status "ruleset selesai" hanya karena `npm run verify` atau pre-push PASS.

Verifikasi di GitHub Settings bahwa direct push ke `main` ditolak. Bukti yang valid:

- ruleset menargetkan branch `main`;
- Pull Request required;
- required status check adalah `Quality / check`;
- force push dan branch deletion diblokir;
- bypass rutin tidak tersedia;
- percobaan perubahan dari branch hanya dapat masuk melalui PR setelah Quality PASS.

Jika `git push origin main` masih diterima untuk perubahan rutin, enforcement belum sesuai dokumen ini walaupun source dan hook lokal sehat. Jangan mencoba force-push untuk menguji protection.

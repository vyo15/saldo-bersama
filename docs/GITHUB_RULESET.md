# GitHub Ruleset Baseline

Repository Saldo Bersama private memakai direct `main` workflow yang dijaga oleh pre-push Auto Quality Guard. File source tidak dapat mengaktifkan ruleset GitHub dengan sendirinya; setting GitHub tetap harus diverifikasi langsung.

## Target `main`

Baseline minimum:

1. Block force pushes.
2. Block branch deletion.
3. Batasi write/bypass hanya ke pemilik repository yang dipercaya.
4. Workflow **Quality** tetap berjalan pada push ke `main` sebagai verification server-side sekunder.
5. Pull Request tidak diwajibkan untuk workflow rutin project ini.

Jangan mengaktifkan rule yang memaksa PR bila tujuan repository adalah mempertahankan workflow `git push origin main` sederhana. Jika suatu hari repository menjadi multi-contributor/public, baseline ini harus dievaluasi ulang.

## Gate source-side

Safety gate sebelum update `main` berada pada managed pre-push hook:

```text
git push origin main
  -> baca ref + SHA aktual dari stdin Git
  -> pastikan branch aktif main
  -> pastikan working tree clean
  -> tolak non-fast-forward/force
  -> npm run verify
  -> PASS baru Git mengirim ref main
```

Hook ini sengaja memverifikasi **ref yang benar-benar dipush**, bukan sekadar working tree aktif. Jangan memakai `git push --no-verify`.

GitHub workflow **Quality** tetap penting untuk mendeteksi perbedaan environment lokal/CI setelah push, tetapi bukan alasan membuat branch/PR rutin pada repository private satu-pengelola ini.

## Verification evidence

Bukti operasional yang disimpan tanpa secret:

- force push dan deletion `main` diblokir;
- workflow Quality berjalan pada push `main`;
- managed pre-push hook terpasang setelah `npm ci`/`npm run dev`;
- percobaan push saat lint/test gagal dibatalkan sebelum ref dikirim;
- percobaan mem-push ref `main` dari branch aktif lain ditolak karena SHA/ref mismatch.

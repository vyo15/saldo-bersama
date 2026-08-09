# Contributing

Repository ini digunakan oleh satu user dengan bantuan beberapa tab/chat ChatGPT.

## Sebelum perubahan

1. Gunakan source terbaru.
2. Baca `AGENTS.md`, `docs/WORKFLOW.md`, dan task card terkait.
3. Pastikan Task ID, branch, dan `Write Scope` jelas.
4. Review source aktual dan buat plan.
5. Coding hanya setelah user approve.

Team hanya:
- `COORD`
- `FE`
- `BE`

Banyak task boleh berjalan paralel selama `Write Scope` tidak overlap.

## Normal task

Setelah changed-files ZIP direplace saat masih di `main`:

```bash
npm run task:finish -- "fix(SB-123): deskripsi perubahan"
```

Tooling otomatis membuat/revisi branch task, melakukan validation, commit, sinkronisasi `main`, merge, push, archive task, lalu kembali ke `main`.

## Guarded/high-risk

Database/schema, auth/authorization, saldo/transfer, API contract, backup/restore, environment/deployment, dependency, dan governance global tetap membutuhkan approval eksplisit.

Task `Guarded=YES` atau Risk `HIGH/CRITICAL` wajib `Guard Approval=APPROVED`. Setelah approval dan local validation PASS, `task:finish` memakai flow yang sama; PR hanya pengecualian bila diminta atau repository rules menolak direct push `main`.

## Scope

- Jangan menyentuh file di luar `Write Scope`.
- Jangan mencampur refactor lain.
- Jangan formatting massal.
- Jangan memasukkan secret, data finansial nyata, build output, atau dependency ke commit.

## Test

Laporkan command yang benar-benar dijalankan. Jangan mengklaim PASS bila tidak dieksekusi.

Ikuti `docs/GIT_WORKFLOW.md` untuk flow Git dan `docs/DEFINITION_OF_DONE.md` untuk kriteria selesai.

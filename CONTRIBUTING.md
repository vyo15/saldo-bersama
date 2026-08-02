# Contributing

## Mulai

1. Baca `AGENTS.md`.
2. Baca `docs/PROJECT_STATUS.md` dan `docs/PROJECT_HANDOFF.md`.
3. Pastikan Node 24.x dan npm 10+.
4. Jalankan `npm ci`, `npm run env:check`, lalu `npm run check`.
5. Buat branch baru dari `main`.

## Branch

Gunakan:

```text
feat/nama-fitur
fix/nama-bug
security/nama-perbaikan
perf/nama-optimasi
docs/nama-dokumen
test/nama-pengujian
chore/nama-pekerjaan
```

Jangan push langsung ke `main`.

## Commit

Gunakan format konsisten:

```text
feat: ...
fix: ...
security: ...
docs: ...
refactor: ...
perf: ...
test: ...
build: ...
ci: ...
chore: ...
```

Commit harus kecil, dapat direview, dan tidak mencampur refactor tidak terkait.

## Kapan membuat RFC atau ADR

Buat RFC sebelum implementasi bila perubahan menyentuh database, auth/role, API contract, saldo, offline mode, backup/restore, integrasi baru, dependency utama, atau deployment. Setelah keputusan diterima, catat hasilnya sebagai ADR.

## Pull request

PR wajib menjelaskan tujuan, scope, file utama, dampak data/saldo/security, migration/env change, hasil test aktual, manual test, docs, dan rollback. Gunakan template repository.

## Definition of Ready dan Done

Pekerjaan hanya dimulai setelah memenuhi `docs/DEFINITION_OF_READY.md` dan baru selesai setelah memenuhi `docs/DEFINITION_OF_DONE.md`.

## Quality gate

```bash
npm run validate:source
npm run lint
npm run test
npm run build
npm run check
git diff --check
```

Jangan commit `.env.local`, `.vercel`, `node_modules`, build output, database dump, backup, export berisi data nyata, token, atau credential.

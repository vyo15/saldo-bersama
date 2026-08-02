# Project Handoff

**Updated:** 2026-08-02  
**Task:** Team Governance & Documentation Foundation  
**Status:** Implemented in source; lihat hasil test pada bagian Validasi.

## Tujuan task

Membuat repository dapat dilanjutkan oleh anggota tim atau ChatGPT lain tanpa mengulang penjelasan dari awal, sekaligus mengurangi mismatch antara kode, kontrak, keputusan, dan dokumentasi.

## Perubahan utama

- Menambah `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, dan `CHANGELOG.md`.
- Menambah code ownership, PR template, dan issue templates.
- Menambah project status/handoff, product requirements, glossary, API/authorization/data contract, governance, ADR/RFC, security, operations, incident, release/rollback, dan log catalog.
- Memperbarui onboarding README/Git workflow serta cross-link docs.
- Menambah test governance agar action, schema table, env key, dan root governance docs tidak hilang atau tidak terdokumentasi.
- Menghapus `PATCH_SUMMARY.txt` sementara dari source clean.

## Guarded area

Task ini tidak mengubah:

- schema Turso;
- auth/role/authorization runtime;
- action/API behavior;
- saldo/transfer/audit/idempotency/row version;
- backup/restore implementation;
- dependency;
- deployment configuration.

## Validasi

Isi hasil aktual setelah command dijalankan:

```text
Runtime pemeriksaan: Node 22.16.0 / npm 10.9.2
Project canonical: Node 24.x / npm >=10

npm run validate:source: LULUS — 218 file; 5/12 Vercel Functions canonical
npm run lint: LULUS — ESLint; syntax Node 50 file; Apps Script 6 file/2 load order
npm run test: LULUS — frontend 27/27; API/database/governance 68/68
npm run build: BELUM TERVERIFIKASI — Rollup Linux optional package tidak tersedia pada node_modules Windows
npm run check: GAGAL pada tahap build setelah validate/lint/test lulus
npm ci: GAGAL — registry pemeriksaan mengembalikan 404 untuk vite-7.3.6.tgz
```

Kegagalan build berasal dari environment pemeriksaan: archive membawa optional binary Rollup Windows, sedangkan registry internal tidak dapat memasang dependency Linux. Build harus diulang pada Node 24 dengan `npm ci` yang berhasil.

## Unresolved

- GitHub ruleset/branch protection harus dikonfigurasi di dashboard.
- Team alias belum ada; `CODEOWNERS` sementara menunjuk `@vyo15`.
- Machine-readable JSON Schema/OpenAPI per payload belum dibuat; kontrak saat ini mendokumentasikan action envelope dan source canonical.
- Environment Development dan Production masih memakai satu Turso database sesuai keputusan aktif.

## Next safe step

Jalankan quality gate pada Node 24, review dokumen untuk nama tim/owner, lalu konfigurasi branch protection. Perubahan arsitektur berikutnya harus melalui RFC.

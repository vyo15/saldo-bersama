# ADR-0010 Vercel Development Environment Bootstrap

**Status:** Accepted
**Date:** 2026-08-02

## Context

Project sering dilanjutkan dari komputer berbeda. Pemindahan `.env.local` manual menyebabkan onboarding lambat, nilai mudah mismatch, dan developer/ChatGPT baru dapat memakai konfigurasi yang salah. Production variables tidak boleh dijadikan file bootstrap yang ditarik secara otomatis.

## Decision

- Vercel Development menjadi source bootstrap lokal bagi collaborator tepercaya.
- `npm run dev` memakai `.env.local` lengkap tanpa network.
- Bila file hilang/tidak lengkap, terminal interaktif menjalankan login, project link, dan `vercel env pull` Development secara otomatis.
- Pull selalu menuju file sementara, disanitasi, divalidasi, lalu dipindahkan atomik ke `.env.local`.
- `VERCEL_OIDC_TOKEN`, key legacy, duplikat, dan grup opsional parsial tidak boleh bertahan.
- File lokal lama dipertahankan ketika proses gagal.
- Non-interactive execution fail closed.
- Vercel Preview tetap kosong.
- Sinkronisasi Development dan Production tetap command terpisah; `npm run dev` tidak pernah menarik Production.

## Consequences

- Komputer baru dapat menjalankan clone lalu `npm run dev` dengan login Vercel satu kali.
- Nama key muncul pada scope Development dan Production; ini disengaja.
- Anggota yang memperoleh akses project Vercel juga dapat menarik Development secrets, sehingga akses project wajib dibatasi.
- Karena database Turso masih tunggal sesuai ADR-0007, aktivitas lokal tetap menyentuh data aktif dan tidak boleh memakai data dummy/destructive operation.

## Alternatives

- Memindahkan `.env.local` manual: ditolak karena mudah mismatch dan berulang.
- Menarik Production environment: ditolak karena boundary secret dan risiko operasi production.
- Menyimpan `.env.local` di Git: ditolak karena kebocoran secret.
- Membuat fallback/dummy environment: ditolak karena dapat mengarahkan write ke target yang tidak diketahui.

## References

- `scripts/bootstrap-development-env.mjs`
- `scripts/bootstrap-development-dependencies.mjs`
- `scripts/push-vercel-development-env.mjs`
- `docs/ENVIRONMENT_VARIABLES.md`
- ADR-0007

# ADR-0010 Vercel Development Environment Bootstrap

**Status:** Accepted
**Date:** 2026-08-02
**Updated:** 2026-09-06

## Context

Project sering dilanjutkan dari komputer berbeda. Pemindahan `.env.local` manual menyebabkan onboarding lambat, nilai mudah mismatch, dan runtime berbeda dapat memakai allowlist, session, integrasi, atau VAPID yang sudah tertinggal. Production variables tidak boleh dijadikan file bootstrap yang ditarik otomatis untuk development.

Web Push memperjelas masalah tersebut. Production sudah memiliki pasangan VAPID, sedangkan satu laptop Development hanya memiliki delapan core key. Karena bootstrap lama berhenti ketika core lengkap, laptop menampilkan status `client_not_configured` meskipun deployment Production sudah dapat memakai Web Push.

## Decision

- Vercel Development menjadi source of truth lokal bagi collaborator tepercaya.
- `npm run dev` pada terminal interaktif selalu **mencoba** refresh dari Vercel Development sebelum server dimulai, termasuk ketika `.env.local` sudah ada.
- Pull selalu menuju file sementara, disanitasi, divalidasi, lalu ditulis atomik ke `.env.local`.
- Development canonical memerlukan delapan core key dan satu grup Web Push lengkap/valid. Google bridge tetap opsional, tetapi bila aktif harus lengkap.
- Database Development/Production sekarang dipisahkan secara fail-closed, sehingga VAPID juga memakai **satu pasangan stabil per environment** dan tidak boleh dibagi lintas Development/Production. Pair tidak pernah dibuat per komputer/perangkat.
- `npm run env:push:development -- --settings-only` tersedia untuk menyinkronkan hanya Web Push dan Google bridge yang aktif, tanpa menyentuh Turso, allowlist, Firebase, atau session.
- `VERCEL_OIDC_TOKEN`, key legacy, duplikat, dan grup opsional parsial tidak boleh bertahan.
- Jika control-plane Vercel tidak tersedia saat login/link/pull tetapi `.env.local` Development yang sudah ada masih lengkap dan valid, `npm run dev` boleh memakai cache lokal tersebut. Runtime tetap fail-closed pada preflight Turso, schema, dan binding sebelum localhost dibuka. Jika cache tidak lengkap atau hasil pull berhasil tetapi konfigurasi Development invalid, server tetap tidak dijalankan.
- Non-interactive execution tidak membuka login/network bootstrap dan hanya menerima `.env.local` yang sudah valid.
- Vercel Preview tetap kosong.
- Sinkronisasi Development dan Production tetap command terpisah; `npm run dev` tidak pernah menarik Production.

## Consequences

- Komputer baru dapat menjalankan clone lalu `npm run dev` setelah login Vercel satu kali tanpa copy/edit `.env.local` manual.
- Perubahan konfigurasi pusat ikut tersinkron pada start berikutnya, sehingga drift antar-PC berkurang.
- Development harus memiliki Web Push sebelum local runtime dianggap siap. Seed awal/rotasi dilakukan sekali dari komputer tepercaya; komputer lain menarik pair Development yang sama dari Vercel Development.
- Google bridge tetap dapat dinonaktifkan. Bila diaktifkan, konfigurasi pusat yang sama melayani Integrasi Google, backup, restore Drive, dan scheduler pada komputer tepercaya.
- Izin notifikasi browser tetap per perangkat dan tidak dapat diberikan otomatis oleh environment bootstrap.
- Nama key muncul pada scope Development dan Production; ini disengaja.
- Member yang memperoleh akses project Vercel dapat menarik Development secrets. Vercel tidak menyediakan mode Sensitive untuk Development, sehingga akses project wajib dibatasi.
- ADR-0007 sekarang historical/superseded. Runtime source mewajibkan Development dan Production terisolasi; data dummy/destructive testing hanya boleh berada pada database Development yang binding-nya `development`.

## Alternatives

- Memindahkan `.env.local` manual: ditolak karena mudah mismatch dan berulang.
- Melewati upaya refresh ketika `.env.local` lengkap: ditolak karena capability baru seperti Web Push dapat tertinggal. Fallback cache hanya berlaku setelah refresh benar-benar tidak tersedia dan tetap melewati preflight Development.
- Menarik Production environment saat `npm run dev`: ditolak karena boundary secret dan risiko operasi production.
- Menyimpan `.env.local` di Git: ditolak karena kebocoran secret.
- Membuat fallback/dummy environment: ditolak karena dapat mengarahkan write ke target yang tidak diketahui. Fallback yang diizinkan hanya cache `.env.local` Development lengkap yang sudah lolos validasi lokal sebelumnya; tidak pernah membuat credential baru atau beralih ke Production.

## References

- `scripts/bootstrap-development-env.mjs`
- `scripts/bootstrap-development-dependencies.mjs`
- `scripts/push-vercel-development-env.mjs`
- `scripts/runtime-environment.mjs`
- `docs/ENVIRONMENT_VARIABLES.md`
- ADR-0007

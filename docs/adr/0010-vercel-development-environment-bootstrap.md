# ADR-0010 Vercel Development Environment Bootstrap

**Status:** Accepted
**Date:** 2026-08-02
**Updated:** 2026-08-17

## Context

Project sering dilanjutkan dari komputer berbeda. Pemindahan `.env.local` manual menyebabkan onboarding lambat, nilai mudah mismatch, dan runtime berbeda dapat memakai allowlist, session, integrasi, atau VAPID yang sudah tertinggal. Production variables tidak boleh dijadikan file bootstrap yang ditarik otomatis untuk development.

Web Push memperjelas masalah tersebut. Production sudah memiliki pasangan VAPID, sedangkan satu laptop Development hanya memiliki delapan core key. Karena bootstrap lama berhenti ketika core lengkap, laptop menampilkan status `client_not_configured` meskipun deployment Production sudah dapat memakai Web Push.

## Decision

- Vercel Development menjadi source of truth lokal bagi collaborator tepercaya.
- `npm run dev` pada terminal interaktif selalu melakukan refresh dari Vercel Development sebelum server dimulai, termasuk ketika `.env.local` sudah ada.
- Pull selalu menuju file sementara, disanitasi, divalidasi, lalu ditulis atomik ke `.env.local`.
- Development canonical memerlukan delapan core key dan satu grup Web Push lengkap/valid. Google bridge tetap opsional, tetapi bila aktif harus lengkap.
- Pasangan VAPID Development harus sama dengan Production **hanya selama** kedua runtime masih memakai database subscription Turso yang sama. Setelah database Development terisolasi, VAPID dapat dipisahkan/dirotasi per environment melalui workflow reviewed.
- `npm run env:push:development:settings` tersedia untuk menyinkronkan hanya Web Push dan Google bridge yang aktif, tanpa menyentuh Turso, allowlist, Firebase, atau session.
- `VERCEL_OIDC_TOKEN`, key legacy, duplikat, dan grup opsional parsial tidak boleh bertahan.
- File lokal lama dipertahankan ketika refresh gagal, tetapi interactive `npm run dev` tetap fail closed dan server tidak dijalankan dengan konfigurasi yang belum terverifikasi terhadap Development terbaru.
- Non-interactive execution tidak membuka login/network bootstrap dan hanya menerima `.env.local` yang sudah valid.
- Vercel Preview tetap kosong.
- Sinkronisasi Development dan Production tetap command terpisah; `npm run dev` tidak pernah menarik Production.

## Consequences

- Komputer baru dapat menjalankan clone lalu `npm run dev` setelah login Vercel satu kali tanpa copy/edit `.env.local` manual.
- Perubahan konfigurasi pusat ikut tersinkron pada start berikutnya, sehingga drift antar-PC berkurang.
- Development harus memiliki Web Push sebelum local runtime dianggap siap. Seed awal dilakukan dari komputer tepercaya yang masih memiliki pasangan VAPID canonical.
- Google bridge tetap dapat dinonaktifkan. Bila diaktifkan, konfigurasi pusat yang sama melayani Integrasi Google, backup, restore Drive, dan scheduler pada komputer tepercaya.
- Izin notifikasi browser tetap per perangkat dan tidak dapat diberikan otomatis oleh environment bootstrap.
- Nama key muncul pada scope Development dan Production; ini disengaja.
- Member yang memperoleh akses project Vercel dapat menarik Development secrets. Vercel tidak menyediakan mode Sensitive untuk Development, sehingga akses project wajib dibatasi.
- Selama exit criteria ADR-0007 belum terbukti, aktivitas lokal masih menyentuh data aktif dan tidak boleh memakai data dummy/destructive operation. Setelah Development memakai database terpisah dan evidence cutover disimpan, data dummy hanya boleh berada di database Development.

## Alternatives

- Memindahkan `.env.local` manual: ditolak karena mudah mismatch dan berulang.
- Memakai `.env.local` tanpa refresh bila core lengkap: ditolak karena capability baru seperti Web Push dapat tertinggal pada komputer lama.
- Menarik Production environment saat `npm run dev`: ditolak karena boundary secret dan risiko operasi production.
- Menyimpan `.env.local` di Git: ditolak karena kebocoran secret.
- Membuat fallback/dummy environment: ditolak karena dapat mengarahkan write ke target yang tidak diketahui.

## References

- `scripts/bootstrap-development-env.mjs`
- `scripts/bootstrap-development-dependencies.mjs`
- `scripts/push-vercel-development-env.mjs`
- `scripts/runtime-environment.mjs`
- `docs/ENVIRONMENT_VARIABLES.md`
- ADR-0007

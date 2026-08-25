# RFC-0016 Partner Planning Permissions

**Status:** Accepted, implemented
**Owner:** Product owner + security owner
**Reviewers:** Backend, frontend, QA
**Date:** 2026-08-02
**Decision date:** 2026-08-19

## Problem

Kebutuhan produk menyebut pasangan dapat mengelola rencana bersama, sedangkan runtime lama membuat `member` hanya operator dari rencana Administrator.

## Decision

Dipilih model **shared + own-personal**: Member dapat mengelola planning harian pada ruang Bersama dan rekening personal miliknya sendiri, sementara Target baru tetap merupakan rencana Bersama.

Member diizinkan untuk:

- membuat Alokasi Dana shared atau personal yang sumbernya rekening personal miliknya sendiri;
- menambah/melepas dana Alokasi Dana shared yang dapat diakses;
- memindahkan alokasi Jatah Bersama atau jatahnya sendiri dan membalik movement miliknya;
- membuat/mengubah Kebutuhan shared atau personal miliknya sendiri;
- membuat/mengubah Target shared serta melakukan/reverse movement yang memang diizinkan; Target baru tidak dapat dibuat personal;
- membuat/mengubah Jadwal Rutin shared atau personal miliknya sendiri serta pay/reverse occurrence yang memang diizinkan.

Tetap Administrator-only:

- rekening dan kategori master;
- user management dan authorization;
- archive/delete-unused/restore planning serta skip/restore occurrence;
- tutup/buka periode;
- import, backup, restore, reset, integrity, schema, dan maintenance;
- operasi personal milik pengguna lain.

## Enforcement

Frontend hanya menyembunyikan atau menampilkan aksi berdasarkan capability. Backend tetap boundary keamanan. Service planning memanggil scope guard server-side dan hanya menerima `shared` atau `personal` dengan `owner_user_id` sama dengan actor pada capability yang memang mengizinkan own-personal. Actor, role, owner, email, dan audit identity tidak dipercaya dari client. Default authorization tetap deny.

Alokasi Dana mempertahankan guard `assignee_user_id`: Member hanya dapat memakai Jatah Bersama atau jatahnya sendiri. Rekening sumber tetap harus operable dan account-bound.

## Test and acceptance criteria

- Member berhasil create/update planning shared serta Alokasi/Kebutuhan/Jadwal Rutin personal miliknya sendiri yang diizinkan.
- Member berhasil membuat Alokasi/Kebutuhan/Jadwal Rutin personal miliknya sendiri, tetapi gagal mengubah planning personal pasangan dan gagal membuat Target personal baru.
- Destructive lifecycle dan recovery tetap Administrator-only.
- `row_version`, idempotency, audit, account ownership, dan scope validation tetap berlaku.
- API contract, authorization matrix, frontend capability, dan backend permission set konsisten.

## Risks

Broken access control menjadi risiko utama. Setiap perluasan action baru harus mengulang negative authorization test dan tidak boleh mengandalkan `scope` yang dikirim browser tanpa validasi terhadap rekening/entity server.
## Amendment 2026-08-25 — planning personal milik Member

Keputusan produk terbaru memperluas operasi harian Member: `envelopes.*` yang non-destruktif, `budgets.upsert`, dan `recurring.*` yang non-destruktif boleh memakai scope personal hanya ketika `owner_user_id` sama dengan actor dan rekening sumber/default memang dapat dioperasikan actor. Rekening/planning personal pasangan tetap read-only bagi Member.

Target baru tetap wajib memakai rekening Bersama. Lifecycle destruktif planning tetap Administrator-only. Frontend memakai capability untuk pilihan rekening, sedangkan backend selalu memvalidasi ulang ownership, assignee, row version, idempotency, dan saldo/dana tersedia. Amendment ini menggantikan amendment 2026-08-22 yang hanya membuka Kebutuhan personal.


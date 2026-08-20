# RFC-0016 Partner Planning Permissions

**Status:** Accepted, implemented  
**Owner:** Product owner + security owner  
**Reviewers:** Backend, frontend, QA  
**Date:** 2026-08-02  
**Decision date:** 2026-08-19

## Problem

Kebutuhan produk menyebut pasangan dapat mengelola rencana bersama, sedangkan runtime lama membuat `member` hanya operator dari rencana Administrator.

## Decision

Dipilih **Option 2: Member dapat mengelola planning hanya untuk scope shared**.

Member diizinkan untuk:

- membuat Alokasi Dana shared;
- menambah/melepas dana Alokasi Dana shared yang dapat diakses;
- memindahkan alokasi Jatah Bersama atau jatahnya sendiri dan membalik movement miliknya;
- membuat/mengubah Kebutuhan shared;
- membuat/mengubah Target shared serta melakukan/reverse movement yang memang diizinkan;
- membuat/mengubah Jadwal Rutin shared serta pay/reverse occurrence yang memang diizinkan.

Tetap Administrator-only:

- rekening dan kategori master;
- user management dan authorization;
- archive/delete-unused/restore planning serta skip/restore occurrence;
- tutup/buka periode;
- import, backup, restore, reset, integrity, schema, dan maintenance;
- operasi personal milik pengguna lain.

## Enforcement

Frontend hanya menyembunyikan atau menampilkan aksi berdasarkan capability. Backend tetap boundary keamanan. Service planning memanggil scope guard server-side dan menolak Member bila object/payload bukan `shared` atau membawa `owner_user_id`. Actor, role, owner, email, dan audit identity tidak dipercaya dari client. Default authorization tetap deny.

Alokasi Dana mempertahankan guard `assignee_user_id`: Member hanya dapat memakai Jatah Bersama atau jatahnya sendiri. Rekening sumber tetap harus operable dan account-bound.

## Test and acceptance criteria

- Member berhasil create/update planning shared yang diizinkan.
- Member gagal membuat planning personal atau mengubah milik pasangan.
- Destructive lifecycle dan recovery tetap Administrator-only.
- `row_version`, idempotency, audit, account ownership, dan scope validation tetap berlaku.
- API contract, authorization matrix, frontend capability, dan backend permission set konsisten.

## Risks

Broken access control menjadi risiko utama. Setiap perluasan action baru harus mengulang negative authorization test dan tidak boleh mengandalkan `scope` yang dikirim browser tanpa validasi terhadap rekening/entity server.

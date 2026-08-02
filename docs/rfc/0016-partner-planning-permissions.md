# RFC-0016 Partner Planning Permissions

**Status:** Proposed  
**Owner:** Product owner + security owner  
**Reviewers:** Backend, frontend, QA  
**Date:** 2026-08-02

## Problem

Dokumen kebutuhan menyebut Partner dapat mengelola anggaran/target bersama, sedangkan role runtime `member` tidak dapat membuat/mengubah envelope rule, budget, goal, recurring rule, atau master data.

## Goals

- Putuskan capability pasangan secara eksplisit tanpa privilege escalation.
- Pertahankan owner-only untuk recovery, anggota, auth, schema, import/restore, dan destructive maintenance.

## Alternatives

1. Pertahankan member read/move/pay saja.
2. Izinkan member manage planning hanya untuk scope shared.
3. Tambah capability/permission table terpisah dari role.

## Proposed solution

Belum dipilih. Prefer capability matrix server-side daripada conditional UI. Setiap action yang dibuka wajib ownership/scope guard, audit, conflict test, dan negative authorization test.

## Test and acceptance criteria

- Default deny tetap berlaku.
- Member tidak dapat mengubah personal milik pengguna lain.
- Recovery/admin tetap owner-only.
- Frontend dan backend matrix konsisten.

## Risks

Broken access control dan perubahan ekspektasi pasangan.

## Decision

Pending keputusan owner aplikasi.

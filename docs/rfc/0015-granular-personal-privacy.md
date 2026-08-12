# RFC-0015 Granular Personal Account Privacy

**Status:** Proposed  
**Owner:** Security/privacy owner  
**Reviewers:** Backend, frontend, product, QA  
**Date:** 2026-08-02

## Problem

Schema v3 hanya shared/personal. Kebutuhan meminta full detail, balance-only, contribution-only, atau private penuh. Menyembunyikan UI saja tetap membocorkan response API.

## Goals

- Authorization dan projection backend per account/data class.
- Administrator/Member memahami apa yang terlihat tanpa inferensi saldo/detail yang tidak diizinkan.
- Mirror/export/backup mengikuti policy.

## Proposed solution

Policy entity atau field visibility versioned dengan server-side read models. Query detail, aggregate, reports, notifications, export, mirror, audit viewer, dan backup restore wajib memiliki matrix yang sama. Default deny; policy change audited.

## Test and acceptance criteria

- Detail yang dibatasi tidak pernah dikirim ke browser.
- Aggregate tidak memungkinkan rekonstruksi mudah dari endpoint lain.
- Export/mirror mematuhi policy.
- Akses emergency/recovery Administrator diputuskan eksplisit.

## Risks

Inference attack, inconsistent projection, dan confusing UX.

## Baseline yang sudah dipilih

Untuk runtime saat ini, dua pengguna terotorisasi memakai transparansi penuh pada rekening dan ledger: shared maupun personal dapat dibaca keduanya dengan label pemilik. Hak transaksi, rekonsiliasi, edit, dan cancel tetap dibatasi backend berdasarkan ownership/capability. Sheets mirror tetap shared-only.

RFC ini tetap Proposed hanya untuk mode granular tambahan seperti balance-only, contribution-only, atau private penuh. Mode tersebut belum diimplementasikan.

## Decision

Pending untuk policy granular di luar baseline transparansi dua pengguna.

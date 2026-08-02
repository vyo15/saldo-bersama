# RFC-0015 Granular Personal Account Privacy

**Status:** Proposed  
**Owner:** Security/privacy owner  
**Reviewers:** Backend, frontend, product, QA  
**Date:** 2026-08-02

## Problem

Schema v3 hanya shared/personal. Kebutuhan meminta full detail, balance-only, contribution-only, atau private penuh. Menyembunyikan UI saja tetap membocorkan response API.

## Goals

- Authorization dan projection backend per account/data class.
- Owner/member memahami apa yang terlihat tanpa inferensi saldo/detail yang tidak diizinkan.
- Mirror/export/backup mengikuti policy.

## Proposed solution

Policy entity atau field visibility versioned dengan server-side read models. Query detail, aggregate, reports, notifications, export, mirror, audit viewer, dan backup restore wajib memiliki matrix yang sama. Default deny; policy change audited.

## Test and acceptance criteria

- Detail yang dibatasi tidak pernah dikirim ke browser.
- Aggregate tidak memungkinkan rekonstruksi mudah dari endpoint lain.
- Export/mirror mematuhi policy.
- Owner emergency/recovery access diputuskan eksplisit.

## Risks

Inference attack, inconsistent projection, dan confusing UX.

## Decision

Pending privacy policy product dan security review.

# RFC-0013 Contribution and Cost Sharing

**Status:** Proposed  
**Owner:** Product owner  
**Reviewers:** Backend, privacy/security, frontend, QA  
**Date:** 2026-08-02

## Problem

`created_by` hanya actor pencatat. Ia tidak menjelaskan siapa memakai uang, membayar, menanggung, atau berkontribusi. Laporan saat ini sengaja menyebut “aktivitas pencatatan”, bukan kontribusi.

## Goals

- Mendukung split 50:50, persentase pendapatan, nominal tetap, dan tanggung jawab tertentu.
- Memisahkan payer, beneficiary, recorder, dan liable party.
- Tidak mengubah saldo ledger ketika hanya mengubah pembagian analitis.

## Proposed solution

Entitas kandidat `transaction_participants` dan `cost_splits` dengan role participant, share integer/percentage normalized, scope, version, audit. Aturan split template dapat diterapkan saat create tetapi snapshot split disimpan agar histori tidak berubah ketika template diedit.

## Impact

Laporan kontribusi nyata, dashboard pasangan, target contribution, recurring assignee, privacy projection. API dan authorization baru; migration additive; export/backup diperluas.

## Test and acceptance criteria

- Total split tepat 100% atau sama dengan nominal transaksi.
- Rounding Rupiah deterministik.
- `created_by` tidak pernah dipakai sebagai fallback kontribusi tanpa label eksplisit.
- Edit/cancel menjaga audit dan historical snapshot.

## Risks

Konflik relasi personal, false precision, dan UX yang terasa mengawasi.

## Decision

Pending product decision tentang default split dan visibility.

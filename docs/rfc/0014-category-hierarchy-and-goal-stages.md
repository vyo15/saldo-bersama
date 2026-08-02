# RFC-0014 Category Hierarchy and Goal Stages

**Status:** Proposed  
**Owner:** Product owner + data owner  
**Reviewers:** Backend, reports, import/export, QA  
**Date:** 2026-08-02

## Problem

Kategori saat ini datar dan target hanya satu nominal. Kebutuhan meminta group kebutuhan serta tahap renovasi/material/upah tanpa merusak laporan lama.

## Goals

- Parent/subcategory tanpa cycle.
- Roll-up laporan tetap deterministik.
- Goal dapat memiliki tahap dengan target dan progres, sementara total goal tetap konsisten.

## Proposed solution

Pertimbangkan `parent_category_id` self-reference dengan depth limit atau tabel closure; `goal_stages` dengan target integer, order, status, version, dan movement allocation. Existing category/goal tetap root/default stage.

## Test and acceptance criteria

- Cycle dan cross-transaction-type parent ditolak.
- Roll-up tidak menghitung transaksi dua kali.
- Jumlah target stage konsisten dengan target goal menurut policy yang disetujui.
- Import/export/backup kompatibel.

## Risks

Query report lebih kompleks, migration taxonomy, dan UI terlalu ramai.

## Decision

Pending pilihan hierarchy model dan stage-total policy.

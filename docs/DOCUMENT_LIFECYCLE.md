# Document Lifecycle

| Status | Arti | Perlakuan |
|---|---|---|
| Canonical | Sumber aturan/kontrak aktif | Diperbarui bersama source terdampak dan dijaga drift test. |
| Snapshot | Kondisi project saat ini | Ringkas; diganti saat current state berubah. |
| Runbook | Prosedur operasional | Diuji saat drill/perubahan tooling; langkah berbahaya fail-closed. |
| Historical | Catatan keputusan/proses selesai | Dipertahankan bila berguna untuk audit/history; Git/CHANGELOG adalah histori utama. |
| Template | Kerangka dokumen baru | Tidak boleh berisi status project aktual. |

## Klasifikasi

- Canonical: architecture, contracts, security model, environment, schema, data dictionary, UI design system, `WORKFLOW.md`, `GIT_WORKFLOW.md`, dan contribution policy.
- Snapshot: `PROJECT_STATUS.md` dan `IMPLEMENTATION_MATRIX.md`.
- Runbook: deployment, release, rollback, recovery, incident, operations, legacy cutover.
- Historical: ADR/RFC superseded dan `docs/tasks/archive/` dari workflow lama. Archive task tidak lagi mengontrol delivery saat ini.
- Template: template RFC dan dokumen template lain yang masih dipakai.

## Aturan perubahan

1. Source aktual mengalahkan snapshot yang tertinggal; drift diperbaiki.
2. `PROJECT_STATUS.md` menjawab kondisi sekarang, bukan kronologi commit.
3. `CHANGELOG.md` dan Git menyimpan history perubahan.
4. Dokumen canonical tidak dihapus tanpa memigrasikan contract yang masih relevan.
5. Historical evidence yang berguna untuk audit/migration/recovery/arsitektur tidak dihapus hanya untuk merapikan folder.
6. `docs/INDEX.md` wajib menunjuk dokumen canonical dan lifecycle ini.
7. Governance test memastikan reference Markdown penting dan workflow direct-Git tidak drift.

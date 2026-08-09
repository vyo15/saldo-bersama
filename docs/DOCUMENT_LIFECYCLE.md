# Document Lifecycle

Dokumen project memakai status berikut agar informasi lama tidak terlihat sebagai kontrak aktif.

| Status | Arti | Perlakuan |
|---|---|---|
| Canonical | Sumber aturan/kontrak aktif | Wajib diperbarui bersama source yang terdampak dan dijaga test drift. |
| Snapshot | Kondisi project saat ini | Ringkas, tidak menjadi jurnal histori, diganti saat current state berubah. |
| Runbook | Prosedur operasional | Harus diuji saat drill/perubahan tooling; langkah berbahaya wajib fail closed. |
| Historical | Catatan keputusan/proses selesai | Dipertahankan hanya bila masih berguna untuk audit/history; Git/CHANGELOG menjadi histori utama perubahan biasa. |
| Template | Kerangka dokumen baru | Tidak boleh berisi status project aktual. |

## Klasifikasi saat ini

- Canonical: architecture, contracts, security model, environment, schema, data dictionary, UI design system, `WORKFLOW.md`, Git workflow, contribution policy, dan `tasks/README.md`.
- Snapshot: `PROJECT_STATUS.md` dan `IMPLEMENTATION_MATRIX.md`.
- Task record aktif: `tasks/active/SB-xxx.md`; setelah `DONE` menjadi historical record di `tasks/archive/`.
- Runbook: deployment, release, rollback, recovery, incident, operations, legacy cutover.
- Historical: ADR yang superseded, RFC/keputusan lama, dan task archive. Jangan membuat snapshot global handoff baru.
- Template: seluruh file di `docs/templates/` dan template RFC.

## Aturan perubahan

1. Source aktual selalu mengalahkan snapshot yang tertinggal; drift harus dijelaskan dan diperbaiki.
2. `PROJECT_STATUS.md` hanya menjawab kondisi sekarang, bukan menyalin kronologi task.
3. Progress/handoff pekerjaan disimpan pada task card masing-masing untuk mencegah shared-file conflict.
4. `CHANGELOG.md` menyimpan release history; Git/PR menyimpan detail diff. Jangan menduplikasi histori lengkap ke status snapshot.
5. Dokumen canonical tidak boleh dihapus tanpa memigrasikan contract/aturan yang masih relevan.
6. Dokumen historical yang menjadi bukti audit, migration, recovery, atau keputusan arsitektur tidak boleh dihapus hanya untuk merapikan folder.
7. `docs/INDEX.md` wajib menunjuk dokumen canonical dan lifecycle ini.
8. Governance test wajib memastikan local Markdown reference penting tidak rusak dan workflow/task tooling tetap sinkron.

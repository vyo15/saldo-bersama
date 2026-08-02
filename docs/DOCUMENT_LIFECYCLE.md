# Document Lifecycle

Dokumen project memakai lima status agar informasi lama tidak terlihat sebagai kontrak aktif.

| Status | Arti | Perlakuan |
|---|---|---|
| Canonical | Sumber aturan aktif | Wajib diperbarui bersama source yang terdampak dan dijaga test link/drift. |
| Snapshot | Status pada tanggal tertentu | Wajib mencantumkan tanggal dan diganti saat task berikutnya selesai. |
| Runbook | Prosedur operasional | Harus diuji saat drill/perubahan tooling; langkah berbahaya wajib fail closed. |
| Historical | Catatan keputusan/proses selesai | Dipindahkan ke `docs/archive/` setelah tidak lagi menjadi prerequisite aktif. |
| Template | Kerangka dokumen baru | Tidak boleh berisi status project aktual. |

## Klasifikasi saat ini

- Canonical: architecture, contracts, security model, environment, schema, data dictionary, UI design system, Git workflow, contribution policy.
- Snapshot: `PROJECT_STATUS.md`, `PROJECT_HANDOFF.md`, `IMPLEMENTATION_MATRIX.md`.
- Runbook: deployment, release, rollback, recovery, incident, operations, legacy cutover.
- Historical: dokumen cutover hanya boleh diarsipkan setelah parity, cutover, retention approval, dan restore drill selesai.
- Template: seluruh file di `docs/templates/` dan template RFC.

## Aturan perubahan

1. Source aktual selalu mengalahkan snapshot yang tertinggal; drift harus dijelaskan dan diperbaiki pada patch yang sama.
2. Dokumen canonical tidak boleh dihapus hanya untuk menghilangkan broken link.
3. Dokumen historical tidak boleh dihapus bila masih menjadi bukti audit, migration, atau recovery.
4. `docs/INDEX.md` wajib menunjuk dokumen canonical dan lifecycle ini.
5. Test governance wajib memastikan semua link Markdown lokal valid.

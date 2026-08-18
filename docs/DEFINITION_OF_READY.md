# Definition of Ready

Perubahan siap dikerjakan bila:

- objective dan acceptance criteria jelas;
- area source yang terdampak sudah diidentifikasi;
- source terbaru dan path aktual sudah diperiksa;
- dependency dan kemungkinan overlap perubahan sudah dinilai;
- risiko terhadap auth, authorization, data finansial, schema, migration, backup/restore, integration, dan destructive action sudah dinilai;
- validation yang diperlukan sudah ditentukan;
- perubahan guarded sudah melalui source review;
- plan sudah disetujui user bila approval diperlukan.

Branch dan Pull Request bukan prasyarat **Definition of Ready**, tetapi perubahan yang akan masuk `main` tetap mengikuti delivery workflow canonical repository: branch, Pull Request, dan Quality gate. Task card lintas-agent sudah dipensiunkan dan bukan requirement aktif.

Perubahan guarded tetap membutuhkan approval eksplisit setelah source review.

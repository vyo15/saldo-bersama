# Patch Manifest Template

> **Status:** Template  
> **Purpose:** Metadata handoff untuk patch changed-files-only agar final merger dapat menggabungkan beberapa patch tanpa overwrite buta.  
> **Boundary:** Manifest adalah metadata handoff, bukan runtime source dan tidak ikut final merge ke aplikasi.

Gunakan template ini untuk setiap patch paralel/ChatGPT. Isi berdasarkan evidence aktual; jangan menulis `PASS` untuk command yang tidak dijalankan.

```text
Patch: <nama singkat>
Scope: <satu masalah/fitur utama>
Base: <branch + commit/SHA bila Git tersedia; jika clean ZIP tanpa Git, tulis nama source ZIP + fingerprint yang tersedia>

Changed:
- path/file-yang-diubah

Added:
- path/file-baru

Deleted / Renamed:
- none

Cleanup Git Bash:
- Tidak ada.
# atau, setelah usage audit:
# rm -f path/file-lama.js
# rm -rf path/folder-lama

Touches:
- <domain/contract yang benar-benar disentuh>

Does not touch:
- <schema/auth/API contract/dll yang sengaja tidak disentuh>

Overlap notes:
- <file/contract yang mungkin juga disentuh patch lain, atau none>

Validation:
- targeted: PASS <command / jumlah test>
- lint: PASS | NOT RUN <alasan environment>
- verify: PASS | NOT RUN <alasan environment>

Status:
- FINAL / VERIFIED
# atau
- CANDIDATE / UNVERIFIED
```

## Aturan merge

1. Project terbaru saat integrasi adalah source of truth.
2. Baca manifest + diff/intention patch; jangan extract beberapa ZIP dengan overwrite berurutan.
3. Jika file overlap, gabungkan behavior/contract yang masih relevan terhadap source terbaru.
4. Jika perubahan patch sudah ada atau superseded oleh implementasi terbaru, jangan dipaksakan masuk.
5. Terapkan cleanup command hanya setelah memastikan path lama memang obsolete pada project terbaru.
6. Jalankan targeted regression setelah kelompok overlap; setelah semua patch masuk jalankan `npm run lint` lalu `npm run verify`.

## Format handoff singkat

Final response pembuat patch mengikuti urutan tetap:

```text
Artifact
<nama ZIP>

Cleanup Git Bash
<command atau Tidak ada>

Validation
<evidence aktual>

Tidak disentuh
<boundary penting>

Status
FINAL / VERIFIED atau CANDIDATE / UNVERIFIED
```

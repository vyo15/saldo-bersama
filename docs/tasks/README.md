# Task Registry

Task registry adalah memory ringan agar beberapa tab ChatGPT tidak mengerjakan area yang sama tanpa sadar.

## Struktur

```text
docs/tasks/
├── active/
│   └── SB-xxx.md
└── archive/
    └── SB-xxx.md
```

## Aturan

- Satu task = satu Task ID + satu branch.
- Team hanya `COORD`, `FE`, atau `BE`.
- Banyak task boleh `IN_PROGRESS` sekaligus.
- `Write Scope` task `APPROVED`/`IN_PROGRESS` tidak boleh overlap.
- Dependency ditulis hanya bila benar-benar diperlukan.
- Task `DONE` dipindah ke archive.
- Tidak perlu board Markdown global.

Lihat kondisi task:

```bash
npm run task:list
```

Validasi branch/scope:

```bash
npm run task:check
```

Selesaikan normal task:

```bash
npm run task:finish -- "fix(SB-123): deskripsi perubahan"
```

Guarded/HIGH/CRITICAL wajib Guard Approval APPROVED sebelum `task:finish`; setelah approved flow tetap satu command. PR hanya pengecualian.

## Membuat task

1. Ambil ID `SB-xxx` berikutnya.
2. Copy `docs/templates/TASK_TEMPLATE.md`.
3. Isi field minimal.
4. Isi `Write Scope` sesempit yang masuk akal.
5. Review source dan plan.
6. Setelah user approve, ubah status ke `APPROVED`/`IN_PROGRESS`.
7. Changed-files boleh direplace saat masih di `main`; `task:finish` membuat branch task otomatis sebelum commit/validation.

## ON_HOLD

Gunakan `ON_HOLD` hanya bila task benar-benar berhenti. Isi `Hold Reason`, `Resume Condition`, dan `Resume From`.

## Close

Normal task ditutup otomatis oleh `task:finish` setelah `main` berhasil dipush.

Guarded task yang sudah memiliki approval eksplisit ditutup otomatis oleh `task:finish` setelah validation PASS dan `main` berhasil dipush; COORD tetap melakukan review hasil dan rekomendasi next step.

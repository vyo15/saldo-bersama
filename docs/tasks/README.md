# Task Registry

Folder ini adalah shared memory pekerjaan Saldo Bersama. Satu pekerjaan penting harus memiliki satu task card `SB-xxx` agar dapat dilanjutkan oleh chat, perangkat, atau team lain tanpa mengandalkan percakapan lama.

## Struktur

```text
docs/tasks/
├── README.md
├── active/
│   └── SB-xxx.md
└── archive/
    └── SB-xxx.md
```

- `active/`: semua task yang belum `DONE`.
- `archive/`: task yang sudah `DONE` setelah integration/post-merge verification.
- Jangan membuat satu board Markdown global yang harus diedit setiap team. Gunakan `npm run task:list` untuk membentuk ringkasan langsung dari task card sehingga tidak ada shared-file conflict.

## Membaca kondisi project

```bash
npm run task:list
```

Output menampilkan:

- `IN_PROGRESS` per team;
- task `APPROVED` yang dependency-nya sudah clear;
- task `ON_HOLD` dan apa yang ditunggunya;
- task yang dependency-nya sudah selesai dan bisa direview untuk resume;
- `READY_FOR_QA`;
- `READY_FOR_MERGE`;
- work package;
- derived `Blocks`;
- recommended next.

## Membuat task

1. Ambil nomor `SB-xxx` berikutnya tanpa memakai ulang ID archive.
2. Copy `../templates/TASK_TEMPLATE.md` ke `active/SB-xxx.md`.
3. Isi owner, status, priority, work package, branch, baseline, dependency, guarded assessment, acceptance criteria, dan write scope.
4. `Write Scope` hanya berisi source/docs yang memang boleh diubah. Task card milik task tersebut otomatis diizinkan oleh validator, jadi jangan menambahkan `docs/tasks/**` ke semua task karena akan membuat ownership overlap palsu.
5. Review source dan plan.
6. Gunakan `READY` ketika plan siap direview.
7. Setelah user menyetujui, ubah ke `APPROVED`.
8. Mulai patch hanya setelah preflight valid, lalu ubah ke `IN_PROGRESS`.

## Dependency

`Depends On` adalah satu-satunya sumber dependency yang ditulis manual. `Blocks` dihitung otomatis. Nilai menggunakan daftar Task ID dipisahkan koma atau `NONE`.

Contoh:

```text
Depends On: SB-101, SB-102
```

Task dependency dianggap selesai hanya bila task tersebut `DONE` di archive. Task `READY_FOR_MERGE` belum dianggap selesai.

## Parent dan work package

`Work Package` adalah label fitur yang mudah dibaca, misalnya `LOGIN`, `REKENING`, `TRANSAKSI`, atau `NOTIFIKASI`.

`Parent` memakai Task ID atau `NONE`. Bila child wajib selesai sebelum parent boleh ditutup, isi `Required For Parent` dengan `YES`. Child optional memakai `NO`.

## ON_HOLD

Task `ON_HOLD` wajib memiliki:

- `Hold Reason`;
- `Resume Condition`;
- checkpoint `Resume From`.

Task tidak pernah auto-close karena umur. Lebih dari 72 jam hanya memicu freshness warning dan revalidation.

## Menutup task

1. QA dan integration gate selesai.
2. Task `READY_FOR_MERGE` diintegrasikan.
3. Post-merge verification dilakukan.
4. Status diubah ke `DONE`.
5. `COORD` memindahkan file dari `active/` ke `archive/`.
6. `PROJECT_STATUS.md` dan `CHANGELOG.md` diperbarui hanya bila current project state/release history memang berubah.

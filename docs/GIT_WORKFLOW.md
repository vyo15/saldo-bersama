# Git Workflow

Git dibuat sesederhana mungkin untuk satu user + beberapa tab ChatGPT.

## Prinsip

- `main` = versi resmi.
- satu task = satu branch.
- banyak task boleh paralel selama Write Scope tidak overlap.
- normal task tidak perlu PR.
- guarded/HIGH/CRITICAL tetap membutuhkan approval eksplisit, tetapi tidak wajib PR setelah approval.

## Flow harian: replace dulu

User tidak perlu membuat atau pindah branch sebelum replace. Pola canonical:

```text
main
 -> extract changed-files ZIP
 -> Replace files in destination
 -> task:finish
 -> helper membuat branch task otomatis
 -> validation + merge + push
 -> kembali ke main
```

Setelah changed-files ZIP di-replace saat masih di `main`, cukup satu command:

```bash
npm run task:finish -- "fix(SB-123): deskripsi perubahan"
```

Tidak perlu menghafal `git switch`, `git add`, `commit`, `push`, `pull`, atau merge manual. Jika dijalankan dari `main`, script membaca Task ID dari commit message, membuat branch sesuai task card, dan membawa working tree hasil replace ke branch tersebut sebelum validation.

Jika nama branch task sudah terpakai oleh percobaan sebelumnya, helper otomatis memakai revision aman seperti `-r2`/`-r3` dan memperbarui task card. Setelah task benar-benar DONE dan main berhasil dipush, branch percobaan lama untuk Task ID yang sama dibersihkan otomatis.

Jika ada file lama yang memang harus dihapus, ChatGPT memberi `rm -f ...` sebelum `task:finish`, misalnya:

```bash
rm -f docs/OLD_FILE.md && npm run task:finish -- "chore(SB-123): rapikan workflow"
```

## Apa yang dilakukan task:finish

Normal task:

```text
detect task from commit message
 -> create/revision task branch from current working tree
 -> save commit
 -> integrate origin/main
 -> npm run check + test:guard
 -> FE: test:browser
 -> push task branch
 -> merge ke main
 -> push main
 -> normalisasi closure metadata + archive task
 -> delete branch
 -> npm run zip otomatis
```

Jika `main` berubah selama proses, branch task di-update dan check diulang. Jika ada conflict, proses berhenti di branch task dan `main` tetap aman.

Jika repository rules menolak direct push `main` atau remote berubah pada saat terakhir, helper mengembalikan `main` lokal ke `origin/main`, kembali ke branch task, dan berhenti aman. Jalankan command yang sama lagi setelah kondisi stabil. PR hanya digunakan sebagai pengecualian bila repository memang mewajibkannya atau user meminta review tambahan.



Saat task berhasil ditutup, helper juga memastikan archive tidak menyimpan state basi: Acceptance Criteria menjadi checked, `Remaining` dan `Resume From` menjadi state selesai, dan `Validation Actually Run` diganti dengan evidence canonical yang benar-benar dijalankan oleh `task:finish`. Validator menolak archive `DONE` yang masih memiliki checklist kosong, pekerjaan tersisa aktif, atau `NOT_RUN`.

Guarded/HIGH/CRITICAL memakai command yang sama setelah `Guard Approval=APPROVED`. Tidak ada command Git tambahan yang perlu dihafal. Setelah main berhasil dipush, helper juga menjalankan `npm run zip` otomatis agar source terbaru siap di-upload ke ChatGPT.

## Multi-tab

Tidak perlu worktree untuk pola penggunaan normal karena ChatGPT menghasilkan patch/ZIP secara independen dan user memasangnya satu per satu.

Aturannya:
- setiap tab memakai Task ID/branch berbeda;
- COORD mencatat Write Scope;
- dua task yang menyentuh path sama tidak dikerjakan paralel;
- sebelum final merge, `task:finish` selalu mengintegrasikan `origin/main`.

Worktree tetap boleh dipakai oleh user advanced, tetapi bukan requirement workflow.

## Branch naming

```text
feat/SB-123-nama
fix/SB-123-nama
security/SB-123-nama
perf/SB-123-nama
docs/SB-123-nama
test/SB-123-nama
chore/SB-123-nama
```

## Recovery sederhana

Jika `task:finish` berhenti karena conflict, jangan force push atau reset sembarang. Branch task masih menyimpan commit pekerjaan. Berikan output terminal ke COORD agar konflik diselesaikan terhadap source aktual.

PR bukan jalur default. Gunakan PR hanya jika user meminta review tambahan atau repository rules menolak direct push `main`.

Kebijakan kontribusi umum: `../CONTRIBUTING.md`.

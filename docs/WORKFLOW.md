# Multi-Team Workflow

Dokumen ini adalah workflow canonical untuk pekerjaan manusia, ChatGPT, dan coding agent di Saldo Bersama. Tujuannya adalah mempercepat pekerjaan paralel tanpa mencampur scope, kehilangan progress, atau mengandalkan ingatan chat.

## Prinsip inti

1. **No task, no patch.** Perubahan source harus memiliki Task ID `SB-xxx`.
2. **One task, one primary team.** Tim pendukung boleh lebih dari satu, tetapi owner utama tepat satu.
3. **Task menentukan tim, bukan nama chat.** Chat baru atau chat lama wajib mengikuti `Primary Team` pada task card.
4. **Satu task card adalah sumber kebenaran progress.** Progress penting tidak boleh hanya tersimpan di percakapan.
5. **Satu team/workspace maksimal satu `IN_PROGRESS`.** Task lain tetap boleh antre sebagai `APPROVED` atau `ON_HOLD`.
6. **Same team + same area dapat dibatch.** Temuan lintas team, guarded area, atau root cause berbeda dibuat sebagai linked task baru.
7. **Dependency ditulis, `Blocks` dihitung otomatis.** Jangan mengandalkan ingatan untuk mengetahui task mana yang membuka task lain.
8. **Tidak ada auto-close berbasis waktu.** Task lama mendapat freshness warning dan wajib revalidasi bila baseline relevan berubah.
9. **QA dan integration gate wajib sebelum `DONE`.** Coding selesai bukan berarti task selesai.
10. **Source aktual menang atas chat, memory, dan snapshot docs.** Drift harus diperbaiki, bukan dipertahankan.

## Team yang dipakai

| Code | Nama | Fokus utama |
|---|---|---|
| `COORD` | Coordinator | intake, routing, dependency, shared critical files, integration, merge order, task lifecycle |
| `UIUX` | UI/UX | layout, CSS, responsive, visual state, semantic HTML, accessibility, interaction presentation |
| `FE` | Frontend | React logic, state, hooks, routing, form behavior, client API, browser-side orchestration |
| `BE` | Backend | Vercel Functions, API, Firebase token/session verification, authorization, server validation, integration server-side |
| `DB` | Database | Turso, migration, transaction integrity, saldo, transfer, idempotency, concurrency, audit, backup/restore/recovery |
| `QA` | Quality Assurance | test, reproduction, regression, browser journey, accessibility verification, release acceptance |

### Batas ownership

- `UIUX` tidak mengubah auth, API contract, saldo, transaction integrity, schema, atau backend untuk menutup bug visual.
- `FE` tidak mengambil alih server authorization, migration, atau saldo calculation.
- `BE` tidak mengubah schema/saldo/backup contract tanpa keterlibatan `DB` dan approval guarded.
- `DB` menjadi owner untuk kebenaran uang/data walaupun gejalanya terlihat di frontend.
- `QA` tidak memperbaiki production code secara diam-diam. Failure dikembalikan ke primary team yang tepat.
- `COORD` bukan superuser untuk memperbaiki semua domain. `COORD` hanya coding ketika task memang integration/governance atau scope secara eksplisit mengizinkannya.

## Identitas tim di awal jawaban

Setiap respons substantif untuk task baru wajib dimulai dengan identitas tim agar user langsung tahu konteksnya.

```text
COORD | Oke, saya tim Coordinator.
UIUX  | Oke, saya tim UI/UX.
FE    | Oke, saya tim Frontend.
BE    | Oke, saya tim Backend.
DB    | Oke, saya tim Database.
QA    | Oke, saya tim QA.
```

Aturan:

- Bila task card sudah ada, gunakan `Primary Team` dari task card.
- Bila task belum ada tetapi scope jelas, identifikasi team lalu buat/siapkan task melalui `COORD` sebelum patch.
- Bila scope ambigu atau lintas team, mulai sebagai `COORD`.
- Bila root cause memindahkan ownership, perubahan team wajib diumumkan. Jangan berganti team diam-diam.
- Nama chat tidak pernah mengalahkan ownership task.

## Status task

Status canonical hanya:

```text
DRAFT
READY
APPROVED
IN_PROGRESS
ON_HOLD
READY_FOR_QA
READY_FOR_MERGE
DONE
```

| Status | Makna | Patch production code |
|---|---|---|
| `DRAFT` | Task baru, scope belum final | Tidak boleh |
| `READY` | Scope/plan siap direview | Tidak boleh |
| `APPROVED` | Plan sudah disetujui dan siap mulai | Boleh mulai |
| `IN_PROGRESS` | Sedang dikerjakan | Boleh sesuai scope |
| `ON_HOLD` | Berhenti sementara karena dependency/kendala | Tidak boleh |
| `READY_FOR_QA` | Patch selesai dan menunggu QA | Hanya kembali ke owner setelah QA fail |
| `READY_FOR_MERGE` | QA/integration checks yang diwajibkan sudah lulus | Tidak ada perubahan normal |
| `DONE` | Sudah terintegrasi dan ditutup | Tidak boleh; task harus di archive |

Alur normal:

```text
DRAFT -> READY -> APPROVED -> IN_PROGRESS -> READY_FOR_QA -> READY_FOR_MERGE -> DONE
```

`ON_HOLD` adalah kondisi sementara, bukan tahap normal. Task `ON_HOLD` wajib memiliki alasan dan kondisi resume.

## Priority

```text
P0 = Critical
P1 = High
P2 = Normal
P3 = Low
```

Priority tidak menggantikan dependency. `COORD` menentukan recommended next dengan urutan:

1. `P0` dan risiko security/data-integrity/saldo;
2. task dependency-root yang membuka task lain paling banyak;
3. task pada critical path work package;
4. work package yang paling dekat selesai;
5. task yang paling lama menunggu;
6. task normal lainnya.

## Task card

Satu task menggunakan satu file:

```text
docs/tasks/active/SB-123.md
```

Setelah benar-benar `DONE`, `COORD` memindahkannya ke:

```text
docs/tasks/archive/SB-123.md
```

Task card minimal memiliki:

- Task ID;
- status;
- priority;
- primary team;
- work package;
- parent bila ada;
- dependency;
- branch dan baseline;
- guarded assessment dan approval;
- acceptance criteria;
- write scope;
- read-only/forbidden scope;
- checkpoint: selesai, tersisa, resume point, test aktual, risiko.

Template canonical berada di `templates/TASK_TEMPLATE.md`.

## Parent, child, work package, dan dependency

Gunakan `Work Package` untuk mengelompokkan beberapa task pada satu fitur, misalnya `LOGIN`, `REKENING`, atau `NOTIFIKASI`.

Gunakan `Parent` hanya bila satu task benar-benar menjadi induk task lain. Child yang wajib menutup parent memakai `Required For Parent: YES`.

Gunakan `Depends On` sebagai dependency canonical. Daftar `Blocks` **tidak ditulis manual** karena dihitung dari seluruh task card oleh tooling. Ini mencegah hubungan dua arah drift.

Contoh:

```text
SB-201 DB  -> DONE
SB-202 BE  -> Depends On SB-201
SB-203 FE  -> Depends On SB-202
SB-204 QA  -> Depends On SB-203
```

Jika `SB-203` masih `ON_HOLD`, `npm run task:list` harus dapat menunjukkan akar dependency yang perlu diselesaikan lebih dahulu.

## Batch same-scope

Satu task boleh memperbaiki beberapa temuan sekaligus bila seluruh syarat berikut benar:

```text
SAME FEATURE
+ SAME PRIMARY TEAM
+ SAME ROOT AREA
+ SAME RISK CLASS
+ MASIH DALAM WRITE SCOPE
```

Contoh: spacing, responsive, focus state, dan empty state pada halaman Rekening dapat dibatch dalam task `UIUX` yang sama.

Task baru wajib dibuat bila salah satu terjadi:

- primary team berubah;
- root cause berbeda;
- guarded area baru tersentuh;
- write scope baru milik team lain diperlukan;
- dependency baru muncul;
- risiko meningkat signifikan;
- perubahan membutuhkan kontrak/schema/auth/saldo/deployment yang sebelumnya tidak disetujui.

Temuan baru tidak otomatis memberi izin patch. Catat sebagai linked/candidate task lalu routing melalui `COORD`.

## Intake dan preflight

Flow untuk task baru:

```text
REQUEST
  -> COORD intake/routing
  -> Task ID + task card
  -> review source + plan
  -> READY
  -> user approval
  -> APPROVED
  -> branch/worktree
  -> preflight
  -> IN_PROGRESS
```

Sebelum coding, agent wajib memverifikasi dan melaporkan secara singkat:

```text
Task
Team
Status
Branch
Baseline
Write scope
Guarded area
Dependencies
Decision: SAFE TO START / STOP
```

`SAFE TO START` hanya boleh bila task, source, branch, approval, dependency, dan scope dapat diverifikasi.

## STOP conditions

Agent wajib berhenti sebelum patch bila:

1. Task ID tidak ditemukan atau task card invalid.
2. Branch tidak cocok dengan task card.
3. Status tidak mengizinkan pekerjaan yang akan dilakukan.
4. File yang diperlukan berada di luar write scope.
5. Source/baseline tidak dapat diverifikasi atau sudah materially stale.
6. Guarded change muncul tanpa approval yang sesuai.
7. Risiko saldo/data integrity ditemukan tetapi root cause belum jelas.
8. Dependency wajib belum selesai.

Jangan mengatasi STOP condition dengan memperluas scope sendiri.

## Branch dan worktree

Branch wajib membawa Task ID:

```text
feat/SB-123-nama-task
fix/SB-123-nama-task
security/SB-123-nama-task
perf/SB-123-nama-task
docs/SB-123-nama-task
test/SB-123-nama-task
chore/SB-123-nama-task
```

Untuk pekerjaan paralel, gunakan satu worktree per task. Jangan memakai satu working tree untuk dua task `IN_PROGRESS`.

## WIP dan antrean

- Satu primary team maksimal memiliki satu task `IN_PROGRESS` pada satu waktu.
- Team boleh memiliki banyak task `READY`, `APPROVED`, atau `ON_HOLD` sebagai antrean.
- Task yang dependency-nya belum selesai tetap `ON_HOLD`; team boleh mengerjakan task lain yang `APPROVED`.
- Dependency selesai tidak otomatis mengubah status. `COORD`/owner melakukan revalidation lalu mengubah status saat benar-benar siap.

Gunakan:

```bash
npm run task:list
```

untuk melihat pekerjaan sedang berjalan, tersedia, menunggu dependency, siap QA, siap merge, dan recommended next.

## Interrupt dan checkpoint

Jika user memindahkan prioritas ketika task masih berjalan:

1. simpan checkpoint task lama;
2. ubah task lama ke `ON_HOLD` bila benar-benar dihentikan;
3. tulis alasan dan resume condition;
4. buat/routing task baru;
5. baru mulai task baru.

Checkpoint wajib diperbarui setelah milestone penting:

- source/root cause selesai divalidasi;
- plan disetujui;
- patch tahap penting selesai;
- test penting selesai;
- status berubah;
- handoff ke team lain;
- pekerjaan dihentikan sementara.

Minimal checkpoint:

```text
Completed
Remaining
Resume From
Last Verified Commit
Validation Actually Run
Known Risks
```

Tidak ada pekerjaan penting yang hanya hidup di chat.

## Freshness dan melanjutkan task lama

Waktu tidak pernah menutup task otomatis.

Sebelum resume, bandingkan `Last Verified Commit`/baseline task dengan source dan `main` sekarang. Revalidation wajib bila:

- file/contract/dependency yang relevan berubah;
- `main` berubah materially pada area task;
- task ditinggalkan lebih dari 72 jam;
- agent tidak dapat membuktikan baseline terakhir.

Task yang lebih dari 72 jam hanya mendapat warning. Jangan mengubahnya menjadi `DONE` atau membuangnya otomatis.

## QA, integration, dan close

Flow akhir:

```text
IN_PROGRESS
  -> READY_FOR_QA
  -> QA verification
  -> READY_FOR_MERGE
  -> COORD integration check + merge order
  -> post-merge verification
  -> DONE
  -> archive task card
```

QA memakai acceptance criteria task, bukan hanya status build. Jika QA gagal, task kembali ke owner yang tepat dan status kembali ke `IN_PROGRESS` setelah routing.

`READY_FOR_MERGE` membutuhkan scope check, test wajib, task validator, guarded approval, source freshness, dan tidak ada dependency unresolved.

Untuk branch task canonical, push menjalankan workflow `Quality` dengan token read-only. Hanya setelah Quality PASS, workflow `Task Submit` dari default branch boleh memproses `workflow_run`. Workflow privileged tersebut dilarang checkout atau mengeksekusi kode branch; metadata task dibaca sebagai data dari exact tested SHA melalui GitHub API. Sebelum create/merge PR, privileged workflow harus membaca guarded-path registry canonical dari `main`, menolak mismatch `Guarded`, dan memastikan branch head, base `main`, serta PR head tetap sama dengan snapshot yang divalidasi. Auto-merge hanya boleh untuk `Guarded=NO` dengan risk `LOW`/`MEDIUM`; guarded atau `HIGH`/`CRITICAL` selalu menunggu approval/merge manual. Repository rules tetap authoritative dan kegagalan permission/check/freshness/merge harus fail-closed tanpa mengubah `main`. Evidence QA/integration berada pada PR/Actions sampai COORD melakukan post-merge reconciliation dan close task.

`DONE` berarti perubahan sudah terintegrasi, diverifikasi, dan task card dipindahkan ke archive. Coding selesai saja belum cukup.

## Shared critical dan guarded areas

Perubahan berikut selalu memerlukan assessment/approval eksplisit:

- schema/migration Turso;
- Firebase Auth, allowlist, role, authorization, session/security guard;
- API/action contract;
- saldo, transfer, transaction lifecycle, audit, idempotency, `row_version`;
- import/export, backup/restore, purge, migration/recovery;
- environment, secret, deployment, scheduler, GitHub Actions;
- timezone Asia/Jakarta dan Rupiah integer;
- dependency/stack;
- governance global seperti `AGENTS.md`, `docs/WORKFLOW.md`, task validator, dan repository rules.

File shared critical bersifat read-only bagi team lain kecuali task card secara eksplisit memasukkannya dalam write scope dan guarded approval sudah ada.

## Command canonical

```bash
npm run task:list
npm run task:check
npm run check
npm run test:browser
```

`task:check` memvalidasi registry task, status/team/dependency/WIP, branch, guarded declaration, dan modified path terhadap write scope. Pada `main`, validator tetap memeriksa registry tetapi tidak memaksa branch task.

## Pertanyaan singkat yang boleh dipakai user

User tidak perlu mengingat Task ID. `COORD` harus dapat menjawab pertanyaan seperti:

```text
Kurang apa?
Sampai mana?
Apa yang bisa dikerjakan sekarang?
Frontend masih ada apa?
Backend nunggu apa?
Login belum selesai karena apa?
Apa yang harus dikerjakan dulu agar task lain bisa lanjut?
```

Jawaban harus dibangun dari task card/source aktual, bukan dari ingatan chat.

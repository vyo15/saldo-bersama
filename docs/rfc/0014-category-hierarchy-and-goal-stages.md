# RFC-0014 Category Hierarchy and Goal Stages

**Status:** Proposed, design hardened
**Owner:** Product owner + data owner
**Reviewers:** Backend, reports, import/export, QA
**Date:** 2026-08-02
**Last reviewed:** 2026-08-21 against schema v11

## Problem

Schema v11 menyimpan kategori secara flat dengan uniqueness `name + transaction_type`. Target (`savings_goals`) mempunyai satu `target_amount`, dan `goal_movements` belum mempunyai stage relation.

Produk membutuhkan category grouping seperti Rumah > Internet/Listrik dan Target bertahap tanpa membuat roll-up report menghitung transaksi dua kali atau mengubah histori Target yang sudah berjalan.

## Goals

- Parent/subcategory deterministik tanpa cycle.
- Hierarchy sederhana untuk kebutuhan aplikasi dua pengguna.
- Report dapat roll-up parent + descendant tanpa double counting.
- Existing transaksi dan kategori tetap valid tanpa recategorization massal.
- Goal dapat mempunyai tahap dengan target/progress yang dapat direkonstruksi.
- Existing goal/movement tetap valid melalui migration additive.

## Non-goals

- Tidak membuat taxonomy tak terbatas atau arbitrary graph.
- Tidak mengubah category transaction type setelah dipakai.
- Tidak memindahkan histori transaksi ke child category secara heuristik.
- RFC ini bukan approval migration/runtime.

## Category hierarchy decision

### Model

Gunakan **adjacency list** melalui optional `parent_category_id` pada kategori. Closure table tidak diperlukan untuk MVP karena depth dibatasi.

MVP depth maksimum: **2 level**:

- level 0: parent/root;
- level 1: child.

Grandchild tidak diperbolehkan pada MVP. Ini cukup untuk use case seperti:

- Rumah > Listrik, Internet, Cicilan Rumah
- Pendidikan > Transportasi, SPP
- Pasangan > Transportasi, Jatah Harian

### Transaction type and cycle guard

- Parent dan child wajib mempunyai `transaction_type` yang sama.
- Self-parent ditolak.
- Cycle ditolak backend walaupun depth maksimum sudah membatasi graph.
- Category archived tidak boleh menjadi parent baru.

### Selection policy

Untuk write baru:

- category tanpa child adalah leaf dan dapat dipilih;
- category yang mempunyai child aktif menjadi grouping parent dan tidak dapat dipilih untuk transaksi baru;
- transaksi historis yang sudah menggunakan category sebelum category tersebut menjadi parent tetap valid dan tidak dipindahkan otomatis.

Report parent menghitung:

1. transaksi historis yang langsung tersimpan pada parent;
2. transaksi pada child aktif maupun archived;
3. setiap transaksi tepat satu kali.

Dengan policy ini, menambah child ke category existing tidak merusak histori.

### Naming uniqueness

Uniqueness berubah menjadi sibling scope:

- root name unik per `transaction_type`;
- child name unik di bawah parent yang sama dan `transaction_type` yang sama;
- child dengan nama sama boleh berada pada parent berbeda.

Normalisasi nama tetap case/whitespace-safe menurut validator canonical. Exact constraint/index SQLite ditentukan pada migration plan.

### Lifecycle

- Parent dengan child aktif tidak dapat hard-delete.
- Archive parent memerlukan preview seluruh child dan reference transaksi.
- Hard-delete tetap hanya untuk category benar-benar unused sesuai lifecycle policy existing.
- Reparent category yang sudah digunakan adalah guarded mutation dan harus mengecek report impact serta stale `row_version`.

## Goal stages decision

### Model

Gunakan entity `goal_stages` dan optional relation `goal_stage_id` pada `goal_movements` setelah migration approved.

Stage minimum:

- stage id
- goal id
- name
- target amount integer
- sort order
- status `active`, `completed`, `archived`
- `row_version`
- audit fields

### Stage-total policy

Untuk goal yang memakai stages:

**jumlah target stage aktif harus sama dengan `savings_goals.target_amount`.**

`target_amount` pada goal tetap canonical total untuk compatibility report dan existing UI. Stage tidak boleh membuat target total kedua yang drift.

### Existing goal migration

Migration tidak boleh menghilangkan movement historis.

Untuk setiap existing goal, buat satu default stage canonical, misalnya `Utama`:

- target stage = current `goal.target_amount`;
- semua existing active/reversed `goal_movements` dikaitkan ke default stage secara deterministik;
- current goal progress tidak berubah;
- tidak ada movement baru yang dibuat.

Setelah itu user dapat membagi target ke stage tambahan melalui guarded edit dengan preview. Existing movement tidak dipindahkan antar stage otomatis kecuali user menjalankan explicit reallocation workflow yang disetujui.

### Movement allocation

Setelah stage feature aktif, setiap movement baru untuk staged goal wajib mempunyai `goal_stage_id` yang valid pada goal yang sama.

- deposit menambah progress stage;
- withdrawal mengurangi progress stage;
- reversal mengikuti stage original movement;
- stage progress direkonstruksi dari active goal movements, bukan editable number.

### Goal completion

Goal dapat `completed` hanya jika:

- total progress memenuhi existing goal completion rule; dan
- seluruh stage aktif sudah memenuhi target masing-masing.

Archived stage dengan histori tetap tersedia untuk audit tetapi tidak menerima movement baru.

### Stage target editing

Mengubah stage targets harus menjaga sum sama dengan goal target. Jika target goal diubah, request yang sama harus membawa stage distribution baru atau memakai explicit redistribution preview. Tidak boleh meninggalkan state intermediate yang jumlahnya tidak konsisten.

## Reporting

### Category

Report harus menyediakan:

- direct amount per category;
- rolled-up amount per parent;
- child breakdown;
- historical direct-parent entries tanpa double count.

### Goal

Report total goal tetap menggunakan goal canonical. Stage view menjadi breakdown dari movement yang sama, bukan saldo kedua.

## Import/export/backup

- Import category hierarchy wajib reject cycle, wrong transaction type, unknown parent, duplicate sibling.
- Import goal stages wajib memvalidasi stage-total equality dan movement relation.
- Export menyertakan parent/stage relation dengan stable id.
- Backup/restore wajib menjaga graph dan sequence stage.
- Restore dinyatakan berhasil hanya setelah integrity check hierarchy, stage sums, dan movement relation lulus.

## Migration and rollback

Migration additive dan wajib backup terverifikasi.

Category existing menjadi root. Existing goal mendapat default stage tanpa mengubah nilai balance/progress. Tidak ada recategorization transaksi.

Rollback menggunakan forward-fix. Setelah movement mempunyai stage relation, kolom/tabel tidak boleh di-drop pada Production karena akan memutus audit history.

## Test and acceptance criteria

### Category

- Self-parent, cycle, grandchild, dan cross-transaction-type parent ditolak.
- Duplicate sibling ditolak, same child name pada parent berbeda diperbolehkan.
- Parent dengan child aktif tidak selectable untuk transaksi baru.
- Existing transaksi langsung pada parent tetap valid.
- Roll-up parent tidak menghitung transaksi dua kali.
- Archive/reparent memakai preview, `row_version`, dan audit.

### Goal stage

- Sum active stage target selalu sama dengan goal target.
- Migration existing goal membuat satu default stage tanpa mengubah progress.
- Existing movement tetap dapat direkonstruksi.
- Movement baru wajib memakai stage goal yang sama.
- Withdrawal/reversal menjaga stage original.
- Stage progress tidak dapat diedit bebas.
- Goal tidak completed jika stage aktif belum terpenuhi.
- Import/restore menolak dangling stage/movement relation.

## Risks

- Report query lebih kompleks dan rentan double count jika direct-parent + child aggregation salah.
- Reparent category dapat mengubah interpretasi report historis.
- Stage target yang drift dari goal total membuat dua source of truth.
- Memaksa reallocation movement lama dapat menulis ulang histori.

## Decision

MVP design memilih **adjacency list depth 2**, **new-write leaf selection**, **sibling uniqueness**, serta **goal stages dengan target sum sama dengan goal target dan default stage untuk existing goals**.

RFC tetap Proposed. Belum ada approval migration, index/constraint SQL, reparent workflow, API contract, atau UI implementation.

## Links

- `../DATA_DICTIONARY.md`
- `../TURSO_SCHEMA.md`
- `../../database/migrations/001_initial_schema.sql`

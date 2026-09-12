# Document Lifecycle

> **Status:** Canonical  
> **Purpose:** Menentukan peran, authority, dan lifecycle seluruh dokumentasi aktif.  
> **Update when:** Struktur dokumentasi, ownership informasi, atau workflow dokumentasi berubah.

Dokumentasi Saldo Bersama dibagi berdasarkan fungsi, bukan berdasarkan umur file. Satu pertanyaan harus memiliki satu sumber kebenaran aktif; dokumen lain cukup merujuk authority tersebut.

| Status | Arti | Perlakuan |
|---|---|---|
| Canonical | Sumber aturan/kontrak aktif | Diperbarui bersama source terdampak dan dijaga drift test. |
| Snapshot | Kondisi project saat ini | Ringkas; **replace current state**, jangan append history. |
| Runbook | Prosedur operasional | Langkah operasional harus fail-closed dan divalidasi saat tooling berubah. |
| Historical | Catatan keputusan/proses yang sudah selesai | Dipertahankan untuk audit/recovery/context; tidak boleh mengontrol workflow aktif. |
| Template | Kerangka dokumen baru | Tidak berisi status runtime/project aktual. |

## Authority utama

| Pertanyaan | Authority |
|---|---|
| Produk seharusnya bekerja bagaimana? | `product/PRODUCT_REQUIREMENTS.md` |
| Istilah berarti apa? | `product/GLOSSARY.md` |
| Fitur sudah implement atau belum? | `IMPLEMENTATION_MATRIX.md` |
| Kondisi project sekarang? | `PROJECT_STATUS.md` |
| Arsitektur runtime? | `ARCHITECTURE.md` |
| Action/API contract? | `API_CONTRACT.md` |
| Siapa boleh melakukan apa? | `AUTHORIZATION_MATRIX.md` |
| Struktur database? | `TURSO_SCHEMA.md` |
| Arti field/data? | `DATA_DICTIONARY.md` |
| UI/UX convention? | `UI_DESIGN_SYSTEM.md` |
| Regression contract? | `TEST_PLAN.md` |
| QA release manual? | `QA_CHECKLIST.md` |
| Development workflow? | `WORKFLOW.md` |
| Git delivery? | `GIT_WORKFLOW.md` |
| Deployment? | `DEPLOYMENT.md` |
| Kenapa keputusan teknis dibuat? | `adr/` |
| Proposal/future design? | `rfc/` |
| Apa yang berubah dari waktu ke waktu? | `../CHANGELOG.md` dan Git |

## Klasifikasi

- **Canonical:** architecture, product requirements/glossary, contracts, security model, environment, schema, data dictionary, UI design system, `WORKFLOW.md`, `GIT_WORKFLOW.md`, `TEST_PLAN.md`, `QA_CHECKLIST.md`, dan contribution policy.
- **Snapshot:** `PROJECT_STATUS.md` dan `IMPLEMENTATION_MATRIX.md`.
- **Runbook:** deployment, release, rollback, recovery, incident, operations, dan secret rotation.
- **Historical:** ADR/RFC yang superseded/rejected, `docs/tasks/archive/` dari workflow lama, serta `docs/history/` termasuk one-time legacy cutover.
- **Template:** template RFC dan template aktif lain.

## Aturan perubahan

1. Source dan test aktual mengalahkan snapshot yang tertinggal; drift harus diperbaiki pada patch yang sama.
2. `PROJECT_STATUS.md` menjawab **kondisi sekarang** dan bukan jurnal perubahan.
3. `IMPLEMENTATION_MATRIX.md` hanya menyimpan status Implemented/Partial/Planned, evidence utama, dan remaining gap.
4. `CHANGELOG.md` dan Git menyimpan history perubahan; history tidak ditempelkan ke current-state docs.
5. `TEST_PLAN.md` menyimpan regression contract/domain scenario evergreen; `QA_CHECKLIST.md` hanya checklist evergreen. Keduanya tidak boleh menjadi jurnal patch, baseline tanggal lama, atau daftar `[x]` dari pekerjaan sebelumnya.
6. Dokumen canonical tidak boleh memakai heading tanggal patch atau nama seperti `Hardening vXX`. Versi schema boleh disebut bila merupakan **current runtime fact**, bukan nama konsep.
7. Historical evidence tidak diedit hanya agar terlihat current. Beri label/index yang jelas sehingga tidak dianggap authority aktif.
8. Satu business invariant dijelaskan lengkap di authority utamanya. Dokumen lain menguji/merujuk invariant tersebut tanpa mendefinisikan ulang dengan arti berbeda.
9. `docs/INDEX.md` wajib menunjuk seluruh dokumen aktif dan menjelaskan authority map.
10. Dokumen aktif baru tidak boleh orphan: harus direferensikan dari `docs/INDEX.md` atau authority yang relevan.
11. Perubahan source mengikuti urutan `source -> behavior/contract -> test -> docs`; bila contract berubah, authority docs dan regression test diperbarui sebelum delivery.
12. Governance test menjaga link lokal, authority map, schema/runtime marker, lifecycle current docs, dan invariant produk kritis agar semantic drift tidak lolos hanya karena struktur file masih valid.

## Metadata ringan

Dokumen canonical/snapshot utama sebaiknya membuka dengan blok singkat:

```text
Status: Canonical | Snapshot | Runbook
Purpose: fungsi dokumen
Update when: kondisi yang mewajibkan update
```

Metadata ini informatif, bukan sistem frontmatter baru. Jangan menduplikasi tanggal update; histori tetap di Git/CHANGELOG.

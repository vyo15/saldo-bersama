# RFC-0011 Transaction Lifecycle, Participants, and Private Receipts

**Status:** Proposed, design hardened  
**Owner:** Product owner + backend/security  
**Reviewers:** Frontend, QA, recovery owner  
**Date:** 2026-08-02  
**Last reviewed:** 2026-08-21 against schema v11

## Problem

Schema v11 hanya menyimpan ledger transaksi yang berdampak ke saldo dengan status `active`, `cancelled`, atau `archived`. `created_by` adalah recorder, bukan pihak yang membayar atau menerima manfaat. Produk juga membutuhkan draft/rencana yang belum memindahkan uang serta bukti pembayaran privat.

Memasukkan rencana ke tabel `transactions` sebagai transaksi aktif akan mengubah saldo, laporan, Alokasi Dana, rekonsiliasi, dan cost-sharing sebelum cash movement benar-benar terjadi. Menyimpan gambar receipt/base64 di Turso juga memperbesar database dan memperlemah batas privasi.

RFC ini harus tetap kompatibel dengan schema v11, termasuk `cost_share_mode`, `cost_share_json`, Jadwal Rutin, Alokasi Dana, backup/restore, dan current transaction contract.

## Canonical participant vocabulary

Istilah berikut menjadi vocabulary lintas RFC-0011, RFC-0012, dan follow-up RFC-0013:

- **Recorder**: actor yang mencatat atau mengubah data. Untuk transaksi existing tetap berasal dari `created_by`/`updated_by`.
- **Payer**: pihak yang secara nyata menyediakan dana untuk cash movement.
- **Beneficiary**: pihak yang menerima manfaat ekonomi dari transaksi.
- **Liable party**: pihak yang secara ekonomi menanggung kewajiban. Ini tidak selalu sama dengan payer.
- **Cost-share participant**: participant analitis pada snapshot `cost_share_json`. Ini bukan bukti pembayaran aktual.
- **External counterparty**: pihak di luar user terotorisasi Saldo Bersama, misalnya bank, teman, keluarga, merchant, atau pemberi pinjaman.

Field generik `used_by` tidak akan ditambahkan ke `transactions` sebagai satu-satunya representasi participant. Kebutuhan tersebut dipenuhi melalui participant role yang eksplisit agar tidak bertabrakan dengan payer/beneficiary/liable party.

## Goals

- Pisahkan draft/planned intent dari ledger yang memengaruhi saldo.
- Bedakan recorder dari payer, beneficiary, dan liable party.
- Receipt disimpan pada object storage privat. Database hanya menyimpan metadata dan object reference.
- Conversion draft ke transaksi menghasilkan tepat satu ledger entry.
- Pertahankan idempotency, `row_version`, audit, ownership, backup/restore, dan soft lifecycle.
- Jangan mengubah semantics transaksi historis v11.

## Non-goals

- RFC ini bukan approval migration atau perubahan API runtime.
- Draft tidak menggantikan `recurring_occurrences`. Jadwal Rutin tetap model recurrence canonical.
- Receipt tidak dianggap bukti validasi bank otomatis.
- RFC ini tidak mengaktifkan pemulihan Alokasi Dana atau cost split dari refund. Itu bergantung pada original-expense relation di RFC-0013 follow-up.

## Proposed domain model

### 1. `transaction_drafts`

Entity terpisah dari ledger dengan state minimum:

- `draft`
- `planned`
- `completed`
- `cancelled`
- `archived`

Draft menyimpan intent yang dibutuhkan untuk mengisi composer, tetapi tidak boleh ikut query saldo, report, reconciliation, cost-sharing report, atau envelope spending.

`completed` wajib mempunyai relasi ke tepat satu `transactions.transaction_id`. Completion bersifat idempotent. Retry intent yang sama menggunakan idempotency key yang sama dan tidak boleh membuat ledger entry kedua.

`recurring_occurrences` tidak dimigrasikan menjadi draft. Occurrence boleh membuka composer/draft sebagai UX helper, tetapi canonical recurrence relation tetap berada pada occurrence dan transaksi aktual existing.

### 2. `transaction_participants`

Participant disimpan sebagai role eksplisit, bukan field ambigu `used_by`.

Role minimum yang dipertimbangkan:

- `payer`
- `beneficiary`
- `liable_party`

Recorder tidak diduplikasi karena sudah tersedia dari audit fields transaksi. Cost-share participant tetap disimpan pada immutable `cost_share_json` sampai follow-up RFC-0013 menerima model actual contribution.

Participant subject harus mengacu ke user canonical atau external counterparty canonical. Client tidak boleh mengirim actor/owner metadata yang dipercaya langsung oleh backend.

### 3. `transaction_attachments`

Attachment hanya menyimpan metadata seperti:

- attachment id acak
- transaction/draft owner relation
- object key opaque
- MIME canonical hasil validasi server
- size
- checksum
- lifecycle/status
- uploader actor
- timestamps dan `row_version`

Tidak ada base64 atau raw file di Turso. Original filename hanya metadata ter-sanitasi dan tidak boleh menjadi object key.

## Private receipt policy

Storage wajib private-by-default. Access menggunakan server-authorized short-lived signed access atau stream melalui backend. Backend mengecek actor, transaction projection, ownership, status attachment, dan scope setiap kali akses diberikan.

Minimum guard:

- MIME allowlist dan magic-byte validation
- batas ukuran file
- image decode/re-encode bila policy menyetujui
- filename/formula injection neutralization
- random object key
- checksum
- upload idempotency
- no public bucket/listing
- audit upload/archive/access failure tanpa menyimpan URL bertanda tangan

Attachment normal menggunakan archive/soft lifecycle. Physical orphan cleanup dilakukan job guarded setelah retention window. Object tidak boleh dihapus hanya karena client menghapus UI reference.

## Draft completion contract

Completion harus berada dalam satu server-side guarded workflow:

1. autentikasi dan authorization actor;
2. load draft terbaru dan validasi `row_version`;
3. validasi semua account/category/allocation/reference masih aktif dan operable;
4. gunakan idempotency key intent yang sama;
5. create tepat satu transaksi ledger melalui service canonical;
6. simpan relation `completed_transaction_id`;
7. mark draft `completed`;
8. append audit;
9. commit;
10. baru balas sukses.

Jika commit tidak diketahui client, retry menggunakan idempotency key yang sama. Draft tidak boleh ditandai completed sebelum ledger transaction confirmed dalam database transaction yang sama.

## Refund boundary

Receipt atau participant tidak mengubah semantics refund. Refund hanya boleh memulihkan cost split atau Alokasi Dana setelah memenuhi relation dan cap policy RFC-0013 follow-up:

- original expense eksplisit;
- cumulative active refund tidak melebihi original expense;
- partial/multiple refund deterministik;
- original allocation/split snapshot masih dapat direkonstruksi;
- cross-period restore tidak dilakukan diam-diam.

Sebelum policy tersebut implemented, refund tetap cash inflow tanpa auto-restore Alokasi Dana atau cost split.

## Impact

- Frontend: draft queue, resume/complete, participant editor sesuai capability, receipt viewer/uploader.
- API: action draft create/update/complete/archive dan attachment upload/read/archive terpisah dari `transactions.create`.
- Database: migration additive setelah RFC Accepted.
- Auth/security: backend participant/attachment projection dan default deny.
- Data integrity: draft tidak memengaruhi saldo sampai completed.
- Backup/restore: manifest attachment, checksum, missing-object validation, dan orphan policy.
- Observability: metadata teknis saja, tanpa raw receipt, signed URL, atau payload finansial mentah.

## Migration and rollback

Migration harus additive. Existing transaksi v11 tidak diubah atau diberi participant palsu. Tidak ada backfill payer/beneficiary dari `created_by`.

Jika participant model diterapkan, existing transaksi tetap valid dengan participant kosong/unknown. Rollback menggunakan forward-fix. Destructive DROP tidak dilakukan pada Production. Attachment storage mempunyai orphan cleanup guarded dan manifest reconciliation.

## Test and acceptance criteria

- Draft/planned tidak mengubah saldo, report, Alokasi Dana, Target, atau reconciliation.
- Completion idempotent menghasilkan tepat satu ledger transaction.
- Concurrent completion dengan stale `row_version` ditolak.
- Recorder tidak otomatis dianggap payer/beneficiary.
- Existing transaksi tanpa participant tetap dapat dibaca.
- Receipt tidak dapat diakses actor yang tidak berhak atau melalui URL publik permanen.
- MIME spoof, oversized file, unsafe filename, dan formula injection ditolak.
- Restore mendeteksi missing/mismatched attachment checksum sebelum dinyatakan berhasil.
- Cancel/archive draft tidak membatalkan transaksi yang sudah completed.

## Risks

- Participant terminology yang ambigu dapat menghasilkan laporan ekonomi yang salah.
- Receipt berisi data pribadi dan dapat membocorkan merchant/account detail.
- Orphan object, storage cost, signed-link leakage, dan restore mismatch.
- Draft yang secara tidak sengaja masuk query ledger akan merusak saldo.

## Decision

Desain vocabulary, pemisahan draft dari ledger, dan private receipt boundary disepakati untuk tahap RFC hardening. **Belum ada approval migration, storage provider, schema, atau API runtime.** Implementasi baru boleh direncanakan setelah storage privat, participant subject model, retention, migration, backup/restore, dan rollback plan disetujui eksplisit.

## Links

- `0012-debt-receivable-ledger.md`
- `0013-contribution-and-cost-sharing.md`
- `../DATA_DICTIONARY.md`
- `../../database/migrations/009_transaction_cost_sharing.sql`

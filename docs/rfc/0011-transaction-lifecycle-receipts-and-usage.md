# RFC-0011 Transaction Lifecycle, Usage, and Private Receipts

**Status:** Proposed  
**Owner:** Product owner + backend/security  
**Reviewers:** Frontend, QA, recovery owner  
**Date:** 2026-08-02

## Problem

Schema v3 hanya menyimpan transaksi ledger aktif/cancelled/archived dan actor pencatat. Kebutuhan produk meminta pengguna uang, draft/rencana/belum dibayar, bukti pembayaran, quick completion, dan template. Menjadikan rencana sebagai transaksi aktif akan merusak saldo; menyimpan foto/base64 di Turso akan memperbesar database dan memperlemah privasi.

## Goals

- Pisahkan planned obligation/draft dari ledger yang memengaruhi saldo.
- Bedakan `created_by` dari pengguna/beneficiary.
- Simpan receipt pada storage privat dan hanya referensinya di database.
- Pertahankan idempotency, row version, audit, ownership, dan restore relation.

## Non-goals

- Tidak mengubah schema atau action pada RFC ini.
- Tidak menganggap receipt sebagai bukti validasi bank otomatis.

## Proposed solution

Evaluasi entitas `transaction_drafts`/`planned_payments`, `transaction_participants`, `transaction_attachments`, serta template server-side. Conversion draft → ledger harus transactionally create tepat satu transaksi aktif dengan idempotency key yang sama. Attachment hanya menerima MIME/size allowlist, object ID acak, signed access, malware/image validation yang disetujui, dan audit upload/archive.

## Impact

- Frontend: quick draft, completion queue, receipt viewer/uploader.
- API: action preview/create/complete/archive terpisah dari transaction create.
- Database: migration baru; tidak menambah status planned ke ledger aktif.
- Auth/security: backend projection dan ownership attachment.
- Data integrity/saldo: draft tidak memengaruhi saldo sampai completed.
- Backup/restore: manifest attachment dan verification wajib.
- Observability: upload/complete failure tanpa payload finansial mentah.
- Compatibility: transaksi v3 tetap valid.

## Migration and rollback

Additive migration; existing transactions tidak diubah. Rollback kode harus tetap dapat membaca schema baru atau menggunakan forward-fix. Attachment storage harus memiliki orphan cleanup guarded.

## Test and acceptance criteria

- Draft tidak mengubah saldo/report.
- Complete idempotent menghasilkan satu ledger entry.
- Receipt tidak dapat diakses actor yang tidak berhak.
- Restore memverifikasi referensi attachment.
- Formula/file-name injection dan MIME spoof ditolak.

## Risks

Data pribadi pada gambar, storage cost, orphan object, dan link leakage.

## Decision

Pending approval dan pemilihan storage privat.

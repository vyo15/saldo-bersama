# RFC-0015 Granular Personal Account Privacy and Backend Projection

**Status:** Proposed, design hardened
**Owner:** Security/privacy owner
**Reviewers:** Backend, frontend, product, QA
**Date:** 2026-08-02
**Last reviewed:** 2026-08-21 against schema v11

## Problem

Baseline ledger/privacy yang diperkenalkan sebelum schema v12 sengaja memakai transparansi dua pengguna untuk read; migration v12 tidak mengubah policy tersebut. `readableLedgerSql()` dan `readableAccountSql()` mengembalikan `1=1`, sedangkan write capability tetap dibatasi ownership/backend guard.

Kebutuhan produk meminta opsi privacy personal seperti full detail, balance-only, contribution-only, atau private. Menyembunyikan card di frontend tidak cukup karena detail dapat bocor lewat API response, report, aggregate, reconciliation, notification, export, atau endpoint lain.

Ini **bukan broken access control terhadap baseline saat ini**. Baseline full-transparency adalah policy existing yang terdokumentasi. RFC ini mendefinisikan mode granular tambahan.

## Goals

- Semua privacy enforcement terjadi pada backend projection/read model.
- Owner personal account selalu memahami dan mengontrol visibility account miliknya sesuai authorization policy.
- User lain tidak menerima field/detail/aggregate yang dilarang.
- Tidak ada endpoint alternatif yang mudah merekonstruksi data private.
- Projection konsisten untuk dashboard, transaksi, report, reconciliation, notification, export, audit viewer, dan search/filter.
- Operational backup/recovery tidak kehilangan canonical data akibat user-facing projection.

## Non-goals

- Tidak mengandalkan CSS, hidden route, atau client filter sebagai security boundary.
- Tidak membuat Administrator otomatis dapat membuka data personal user lain melalui UI normal.
- Tidak mengaktifkan `contribution_only` sebelum actual contribution model RFC-0013 tersedia.
- RFC ini bukan approval migration/runtime.

## Baseline existing

Pada runtime v12, dua user terotorisasi tetap dapat membaca shared maupun personal account/ledger dengan owner label. Hak create/update/cancel/reconcile tetap dibatasi backend capability/ownership. Sheets mirror tetap shared-only.

Baseline ini tetap berlaku sampai granular privacy migration dan projection framework benar-benar diterapkan end-to-end.

## Visibility modes

Future personal account mempunyai policy owner-controlled yang versioned. Shared account tetap full-visible untuk user terotorisasi sesuai current product model.

### `full`

User lain yang berhak melihat dapat menerima:

- account display metadata yang disetujui;
- current/historical balance;
- transaction detail;
- reconciliation detail;
- report/category detail;
- visible filters/search entries.

Sensitive credentials/secret tidak pernah termasuk mode mana pun.

### `balance_only`

User lain hanya menerima minimum identity yang diperlukan untuk memahami account dan current permitted balance.

Allowed minimum:

- display name/provider/owner label yang tidak secret;
- current balance yang diizinkan;
- status active/archived jika dibutuhkan UI.

Tidak dikirim:

- account number penuh;
- transaction list/detail;
- merchant/category/note/payment method;
- reconciliation history/detail;
- per-period inflow/outflow detail;
- search/filter option yang membocorkan transaction existence.

Aggregate report untuk actor tersebut tidak boleh memasukkan hidden transaction amount lalu menampilkannya melalui total lain.

### `contribution_only`

Mode ini **deferred dan tidak dapat diaktifkan** sampai RFC-0013 actual contribution implemented.

Jika kelak aktif, user lain hanya menerima actual contribution/settlement facts yang secara eksplisit melibatkan dirinya dan summary yang disetujui. Mode ini bukan sinonim balance-only dan tidak boleh diinfer dari `cost_share_json`.

### `private`

User lain tidak menerima row account, balance, transaction detail, reconciliation, ataupun derived amount dari account tersebut.

Viewer-facing household totals harus dihitung dari **viewer-visible dataset**, bukan full canonical total dikurangi item yang terlihat. UI tidak boleh menampilkan angka tersembunyi atau delta yang memungkinkan easy reconstruction.

System boleh menyatakan secara generik bahwa sebagian data bersifat privat hanya jika product UX memilih demikian, tetapi tidak perlu mengungkap jumlah account, amount, atau activity count.

## Canonical projection architecture

Jangan menambahkan `if privacy` tersebar di feature service.

Future backend harus mempunyai canonical projection policy, misalnya konsep:

- `accountVisibilityForActor(actor, account)`
- `projectAccountForActor(actor, account)`
- `transactionVisibilityForActor(actor, transaction)`
- report/read-model builder yang hanya menerima viewer-visible relation

Nama final helper bukan keputusan schema, tetapi prinsipnya wajib: **row filtering dan field projection berada pada satu policy layer.**

`SELECT a.*` ke client tidak boleh dipakai untuk balance-only/private. Service harus memilih field eksplisit sesuai projection.

## Projection matrix

| Data class | full | balance_only | contribution_only | private |
| --- | --- | --- | --- | --- |
| Account display identity | Ya | Minimum | Minimum bila dibutuhkan relation | Tidak |
| Current balance | Ya | Ya | Tidak | Tidak |
| Account number/detail sensitif | Sesuai existing redaction | Tidak | Tidak | Tidak |
| Transaction rows | Ya | Tidak | Hanya contribution facts, bukan transaction detail | Tidak |
| Reconciliation detail | Ya | Tidak | Tidak | Tidak |
| Report detail | Ya | Tidak | Contribution-only summary | Tidak |
| Search/filter transaction | Ya | Tidak | Tidak | Tidak |
| User export | Ya | Hanya projected fields | Hanya allowed contribution facts | Tidak |
| Shared Sheets mirror | Existing shared-only policy | N/A untuk personal | N/A | N/A |

## Aggregates and inference

Semua dashboard/report aggregate harus dibangun dari dataset yang sudah projected untuk actor.

Forbidden example:

- endpoint A menyembunyikan private account;
- endpoint B tetap mengirim household total termasuk private account;
- user mengurangi visible accounts dari household total dan mendapatkan private balance.

Karena itu total viewer adalah **visible total**, bukan canonical household total, kecuali semua constituent data full-visible.

Period comparison, trend, category chart, alert, budget availability, goal relation, dan notification text harus mengikuti rule yang sama.

## Reconciliation and write capability

Read privacy tidak otomatis memberi write capability.

- Owner account mengikuti existing operable-account authorization.
- User lain tidak dapat reconcile/update/cancel personal account hanya karena mode `full` atau `balance_only`, kecuali authorization matrix future secara eksplisit mengubah write capability.
- Privacy policy dan write ownership adalah dua axis berbeda.

## Administrator and recovery boundary

Administrator **tidak mendapat bypass privacy melalui UI/report normal** hanya karena role Administrator.

Operational recovery/backup adalah system maintenance boundary terpisah. Canonical backup harus menyimpan data lengkap agar recovery tidak kehilangan data, tetapi:

- backup tidak menjadi user-facing export;
- backup access tetap owner/maintenance guarded;
- restore audited dan mengikuti recovery runbook;
- normal report/export projection tetap menghormati privacy.

Jika kelak diperlukan break-glass inspection, itu membutuhkan RFC/action terpisah dengan explicit reason, confirmation, audit append-only, dan notification. Tidak termasuk RFC ini.

## Export, mirror, audit

- User export mengikuti actor projection.
- Personal account tidak masuk shared Sheets mirror sesuai baseline current.
- Audit viewer untuk non-owner meredaksi private entity payload. Audit canonical internal tetap harus cukup untuk incident/recovery tanpa menyimpan secret.
- Notification tidak boleh menaruh private amount/detail pada recipient yang tidak berhak.

## Policy lifecycle

Policy change adalah guarded mutation:

- owner/capability validation server-side;
- latest `row_version`;
- explicit preview dampak;
- audit old mode -> new mode;
- cache/read-model invalidation;
- tidak retroactively mengubah canonical ledger.

Default untuk migration existing personal account tetap `full` agar tidak mengubah baseline diam-diam. User memilih privacy lebih ketat setelah feature tersedia.

## Migration and rollback

Migration additive dengan versioned visibility policy. Existing accounts mendapat `full` secara eksplisit atau melalui deterministic default.

Rollout harus serentak pada semua read surfaces sebelum UI menawarkan mode selain full. Tidak boleh mengaktifkan privacy toggle bila report/export/notification masih memakai full dataset.

Rollback UI tidak boleh mengabaikan stored restrictive policy. Jika runtime baru harus di-forward-fix, backend tetap enforce policy. Jangan rollback ke code yang mengirim full data ketika DB sudah menyimpan `private`.

## Test and acceptance criteria

- Detail restricted tidak pernah dikirim ke browser/network response.
- `balance_only` tidak mengirim transaction/reconciliation detail.
- `private` tidak masuk viewer account list atau derived aggregate.
- Household/period/category total tidak dapat merekonstruksi private amount melalui endpoint lain.
- Search/filter/autocomplete tidak membocorkan hidden transaction/account.
- Export mematuhi projection.
- Notification recipient hanya menerima allowed fields.
- Shared mirror tetap shared-only.
- Administrator normal UI tidak bypass personal privacy.
- Write ownership tetap backend-enforced terpisah dari read mode.
- Policy change stale `row_version` ditolak dan audited.
- Cache invalidation tidak menyajikan data dari mode visibility sebelumnya.
- Restore mempertahankan policy dan tidak default ke lebih permisif.

## Risks

- Inference attack dari aggregate atau comparison endpoint.
- Inconsistent projection antar service.
- Cache stale setelah privacy downgrade.
- UI membingungkan jika total berbeda antar user tanpa penjelasan yang tepat.
- Backup/export boundary tercampur dan membuka data private.

## Decision

Design baseline memilih backend projection canonical dengan mode `full`, `balance_only`, dan `private`. `contribution_only` tetap blocked sampai actual contribution RFC-0013 implemented.

Existing two-user full transparency tetap policy runtime saat ini. RFC tetap Proposed. Belum ada approval schema, privacy toggle, projection implementation, atau authorization-matrix change.

## Links

- `0013-contribution-and-cost-sharing.md`
- `../AUTHORIZATION_MATRIX.md`
- `../SECURITY_MODEL.md`
- `../../api/_lib/services/core.js`
- `../../api/_lib/services/readModels.js`

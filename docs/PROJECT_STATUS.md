# Project Status

> **Status:** Snapshot  
> **Purpose:** Ringkasan kondisi source/runtime yang didukung **sekarang**.  
> **Update when:** Current state, supported runtime, implementation status, atau operational gap berubah.  
> **Rule:** File ini **bukan jurnal perubahan**; history berada di `CHANGELOG.md` dan Git.

## Runtime canonical

- **Active schema contract:** v21
- Node yang didukung: `22.15.0+` pada 22.x atau Node 24.x.
- Turso adalah source of truth; Google Sheets hanya mirror satu arah untuk data shared.
- Development dan Production memakai database terpisah yang ditandai `DATABASE_ENVIRONMENT`; cross-binding ditolak fail-closed.
- ADR-0007 adalah keputusan **historis/Superseded** dan tidak lagi menjadi runtime yang didukung.
- Runtime Production wajib menjalankan schema current sebelum menerima traffic dan melewati migration/integrity gate sesuai `DEPLOYMENT.md`.

## Product state

| Area | State | Catatan current |
|---|---|---|
| Rekening & saldo | Implemented/Partial | Ledger canonical, Dana Tersedia, account capability, rekonsiliasi; real-device role smoke tetap diperlukan untuk release relevan. |
| Transaksi | Partial | Income/expense/transfer/refund/adjustment canonical; multi-line item masih Planned RFC-0019. |
| Alokasi Dana | Implemented | Pembuatan Alokasi hanya membuat wadah + rekening/pengguna/periode. Tidak meminta budget awal sebagai flow utama. |
| Kebutuhan | Partial | Multi-item atomic maksimal 20 dengan **Nama kebutuhan + Kategori + Nominal + Pola** (`flexible`, `fixed_once`, `recurring`). Kategori master dapat dipakai ulang oleh beberapa kebutuhan seperti Arisan PT/Arisan Sekolah. Menambah/mengubah Kebutuhan otomatis menyesuaikan dana Alokasi dari **Dana Tersedia**; saldo fisik baru berubah ketika transaksi terjadi. `fixed_once` mem-prefill nominal saat Catat, `recurring` membuat Jadwal Rutin, dan dana kurang ditolak dengan `BUDGET_FUNDING_INSUFFICIENT`. |
| Jadwal Rutin | Partial | Recurring rule/occurrence, reminder, skip/restore, shortage notification; beberapa model participant/receipt masih deferred. |
| Target | Partial | Goal + movement + projection canonical; stages/advanced contribution masih future RFC. |
| Investasi/RDN | Implemented | Asset-centric manual tracking; RDN terpisah dari saldo operasional; compatibility histori tetap readable. |
| Dashboard | Implemented | Dana Tersedia (`safeToSpend`) menjadi angka utama agar Saldo rekening tidak terbaca sebagai uang bebas; Saldo rekening non-investasi tetap konteks sekunder. Shared view model, planning/attention state, investment overview, dan notification deep-link tetap canonical. |
| Laporan | Partial | Monthly/trend/breakdown tersedia; report document semester/tahunan dan beberapa model contribution masih future. |
| Rekonsiliasi | Implemented | Ledger reconciliation + investment reconciliation terpisah. |
| Realtime | Implemented | `sync_revisions`, `sync.state`, dependency map, visible polling, foreground/reconnect/push/BroadcastChannel, pull-to-refresh tanpa hard reload. Multi-device Production smoke tetap wajib untuk release sync-critical. |
| Notification Center/Web Push | Partial | In-app feed + preference + Push tersedia; server read receipt lintas perangkat dan real Android/iOS coverage masih gap. |
| Accessibility | Partial | Static/semantic regression kuat; axe penuh dan real-device browser coverage tetap gap. |

Detail evidence dan remaining gap berada di `IMPLEMENTATION_MATRIX.md`; behavior produk canonical berada di `product/PRODUCT_REQUIREMENTS.md`.

## Financial invariants current

- Saldo rekening adalah ledger fisik; Alokasi Dana tidak menciptakan saldo baru.
- `available_balance = balance - allocated_remaining` untuk rekening operasional.
- Kebutuhan memiliki **nama spesifik** dan kategori master terpisah di dalam Alokasi. Beberapa kebutuhan boleh memakai kategori master yang sama; transaksi baru ditautkan eksplisit lewat `budget_id` agar pemakaian tidak double-count. Delta Kebutuhan secara otomatis fund/release Alokasi bila aman; operasi tersebut **tidak** membuat transaksi ledger.
- Bila Dana Tersedia tidak cukup, seluruh mutation Kebutuhan gagal atomic dan frontend menjelaskan total kebutuhan, dana tersedia, serta kekurangan. Draft lokal tidak boleh hilang hanya karena sync/reconnect.
- Transfer internal netral terhadap total income/expense.
- Saldo RDN dan nilai aset tidak masuk Dana Tersedia operasional.

## Auth dan session current

- Auth desktop dan mobile: tombol Google branded Saldo Bersama.
- Production canonical memakai **Authorization Code flow** server-side `/api/auth/google/start` → callback → Google token → **Firebase Identity Toolkit** → signed session server.
- Localhost/device emulation memakai Firebase popup fallback.
- Authorization tetap backend deny-by-default berdasarkan registry user/session, role, scope, dan ownership/capability.

## Realtime current

- Satu Sync Coordinator menangani revision check dan selective invalidation.
- Reconnect memiliki satu owner; foreground tidak menjalankan refresh Dashboard kedua di luar revision flow.
- Automatic sync memberi stale-data warning hanya setelah kegagalan berulang; transient error pertama tidak membanjiri UI.
- Pull-to-refresh mobile memakai coordinator yang sama, tidak memakai `window.location.reload()`, dan tidak menghapus draft/form.

## Workflow saat ini

- Development rutin mengikuti `docs/WORKFLOW.md` dan `docs/GIT_WORKFLOW.md`.
- Full local verification canonical: `npm run verify`.
- Clean source delivery: `npm run zip`. Jika verification gagal, command exit non-zero dan **tidak membuat archive baru**.
- Direct `main` memakai managed pre-push fail-closed; GitHub **Quality** menjadi verification server-side sekunder.

## Open operational risks

- Release schema-sensitive Production memakai satu workflow `npm run prod:update`; evidence yang dikumpulkan mencakup backup verified fresh dari schema awal, migration atomik/integrity PASS, promotion candidate yang sama, dan live schema/runtime sinkron.
- Real Administrator/Member smoke pada device/browser target tetap diperlukan untuk auth, accessibility, PWA/Push, dan perubahan responsive yang relevan.
- Restore drill nyata dan external alert delivery tetap operational evidence terpisah dari source implementation.
- RFC/roadmap Planned tidak boleh dianggap runtime hanya karena dokumennya tersedia.

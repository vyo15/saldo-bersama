# Project Status

> **Status:** Snapshot  
> **Purpose:** Ringkasan kondisi source/runtime yang didukung **sekarang**.  
> **Update when:** Current state, supported runtime, implementation status, atau operational gap berubah.  
> **Rule:** File ini **bukan jurnal perubahan**; history berada di `CHANGELOG.md` dan Git.

## Runtime canonical

- **Active schema contract:** v23
- Node yang didukung: `22.15.0+` pada 22.x atau Node 24.x.
- Turso adalah source of truth; Google Sheets hanya mirror satu arah untuk data shared.
- Development dan Production memakai database terpisah yang ditandai `DATABASE_ENVIRONMENT`; cross-binding ditolak fail-closed.
- ADR-0007 adalah keputusan **historis/Superseded** dan tidak lagi menjadi runtime yang didukung.
- Runtime Production wajib menjalankan schema current sebelum menerima traffic dan melewati migration/integrity gate sesuai `DEPLOYMENT.md`.

## Product state

| Area | State | Catatan current |
|---|---|---|
| Rekening & saldo | Implemented/Partial | Ledger canonical, Dana Tersedia, account capability, rekonsiliasi; real-device role smoke tetap diperlukan untuk release relevan. |
| Transaksi | Partial | Income/expense/transfer/refund/adjustment canonical; desktop memakai workspace analitik khusus dengan ringkasan arus kas bulanan, transaksi cepat, kategori pengeluaran terbesar, `Pakai lagi`, ledger modern, planning context, satu overflow action per row, dan detail drawer. Mobile tetap history-first dengan composer/filter canonical. Multi-line item masih Planned RFC-0019. |
| Alokasi Dana | Implemented | **Atur Dana** memakai ringkasan dana allocatable multi-rekening yang tetap account-bound; generic funding memilih rekening lebih dulu. Kartu Alokasi kini compact dan seluruh surface membuka detail tanpa CTA `Dana ke…`/`Lihat detail`; adjustment contextual berada di detail/attention dengan source+target terkunci. Pembuatan **Alokasi baru** menyimpan wadah + Kebutuhan awal dalam satu flow atomic; ownership mengikuti rekening personal/Bersama. Pemanis kartu dan pilihan sisa return/carry tetap tersedia melalui progressive `Tampilan & periode`; period type/start/end diturunkan sistem. |
| Kebutuhan | Partial | Multi-item atomic maksimal 20 dengan **Nama kebutuhan + Kategori + Nominal + Pola** (`flexible`, `fixed_once`, `recurring`). Kategori master dapat dipakai ulang oleh beberapa kebutuhan seperti Arisan PT/Arisan Sekolah. Menambah/mengubah Kebutuhan otomatis menyesuaikan dana Alokasi dari **Dana Tersedia**; saldo fisik baru berubah ketika transaksi terjadi. `fixed_once` mem-prefill nominal saat Catat, `recurring` membuat Jadwal Rutin; saat Dana Tersedia kurang, Kebutuhan tetap tersimpan dan dana yang tersedia dialokasikan parsial dengan shortage yang terlihat di UI. Pada Catat Pengeluaran generic, smart matching rekening+kategori+periode memakai flow **0/1/banyak kandidat**: nol kandidat langsung memakai Dana Tersedia, satu kandidat auto-link namun tetap editable, dan beberapa kandidat meminta pilihan user. |
| Jadwal Rutin | Partial | Recurring rule/occurrence, reminder, skip/restore, shortage notification; jadwal yang berasal dari Kewajiban dikelola dari domain internal Komitmen agar tidak drift; projection memakai rolling horizon 24 bulan yang diperbarui scheduler per periode agar tenor panjang tetap ringan. |
| Kewajiban | Implemented | KPR/cicilan/pinjaman/Arisan memakai ledger progres + satu Jadwal Rutin canonical. Onboarding KPR lama mendukung posisi **cicilan berikutnya X/Y**, tanggal pembayaran berikutnya, dan akhir kontrak opsional tanpa merekonstruksi histori lama. KPR tidak menebak pokok flat: progress cicilan bergerak saat occurrence lunas, sedangkan sisa pokok hanya berubah dari nilai aktual/reconciliation; kalkulasi flat tetap tersedia untuk tipe utang non-KPR yang sesuai. Kewajiban yang Kebutuhan+Alokasinya funded penuh dicatat scheduler pada tanggal jatuh tempo, sedangkan yang belum funded tetap menunggu aktual. Penerimaan Arisan tetap income canonical. |
| Target | Partial | Goal + movement + projection canonical; setoran sukses memakai in-app achievement postcard berbasis hasil server dengan milestone 25/50/75/90/100%, finite/reduced-motion safe; stages/advanced contribution masih future RFC. |
| Investasi/RDN | Implemented | Asset-centric manual tracking; RDN terpisah dari saldo operasional; compatibility histori tetap readable. |
| Dashboard | Implemented | Dana Tersedia (`safeToSpend`) menjadi angka utama agar total saldo rekening tidak terbaca sebagai uang bebas; **Total saldo rekening** non-investasi tetap terlihat sebagai konteks sekunder bersama Aman/hari dan Sisa di Alokasi. Mobile menggabungkan Masuk/Keluar/Selisih ke hero compact, lalu attention/shortcut/rencana/aktivitas secara decision-first; shortcut tidak menggandakan `Atur Dana` dari bottom navigation dan memakai **Rekening · Target · Investasi · Cocokkan**. Bottom navigation memakai **Beranda · Atur Dana · CATAT · Transaksi · Lainnya**; `CATAT` membuka launcher aktivitas satu-kali-pilih yang meneruskan ke form kontekstual tanpa meminta jenis transaksi ulang. Desktop tetap analytical workspace kaya data tanpa mengubah curved sidebar canonical. Shared view model, planning/attention state, investment overview, dan notification deep-link tetap canonical. |
| Laporan | Partial | Monthly/trend/breakdown tersedia termasuk aktivitas Kewajiban (pokok, bunga/biaya, setoran/penerimaan Arisan). Desktop memakai analytical dashboard khusus: hero kondisi keuangan/tren, panel kategori terbesar, KPI, penggunaan Alokasi, Kebutuhan vs aktual, aktivitas Kewajiban, transaksi pendukung, rincian rekening/pencatat, serta dokumen PDF/Excel; context bar periode/scope/unduh tetap sticky dan curved sidebar canonical tidak diubah. Mobile tetap compact dan statis. Report document semester/tahunan masih future. |
| Rekonsiliasi | Implemented | Ledger reconciliation + investment reconciliation terpisah; desktop lapang memakai workspace dua panel untuk membandingkan input saldo dan riwayat, sementara mobile mempertahankan disclosure riwayat. Pengingat stale configurable 0/14/30/60 hari (default 30) tanpa mengubah checkpoint reconciliation. |
| Realtime | Implemented | `sync_revisions`, `sync.state`, dependency map, visible polling, foreground/reconnect/push/BroadcastChannel, pull-to-refresh tanpa hard reload. Multi-device Production smoke tetap wajib untuk release sync-critical. |
| Notification Center/Web Push | Partial | Task-first in-app feed + preference + Push tersedia; read receipt server-side lintas perangkat memakai fingerprint kondisi, cadence rekonsiliasi configurable, reminder konsistensi pencatatan opt-in actor-scoped, completion Push default mati. Real Android/iOS coverage masih gap. |
| Accessibility | Partial | Static/semantic regression kuat; axe penuh dan real-device browser coverage tetap gap. |

Detail evidence dan remaining gap berada di `IMPLEMENTATION_MATRIX.md`; behavior produk canonical berada di `product/PRODUCT_REQUIREMENTS.md`.

## Financial invariants current

- Saldo rekening adalah ledger fisik; Alokasi Dana tidak menciptakan saldo baru.
- `available_balance = balance - allocated_remaining` untuk rekening operasional.
- Kebutuhan memiliki **nama spesifik** dan kategori master terpisah di dalam Alokasi. Beberapa kebutuhan boleh memakai kategori master yang sama; transaksi baru ditautkan eksplisit lewat `budget_id` agar pemakaian tidak double-count. Delta Kebutuhan secara otomatis fund/release Alokasi bila aman; operasi tersebut **tidak** membuat transaksi ledger.
- Bila Dana Tersedia tidak cukup, Kebutuhan tetap tersimpan dan Alokasi mengikat dana sebanyak yang benar-benar tersedia; frontend menjelaskan dana tersedia serta kekurangan tanpa membuat saldo/ledger fiktif. Draft lokal tidak boleh hilang hanya karena sync/reconnect.
- Transfer internal netral terhadap total income/expense.
- Saldo RDN dan nilai aset tidak masuk Dana Tersedia operasional.
- Komitmen bukan saldo baru: KPR/cicilan/pinjaman menyimpan sisa kewajiban, Arisan menyimpan progres setoran/penerimaan, dan saldo rekening hanya berubah melalui transaksi aktual canonical.

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

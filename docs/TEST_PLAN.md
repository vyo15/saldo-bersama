# Test Plan

> **Status:** Canonical  
> **Purpose:** Regression contract evergreen untuk behavior/domain yang harus tetap benar.  
> **Update when:** Behavior canonical, invariant, atau test coverage wajib berubah.  
> **Rule:** Bukan jurnal patch; tanggal, nama hardening, dan hasil run berada di Git/CHANGELOG/CI.

## Prinsip test

- Uji **behavior/contract**, bukan bentuk implementation internal.
- Static/source contract test hanya untuk literal yang memang harus stabil: route, dependency boundary, forbidden API, security/architecture invariant, dan action registry.
- **Jangan mengunci nama variabel lokal**, urutan helper internal, atau struktur JSX yang tidak menjadi contract.
- Bug/regression baru harus memiliki test yang gagal sebelum fix dan lulus setelah fix bila feasible.
- Source, test, dan docs canonical harus menyatakan invariant yang sama.
- Full gate final berjalan pada tree yang sama dengan artifact/delivery.

## Automated gate canonical

`npm run verify` harus mencakup source validation, lint/syntax, frontend regression, production build, build budget, rendered browser smoke, backend regression/coverage, serta governance/security tests.

Minimum contract:

- Schema Production harus versi 23 sebelum runtime current menerima traffic.
- Node didukung: `22.15.0+` pada 22.x atau Node 24.x.
- `npm run zip` hanya membuat clean archive bila full verification PASS; verification gagal harus exit non-zero dan tidak membuat archive baru.
- Generated build/test artifact dibersihkan setelah gate tanpa menghapus dependency, `.env.local`, `.vercel`, atau repository Git.

## Financial invariants

### Saldo dan parity read model

- Semua nominal Rupiah tetap integer.
- `visibleAccounts()` dan `accountBalanceAsOf()` wajib **parity** untuk cutoff/status yang sama.
- Income/refund menambah destination; expense mengurangi source; transfer mengurangi source dan menambah destination tanpa masuk total income/expense.
- Cancelled/archived transaction tidak memengaruhi saldo.
- Rekening Investasi/RDN mengikuti event investasi canonical dan tidak masuk Dana Tersedia operasional.
- `available_balance = balance - allocated_remaining`; Alokasi tidak menciptakan saldo baru.
- Transaction yang memakai Alokasi memakai source account yang sama; covered expense menurunkan balance dan allocated remaining bersama sehingga free funds tidak double-debit.

### Idempotency, concurrency, dan audit

- Double-submit coalesce/replay memakai idempotency key yang sama.
- `OUTCOME_UNKNOWN` tidak boleh mengizinkan payload mutation berbeda pada action yang sama sampai hasil definitif.
- Stale `row_version` menghasilkan conflict, bukan overwrite.
- Audit penting append-only dan actor berasal dari server/session canonical.
- External side effect mereservasi idempotency sebelum side effect.

## Authentication, session, dan authorization

- production canonical memulai Google OAuth melalui `/api/auth/google/start`, memvalidasi state/nonce + PKCE, lalu callback melakukan Google token exchange dan Firebase verification.
- Localhost/device emulation menggunakan `signInWithPopup` sebagai fallback developer flow.
- Desktop dan halaman login mobile tidak merender tombol/iframe Google Identity Services.
- Google ID token/exchange berakhir pada Firebase ID token melalui Firebase Identity Toolkit sebelum signed session server dibuat.
- Registry `users` dan `user_sessions` tetap source capability/session; revoked/inactive/role mismatch mengeluarkan client dari authenticated state.
- Authorization default deny dan tidak mempercayai actor/role/scope dari payload client.
- Shared/personal memengaruhi capability write, bukan visibility finansial pasangan.

## Rekening, transaksi, dan kategori

### Rekening

- Create/update rekening mengikuti type/template/ownership validation.
- Rekening inactive/hidden tidak menjadi pilihan write user-facing.
- Saldo, Dialokasikan, dan Dana Tersedia tidak tertukar pada read model/UI.
- Transfer destination readable dapat berbeda ownership; source harus operable actor dan approval flow shared→personal Member tetap canonical.

### Transaksi

- Income, expense, transfer, refund, adjustment mematuhi transaction shape database/service.
- Smart default rekening/kategori/Kebutuhan tidak auto-submit. Tepat satu Kebutuhan matching boleh auto-link dan harus tetap terlihat/editable di **Penggunaan dana**; dua atau lebih kandidat—including kategori sama pada Alokasi yang sama—harus meminta pilihan user; state ambigu belum memilih tidak boleh disamakan dengan Dana Tersedia; **Dana Tersedia** dapat dipilih eksplisit; nol kandidat langsung tampil sebagai Dana Tersedia dan dapat disimpan tanpa picker Alokasi manual atau konfirmasi kedua.
- Composer mobile menjaga tanggal default hari ini terlihat pada jalur utama, sedangkan metode pembayaran/catatan berada pada disclosure `Catatan & metode pembayaran`; entry `+ Catat` mengunci jenis yang sudah dipilih, memakai copy rekening/CTA kontekstual, dan tetap mempertahankan semua capability form.
- Desktop transaksi memakai `reports.monthly` canonical untuk ringkasan seluruh periode, bukan agregasi dari page slice 50 transaksi; panel aktivitas, kategori terbesar, dan net cashflow wajib tetap benar saat filter ledger aktif.
- Ledger desktop menampilkan konteks Kebutuhan/Alokasi/Jadwal/Target/Kewajiban dari read model backend, menjaga satu overflow action per row, dan membuka detail sebagai drawer; mobile tetap memakai history/card + modal tanpa business flow duplikat.
- Quick-create desktop hanya memberi `initialType` ke composer canonical, sedangkan `Pakai lagi` hanya membuat draft baru dari transaksi aktif yang repeatable dan tidak pernah auto-submit.
- Expense tanpa Kebutuhan tidak memakai konfirmasi `Simpan tetap` khusus unallocated: nol kandidat atau pilihan eksplisit **Dana Tersedia** cukup dengan satu submit karena preview dampak sudah transparan. Duplicate confirmation, overspend guard/alasan, period lock, dan transfer approval tidak boleh hilang karena progressive UI.
- Preview lokal menguji Kebutuhan, saldo rekening, dan Dana Tersedia untuk expense teralokasi/tidak teralokasi, transfer operasional↔operasional, transfer ke/dari Investasi/RDN/protected account, income/refund, serta edit dengan rumus reverse-old + apply-new. Label preview harus menyatakan perkiraan.
- Post-save create memakai snapshot hasil `refreshOverview()` untuk saldo/Dana Tersedia/Kebutuhan ketika refresh berhasil dan memiliki fallback aman bila refresh gagal.
- Cancel/archive/retry menjaga ledger, audit, dan idempotency.
- RFC-0019 belum runtime: satu transaksi canonical masih satu category/Alokasi/Kebutuhan; test tidak boleh mengasumsikan line item sudah implemented.

### Kategori

- Kategori expense/income mengikuti type/nature/status canonical.
- Approval `masterDataRequests.review` memicu dependency realtime kategori sehingga device Member tidak memerlukan restart aplikasi.
- Kategori master tidak diduplikasi hanya karena dipakai pada beberapa Alokasi.

## Alokasi Dana dan Kebutuhan

### Flow Alokasi canonical

- Create Alokasi canonical memakai **satu flow**: nama, rekening sumber, pengguna/penerima bila relevan, Kebutuhan awal, **Pemanis kartu**, serta pilihan sisa periode **Kembalikan ke dana tersedia / Tetap di alokasi berikutnya**. Periode awal bulanan dan tanggal periodenya diturunkan sistem.
- `envelopes.createWithNeeds` menyimpan rule + periode + Kebutuhan awal atomic sehingga kegagalan validasi tidak meninggalkan Alokasi kosong.
- Manual fund/release tetap diuji sebagai advanced/compatibility control dan tidak membuat transaksi ledger.
- Realokasi antar rekening tidak boleh menjadi envelope movement lintas account; gunakan Transfer canonical.

### Auto-funding Kebutuhan

- `budgets.batchCreate` mendukung maksimal 20 item dan atomic. Identitas item memakai **nama kebutuhan** pada periode/ownership/Alokasi, sehingga beberapa kebutuhan boleh memakai kategori yang sama; nama kebutuhan duplikat pada Alokasi yang sama ditolak. Pola `recurring` dapat membuat Jadwal Rutin dalam transaction yang sama.
- Menambah Kebutuhan otomatis menaikkan dana Alokasi sebesar delta dari Dana Tersedia tanpa mengubah saldo fisik.
- Edit nominal hanya menyesuaikan delta; nominal tidak boleh turun di bawah usage aktual.
- Bila Dana Tersedia kurang, Kebutuhan tetap tersimpan dan funding hanya mengikat jumlah yang tersedia. Response wajib menjelaskan `requestedAmount`, `amount`, `availableAmount`, dan `shortageAmount`; saldo fisik tidak berubah dan tidak boleh ada ledger fiktif.
- Frontend menampilkan total yang perlu disiapkan, dana tersedia, jumlah yang dapat dialokasikan sekarang, dan kekurangan; **Simpan tetap diperbolehkan** saat shortage.
- Archive/delete melepaskan hanya remaining need yang aman. Dana terpakai, reserved/committed, kebutuhan lain, dan inferred buffer tidak boleh ikut dilepas.
- Restore Kebutuhan mendanai ulang remaining need sebanyak dana yang tersedia dan tetap mempertahankan rencana bila masih kurang.
- Copy Kebutuhan saat period close bersifat opt-in; histori transaksi/usage tidak disalin dan funding periode tujuan mengikuti rule current.
- `/anggaran` hanya compatibility redirect; tidak boleh menghidupkan surface Anggaran kedua.

## Jadwal Rutin, Kewajiban, dan Target

- Recurring occurrence mengikuti timezone Asia/Jakarta, idempotency, account capability, completion/skip/restore, dan shortage rule.
- Kebutuhan `recurring` yang dibuat bersama batch harus memakai ownership/source account kompatibel; satu pelanggaran me-rollback seluruh batch.
- Kebutuhan `fixed_once` harus mem-prefill sisa nominal saat aksi **Catat** dan tidak menampilkan aksi Catat lagi ketika sisa sudah Rp0. Setelah transaksi contextual `fixed_once` sukses, overlay juga tidak boleh menawarkan **Tambah lagi** untuk Kebutuhan yang sama.
- Surface **Atur Dana** menampilkan total compact Dana yang bisa dialokasikan lintas rekening + breakdown sumber tanpa menganggapnya satu pool uang. Flow generik **Alokasikan dana** wajib meminta rekening lebih dulu ketika ada beberapa sumber, lalu hanya menawarkan Alokasi dengan rekening sumber yang sama. Kartu Alokasi wajib clickable sebagai satu surface, tidak memiliki CTA `Dana ke…` atau `Lihat detail`, dan hanya menampilkan satu signal kontekstual paling penting; adjustment contextual dari detail/attention mengunci rekening + tujuan. Impact preview wajib menunjukkan Dana bebas dan sisa Alokasi sebelum→sesudah serta Saldo rekening tidak berubah. Create user-facing memakai **Alokasi baru** dan langsung memuat Kebutuhan awal dalam modal yang sama; rekening personal mengunci pengguna ke pemilik, rekening Bersama menawarkan Bersama/anggota sesuai capability. **Pemanis kartu** dan pilihan **Kembalikan ke dana tersedia / Tetap di alokasi berikutnya** tetap tersedia melalui **Tampilan & periode**; period type/start/end tidak diminta user. CTA canonical **Buat & alokasikan** atau **Buat dengan Rp…** saat dana hanya cukup sebagian.
- Composer transaksi expense: tepat satu Kebutuhan kompatibel auto-link `budget_id` + Alokasi dan tetap dapat diubah lewat **Penggunaan dana**; lebih dari satu kandidat meminta pilihan; nol kandidat langsung memakai **Dana Tersedia** dan dapat disimpan tanpa konfirmasi kedua. Pemilihan Alokasi manual terpisah tidak ditampilkan. Aksi `+` dari Kebutuhan membawa **planning intent terkunci** Kebutuhan/Alokasi/rekening/kategori ke composer sejak render pertama sehingga pilihan tetap terisi walau snapshot overview sedang tertinggal atau ada Kebutuhan lain dengan kategori sama; smart-selection generic tidak boleh menimpa context ini. Pada entry generic, perubahan rekening/kategori/tanggal melepas pilihan stale dan menghitung ulang kandidat. Pada entry contextual, rekening/kategori/Kebutuhan terkunci dan tanggal dibatasi ke periode Alokasi. Submit contextual wajib fail-closed bila ID context berubah. Submit multi-kandidat tanpa pilihan wajib gagal pada field Penggunaan dana; memilih **Dana Tersedia** secara eksplisit langsung dapat disimpan. Impact preview wajib membedakan rekening, sisa Kebutuhan, dan Dana Tersedia serta menyebut sumber pengurangan dana.
- Jadwal Rutin expense: tepat satu Kebutuhan kompatibel auto-link `budget_id`; lebih dari satu kandidat meminta pilihan; nol kandidat tetap dapat disimpan mandiri. Perubahan kategori/rekening harus melepas/menyesuaikan link yang tidak lagi valid dan backend tetap memvalidasi kategori + ownership + rekening sumber.
- Kewajiban (domain internal `commitments`) dapat membawa `budget_id` ke recurring rule managed; edit tanpa `budget_id` mempertahankan link existing, write `auto_debit=true` legacy dari client tetap disimpan sebagai false, dan `listCommitments` mengembalikan `budget_id` recurring untuk edit UI. Resolver wajib mengikuti salinan Kebutuhan periode berjalan berdasarkan identity kategori + Alokasi + nama + scope agar link tidak putus setelah rollover. Dashboard tidak boleh menambah `reservedBills` untuk Jadwal/Kewajiban yang Kebutuhannya sudah didanai.
- Lifecycle UI planning: create/edit/penerimaan Kewajiban, Alokasikan dana manual, dan Pengingat manual memakai dirty guard canonical; dismiss dirty meminta konfirmasi, Batal/Tutup eksplisit langsung menutup, dan open→close→open tidak memerlukan refresh. Setelah save reminder yang modalnya tetap terbuka, baseline draft harus kembali clean.
- Jika dua kebutuhan aktif memakai kategori master yang sama pada Alokasi yang sama, transaksi legacy tanpa `budget_id` tidak boleh dihitung ke keduanya; transaksi baru dari detail kebutuhan wajib membawa `budget_id`.
- Target movement tidak boleh memanipulasi saldo tanpa transaksi/movement canonical dan reversal harus audit-safe.
- Setoran Target yang sukses baru boleh memicu achievement in-app setelah response server definitif; progress/milestone diturunkan dari `goal.current_amount` hasil server, 100% tidak auto-mengubah lifecycle menjadi `completed`, feedback tidak dobel dengan global process indicator, dan reduced-motion tetap menyampaikan copy/progress tanpa animasi dekoratif.
- Kewajiban KPR/cicilan/pinjaman membuat tepat satu `recurring_rule`; jadwal tertaut tidak dapat diedit/dihapus langsung dari Jadwal Rutin dan berhenti otomatis saat kewajiban selesai. Reversal pembayaran terakhir mengaktifkan kembali Kewajiban + jadwal tanpa kehilangan histori. UI Kewajiban memakai aksi **Hentikan kewajiban** untuk `commitments.archive`; backend mempertahankan ledger/transaksi historis dan hanya menghentikan future projection yang reproducible. Tidak ada hard-delete atau restore manual yang disamarkan sebagai Hapus. Rolling horizon 24 bulan harus direfresh sekali per periode sehingga tenor panjang tidak dipregenerate sampai akhir dan tidak berhenti setelah horizon awal.
- Pembayaran KPR/cicilan dengan `remaining_principal` menghitung pokok = saldo sebelum - saldo sesudah dan bunga/biaya = pembayaran - pokok. Tanpa sisa pokok, pembayaran tetap valid tetapi `principal_known=0` dan UI/report wajib menandainya perlu diperbarui.
- Arisan mengurangi sisa setoran lewat occurrence pembayaran, dapat mencatat penerimaan income terpisah sampai maksimal nilai hak Arisan, dan penerimaan tidak menutup sisa setoran yang masih berjalan.
- UI tidak menawarkan Autodebet pada Kewajiban/Jadwal Rutin; kolom legacy tetap readable dan write baru selalu `false`. Khusus Jadwal managed Kewajiban yang menaut ke Kebutuhan + Alokasi aktif, scheduler mulai **tanggal jatuh tempo** mencatat pembayaran canonical otomatis hanya bila sisa Kebutuhan dan Alokasi sama-sama cukup. Jika dana baru siap setelah lewat jatuh tempo, occurrence overdue harus dapat dikejar otomatis tepat sekali. Tidak ada partial debit; bila syarat tidak terpenuhi, saldo tidak berubah. Cicilan flat terakhir tidak boleh overpay dan nominal otomatis dibatasi pada sisa pokok + bunga flat periode itu.
- Laporan bulanan memisahkan aktivitas Kewajiban (pembayaran kewajiban, pokok teridentifikasi, bunga/biaya, pokok belum diketahui, setoran/penerimaan Arisan) tanpa mengubah arus kas canonical.
- Reminder manual terikat entity aktif, satu scheduled reminder per entity/user, dan dispatch nonterminal mencegah duplikasi.

## Investasi dan RDN

- UI utama asset-centric: saham/reksa dana, bukan hierarchy broker/RDN.
- Direct opening position dan Buy/Sell current bersifat accounting-only (`cash_effect_enabled=0`) dan tidak mengubah Saldo RDN.
- Histori legacy cash-enabled tetap readable dan diproyeksikan oleh `investment_account_events`.
- Oversell, invalid fee/date, stale version, dan ownership mismatch ditolak.
- Valuation/reconciliation/correction append-only sesuai authorization.
- `accounts.list` tidak mengekspos hidden compatibility account.
- Backup/restore menjaga quantity, cost basis, P/L, flag cash effect, hidden account marker, dan history authoritative.

## Dashboard, laporan, dan rekonsiliasi

- Dashboard memakai **Dana Tersedia** (`safeToSpend`) sebagai angka utama dengan helper “Sisa uang yang aman dipakai setelah kebutuhan dan tagihan.”, menempatkan Saldo rekening non-investasi + Aman dipakai / hari sebagai konteks sekunder, dan tidak double-count RDN/market value. Dana Tersedia harus sudah memperhitungkan Alokasi Dana, proteksi, dan komitmen Jadwal Rutin operasional di luar Alokasi; Jadwal Rutin yang tertaut ke Kebutuhan yang sudah didanai Alokasi tidak boleh dikurangi dua kali.
- Hero mobile menguji **Dana Tersedia** sebagai nominal utama, **Aman dipakai / hari**, **Total saldo rekening**, dan **Sisa di Alokasi** sebagai konteks sekunder yang tetap terlihat. Strip arus kas pada hero menguji `Masuk = income + refund`, `Keluar = expense`, dan `Selisih = Masuk - Keluar`; `Selisih` tidak dilabeli `Sisa`.
- Mobile decision-first menguji urutan hero Dana Tersedia compact → `Perlu dilakukan` hanya saat alert aktif → quick action `Rekening / Target / Investasi / Cocokkan` → `Rencana terdekat` gabungan Kebutuhan+Jadwal → Aktivitas terbaru → Investasi hanya bila ada nilai/holding; standalone `Insight Keuangan` dan standalone card `Bulan ini` tidak boleh kembali.
- Navigasi bawah mobile wajib berurutan **Beranda · Atur Dana · CATAT · Transaksi · Lainnya**; `Laporan` hanya berada di menu sekunder `Lainnya`.
- Prioritas alert mengutamakan tindakan manusia: investment mismatch > recurring overdue > budget/envelope overspend > recurring due > funding gap > unallocated expense > goal behind > stale reconciliation. Reconciliation non-investasi yang sudah dicocokkan tetap checkpoint dan tidak membangkitkan persistent historical-difference alert.
- Report monthly/trend tidak menghitung Transfer sebagai income/expense dan memakai snapshot/read transaction konsisten.
- Rekonsiliasi non-investasi dan Investasi/RDN memakai service berbeda; generic reconciliation menolak RDN.
- Reconciliation checkpoint menyimpan mismatch historis tanpa persistent active alert setelah user melakukan pencocokan eksplisit.

## Notification dan Web Push

- Pengaturan Notifikasi perangkat menyediakan preview native lokal bertema **Liburan** dan **Masa Depan**; tombol dijalankan dari user gesture, meminta permission bila perlu, dan menggunakan service worker canonical.
- Preview lokal tidak mengubah subscription/backend queue. Tap notifikasi harus deep-link ke `/target`; rich image adalah best-effort dan boleh diabaikan OS tanpa dianggap gagal selama title/body native tetap tampil.

- Notification Center menggunakan feed/action canonical yang sama untuk mobile/desktop dan status baca server-side actor yang sinkron lintas perangkat. Read receipt memakai fingerprint kondisi; menandai dibaca tidak menyelesaikan alert aktif, sedangkan perubahan fingerprint harus tampil unread kembali.
- Lock-screen Push tidak memuat nominal, rekening, merchant, atau nama objek finansial sensitif.
- Flow aktivasi Web Push harus memberi disclosure sebelum register bahwa satu notifikasi uji otomatis akan dikirim; test/preview manual tetap terpisah dan permission tidak diminta tanpa user gesture.
- Preference user dihormati; `recurring_completed` default mati, cadence rekonsiliasi default 30 hari, reminder konsistensi pencatatan default mati/opt-in, dan VAPID incomplete menonaktifkan Push fail-closed tanpa merusak in-app notifications.
- Cadence rekonsiliasi menerima hanya 0/14/30/60 hari; reminder konsistensi pencatatan hanya 0/3/5/7 hari, actor-scoped, dedupe, dan tidak menganggap hari tanpa transaksi sebagai error. Scheduler membaca users/settings/recurring/budget/alokasi/target/unallocated/reconciliation/activity/balance dalam satu batch source read.
- Funding/recurring shortage menjelaskan kondisi actionable tanpa membuat mutation finansial otomatis.

## Global realtime dan pull-to-refresh

- Setiap public mutation server-backed memiliki dependency read-resource canonical; mutation kritis diuji **semantik**, bukan sekadar “array tidak kosong”.
- Revision naik atomic bersama mutation dispatcher atau eksplisit untuk session/job bridge.
- `sync.state` yang revision-nya tidak berubah tidak reload resource.
- Revision yang hanya mengubah satu resource family hanya me-refresh dependency tersebut.
- Baseline revision baru maju setelah mounted resource reload sukses; reload gagal harus dicoba lagi pada sync berikutnya.
- Reconnect memiliki satu owner dan tidak memicu refresh ganda; foreground hanya memakai revision-based sync.
- BroadcastChannel/push/visible polling/foreground/reconnect/pull-to-refresh menuju Sync Coordinator yang sama.
- Automatic sync transient failure tidak langsung membanjiri UI; repeated failure menampilkan stale-data warning dan sukses berikutnya membersihkannya.
- Pull-to-refresh mobile hanya aktif pada root scroller ketika berada di atas; modal/composer/mutation/input/nested-scroll/offline memblokir gesture.
- Perubahan `blocked=true` di tengah gesture mengembalikan indicator ke idle.
- Tidak ada `window.location.reload()` untuk sinkronisasi data dan draft/form lokal tidak di-reset.
- Multi-device Production smoke minimum: Member membuka picker kategori → Administrator approve → kategori muncul tanpa restart; lakukan juga mutation saldo/Alokasi/Kebutuhan yang relevan.

## UI, responsive, dan accessibility

- Loading, empty, filtered-empty, error, offline, unauthorized, maintenance, conflict tersedia sesuai surface.
- Tap target mobile ≥44×44px; text input efektif 16px; safe area, keyboard virtual, overflow, scroll restoration, dark/light, reduced-motion diuji.
- Nominal utama tidak ellipsis dan tabular/financial hierarchy tetap dapat dipindai.
- Modal: buka → tutup/batal → buka lagi serta modal A → B → kembali tidak meninggalkan overlay/history/body-lock/focus stale.
- Browser Back menutup modal lebih dulu bila contract modal berlaku.
- True-empty hanya memiliki satu primary next action dan tidak membuat record palsu.
- Regression action-ownership mencakup Kewajiban, Investasi, Alokasi Dana, Jadwal Rutin, Target, Rekening, Kategori, Transaksi, dan Dashboard: header create tidak boleh tampil bersamaan dengan create CTA true-empty; filtered-empty hanya menawarkan reset/show-all; quick-add global `Catat` menjadi launcher aktivitas tunggal. Pengeluaran/Pemasukan/Transfer harus tetap memakai composer transaksi, pembayaran Kewajiban harus memakai `pay-recurring`, Target harus meneruskan ke Alokasi, dan Investasi harus memakai flow asset-centric existing tanpa mutation ledger duplikat.
- Detail object dengan sub-item erat memakai hierarchy section/list, bukan tumpukan card setara tanpa kebutuhan.
- Honest Action Contract diuji lintas Rekening, Kategori, Alokasi, Kebutuhan, Jadwal Rutin, Target, dan Kewajiban: entry lifecycle memakai `Hapus dari daftar` sebelum preview; `Hapus permanen` hanya untuk `canDeleteUnused=true`; record berhistori harus memakai `Arsipkan`, sedangkan `commitments.archive` memakai `Hentikan kewajiban`.
- Regression harus menolak facade/action berlabel `delete/hapus` yang sebenarnya memanggil archive, serta menolak success copy yang menyatakan data dihapus bila server hanya mengarsipkan.
- Smart default/otomatisasi yang mengubah atau mengikat dana harus mempunyai disclosure/impact sebelum mutation; pilihan otomatis tetap terlihat dan dapat dikoreksi saat ambigu.

- Regression desktop wajib menjaga curved sidebar canonical, urutan analytical Dashboard, row-action overflow Transaksi, single page-level notice Target, management overflow Kewajiban, **analytical Report workspace** (hero tren + kategori + KPI + planning panels) bersama sticky report context desktop, contextual suppression floating quick-add, dan split workspace Rekonsiliasi >=1100px; behavior mobile canonical tidak boleh ikut berubah. Laporan tidak boleh menduplikasi business mutation atau mengganti shell/sidebar.

### Microcopy

- Satu fakta edukatif memiliki satu tempat utama pada satu surface.
- Copy tersebut tidak boleh diduplikasi lagi pada helper field/list bila sudah dijelaskan pada description/info canonical.
- Normal state tidak menampilkan helper/notice yang hanya mengulang label, placeholder, value, atau state. Exception, warning finansial, destructive impact, recovery, error, dan conflict tetap eksplisit.
- Surface finansial normal tidak memakai jargon implementasi seperti `server`, `backend`, `ledger`, `snapshot`, `master`, atau narasi sinkronisasi/refresh kecuali konteksnya memang admin/diagnostic.
- Success state finansial memvalidasi hasil yang dipahami user: tindakan, nominal relevan, serta saldo/Dana Tersedia/status sesudahnya bila tersedia; bukan detail proses internal.
- Helper field menjelaskan field; warning finansial/destructive/recovery/error/conflict tetap dekat dengan dampaknya.
- Istilah Saldo, Dana Tersedia, Dialokasikan, Alokasi Dana, Kebutuhan, dan RDN mengikuti `product/GLOSSARY.md`.
- Normal user surface tidak menghidupkan kembali `Anggaran` sebagai fitur terpisah atau hierarchy `portfolio`/RDN pada Investasi asset-centric; istilah teknis legacy hanya boleh muncul pada compatibility/admin/maintenance yang memang membutuhkannya.

## Security, maintenance, dan recovery

- Import/restore/reset/destructive operation memakai preview, verified backup bila wajib, confirmation, integrity verification, audit, dan allowlist exact.
- `maintenance_mode` memblok write dan tidak memblok read yang dibutuhkan untuk recovery.
- Trial Reset hanya pada database Development/Production yang binding marker-nya cocok; unbound/marker asing fail-closed sebelum side effect.
- Restore tidak menghidupkan kembali expired rate-limit state atau mengubah source-of-truth mirror direction.
- Secret/token/raw financial fixture/raw stack trace tidak masuk frontend, log, commit, atau ZIP.

## Schema dan migration

- Migration berurutan, additive bila memungkinkan, dicatat di `schema_migrations`, dan current runtime version sama dengan `DATABASE_SCHEMA_VERSION`.
- Schema Production harus versi 23 sebelum deployment current menerima traffic.
- Latest migration harus didokumentasikan di `TURSO_SCHEMA.md` dan `DATA_DICTIONARY.md`.
- Untuk release schema-sensitive, `npm run prod:update` harus membuktikan backup verified fresh pada schema aktif, migration chain atomik menuju schema source, integrity PASS, promotion candidate yang sama, dan live health runtime/schema sinkron; retry memakai command yang sama.

## Dokumentasi dan governance

- `docs/INDEX.md` memetakan satu authority untuk setiap pertanyaan utama.
- Current docs tidak memakai heading tanggal patch atau `Hardening vXX`; history berada di CHANGELOG/Git/history.
- `PROJECT_STATUS.md` adalah snapshot singkat, bukan append-only log.
- `IMPLEMENTATION_MATRIX.md` hanya status/evidence/gap.
- Active docs tidak orphan dan semua local Markdown link valid.
- Product invariant kritis—terutama auto-funding Kebutuhan, transfer neutrality, RDN separation, realtime revision, dan full family transparency—harus memiliki source↔docs semantic guard.

## Manual/Production verification

Manual QA tetap wajib bila automated gate tidak dapat membuktikan environment/device behavior:

- real Administrator/Member login dan authorization;
- iPhone/Android installed-PWA flow bila PWA/Push/responsive berubah;
- production OAuth callback dan session;
- multi-device realtime untuk release sync-critical;
- migration/integrity/backup/restore drill untuk release data-critical;
- external Google bridge resource bila integrasi terkait berubah.

Evidence manual dicatat pada release/operational record yang relevan, **bukan** ditempel sebagai history baru di Test Plan.

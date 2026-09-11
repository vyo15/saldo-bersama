# Product Requirements

## Tujuan

Saldo Bersama adalah sistem pengendali keuangan keluarga privat untuk dua akun Google dalam satu rumah tangga. Sistem harus menjawab: uang keluarga berasal dari mana, berada di rekening mana, sudah dialokasikan untuk apa, siapa yang mencatat perubahan, tersisa berapa, dan apakah kewajiban, target, serta investasi keluarga masih aman. Kedua pengguna terotorisasi melihat data keuangan keluarga yang sama secara penuh; kepemilikan rekening hanya menentukan pemegang/capability operasi, bukan privasi baca.

## Pengguna dan istilah role

- **Administrator**: mengelola member, master data, rekening, maintenance, backup/restore, dan operasi administratif.
- **Member**: pengguna kedua dengan permission operasional terbatas; tidak dapat membuat atau mengelola master rekening.
- UI memakai istilah Administrator/Member. Backend mempertahankan key internal `owner` untuk Administrator demi kompatibilitas data/session existing; `ALLOWED_USERS_JSON` menerima `administrator` hanya untuk bootstrap/recovery Administrator, sedangkan anggota operasional dikelola di registry `users`.

## Invariant produk

- `REQ-FIN-001` Nominal Rupiah disimpan sebagai integer.
- `REQ-FIN-002` Saldo dihitung dari saldo awal dan seluruh cash-impact event canonical yang valid; transaksi aktif menjadi event utama, sedangkan rekening RDN juga memasukkan event buy/sell/koreksi investasi. Saldo tidak boleh diedit bebas.
- `REQ-FIN-003` Transfer mengurangi sumber dan menambah tujuan, tetapi tidak masuk total income/expense. Rekening Investasi/RDN hanya boleh masuk ledger transaksi biasa melalui Transfer; Buy/Sell/Koreksi memakai event Investasi canonical.
- `REQ-FIN-003A` Saldo RDN adalah dana investasi, bukan saldo operasional. Dashboard memisahkan Saldo rekening non-investasi dari Total investasi; Saldo RDN tidak masuk Aman digunakan, Batas aman per hari, dana belum dialokasikan, Alokasi Dana operasional, atau reserved Jadwal Rutin.
- `REQ-FIN-004` Transaksi normal menggunakan soft cancel/archive, bukan hard delete.
- `REQ-FIN-005` Write penting memakai idempotency dan audit append-only.
- `REQ-FIN-006` Edit record yang versionable menolak stale `row_version`.
- `REQ-SEC-001` Firebase identity diverifikasi server dan authorization default deny.
- `REQ-SEC-002` Kedua pengguna keluarga terotorisasi dapat membaca seluruh rekening/ledger keluarga. Role, scope, dan ownership backend membatasi write/operasi berisiko, bukan menyembunyikan data dari pasangan.
- `REQ-DATA-001` Turso adalah source of truth; Sheets hanya mirror satu arah.
- `REQ-DATA-002` Import/restore memakai preview, safety backup, apply guarded, dan integrity verification.
- `REQ-OFFLINE-001` Write finansial offline ditolak; browser tidak membuat queue write.
- `REQ-AUDIT-001` Perubahan penting memiliki actor server-side, timestamp, action, entity, dan before/after yang aman.
- `REQ-UX-001` UI menyediakan loading, empty, error, offline, unauthorized, maintenance, dan conflict state.
- `REQ-A11Y-001` Form berlabel, keyboard accessible, focus visible, kontras dan tap target memadai.

## Kebutuhan fungsional canonical

Status menggunakan **Implemented**, **Partial**, atau **Planned**. Detail bukti dan gap berada di `../IMPLEMENTATION_MATRIX.md`.

### `REQ-PROD-01` Rekening dan sumber uang — Partial

Mendukung bank, tunai, e-wallet, tabungan, dana darurat, sinking fund, investasi, rekening bersama/personal, saldo aktual, saldo aman, alokasi, dan riwayat perubahan. Transfer internal harus netral terhadap income/expense.

**Acceptance:** saldo berasal dari ledger; rekening tidak aktif tidak menerima transaksi baru; kedua pengguna terotorisasi dapat membaca rekening/ledger pasangan dengan label pemilik; capability write rekening personal tetap diverifikasi backend; saldo tersedia dibedakan dari saldo rekening.

### `REQ-PROD-02` Transaksi lengkap — Partial

Mendukung income, expense, transfer, refund, adjustment; tanggal, nominal, rekening, kategori, pencatat, merchant, metode, catatan, status aktif/cancelled/archived, idempotency, conflict, dan audit. Mobile history memakai periode + trend read-only, filter progresif, grouped-by-date list, dan detail capability-driven tanpa mengubah ledger contract.

**Gap yang memerlukan RFC/schema:** relasi refund ke transaksi asal, bukti/struk privat, draft/rencana/belum dibayar, utang, dan piutang. Participant `payer`/`beneficiary`/`liable_party` tidak menjadi kebutuhan canonical Saldo Bersama selama model produk tetap keuangan keluarga penuh; field generik `used_by` juga tidak menjadi contract canonical. Lihat RFC-0011, RFC-0012, dan catatan compatibility RFC-0013.

### `REQ-PROD-02A` Alokasi per penerima — Implemented

Alokasi Dana memisahkan ownership ledger (`scope`/`owner_user_id`) dari penerima jatah (`assignee_user_id`). `NULL` berarti Bersama; shared source dapat dialokasikan untuk Administrator atau Member. Setiap Alokasi Dana canonical wajib memiliki satu `source_account_id`. Rekening personal hanya dapat menjadi sumber jatah untuk pemilik rekening tersebut. Member hanya dapat memakai/memindahkan Jatah Bersama atau jatahnya sendiri, dan transaksi yang memakai Alokasi Dana wajib memakai rekening sumber yang sama. Nama internal `envelope`/route `/perencanaan/kantong` dipertahankan hanya untuk compatibility.


### `REQ-PROD-19` Satu pembayaran dengan beberapa kategori/Kebutuhan — Planned

Satu cash movement perlu dapat direpresentasikan sebagai beberapa line item kategori/Kebutuhan tanpa membuat saldo rekening berubah lebih dari sekali. Total line item wajib integer Rupiah dan tepat sama dengan nominal transaksi header; setiap line harus mengikuti category/Alokasi Dana yang valid dan reporting tidak boleh double-count.

**Status:** belum ada schema/runtime. `transactions.category_id` dan `transactions.envelope_period_id` masih singular. Desain dibahas di RFC-0019; multi-source payment bukan bagian MVP dan tidak boleh diakali dengan array JSON pada kolom transaksi.

### `REQ-PROD-03` Kategori kebutuhan — Partial

Kategori memiliki jenis transaksi dan `nature` untuk fixed, variable, unexpected, discretionary, emergency, savings, dan other. Kategori dapat ditambah/diarsipkan.

**Gap:** parent/subcategory dan taxonomy bertingkat menunggu RFC-0014.

### `REQ-PROD-04` Alokasi Dana — Implemented

Alokasi Dana adalah wadah bernama yang dibuat user sejak awal. Nama Alokasi berbeda dari Kebutuhan: Kebutuhan adalah rincian kategori dan nominal di dalam wadah tersebut. Bila nominal belum diketahui, UI boleh membantu menghitung dari Kategori pengeluaran aktif tetapi tidak boleh membuat Kebutuhan atau mutation finansial otomatis. Pemasukan dapat dibagi melalui Alokasi Dana daily, weekly, biweekly, monthly, paycycle, atau custom; shared/personal; rollover; overspend policy; realokasi; sisa alokasi; dan dana belum dialokasikan. Dana tersedia dapat ditambahkan ke Alokasi Dana existing atau dilepas kembali tanpa membuat transaksi ledger. Dashboard serta success flow pemasukan dapat membuka funding flow dengan rekening sumber dan nominal sebagai prefill saja; user tetap memilih Alokasi Dana dan mengonfirmasi alokasi. Alokasi bersifat account-bound: membuat/menambah Alokasi Dana tidak mengubah saldo ledger, tetapi mengurangi `available_balance`; pemakaian Alokasi Dana mengurangi saldo fisik dan sisa alokasi bersama-sama; realokasi antar rekening wajib memakai transaksi Transfer. Sisa dana yang dilepas dari Alokasi Dana dapat diteruskan ke flow setoran Target dengan konteks rekening asal tanpa auto-submit. Saat periode ditutup, rule aktif selalu memiliki periode aktif berikutnya. Policy `unallocated` membuat periode berikutnya dengan alokasi Rp0 dan melepaskan sisa ke dana tersedia, sedangkan `carry` hanya membawa sisa aktual. Pembuatan periode berikutnya tidak membuat transaksi ledger baru dan tidak menambah dana di luar saldo rekening.

### `REQ-PROD-05` Kebutuhan dalam Alokasi Dana — Partial

Alokasi Dana mendukung periodisasi harian sampai custom. Kebutuhan kategori dikelola dari detail Alokasi Dana dan memakai record budget serta relasi existing `budgets.envelope_rule_id`. Kategori tetap master data bersama dan kategori yang sama boleh dipakai pada lebih dari satu Alokasi Dana; identitas Kebutuhan periode karena itu mencakup kategori, ownership, dan Alokasi Dana. Pemakaian nominal Kebutuhan hanya menghitung transaksi aktif pada kategori, ownership, periode, dan Alokasi Dana yang sama. Detail Alokasi Dana merangkum total nominal Kebutuhan aktif periode berjalan terhadap `allocated_amount`, bukan terhadap sisa setelah transaksi; selisih lebih ditampilkan sebagai dana belum direncanakan, sedangkan kekurangan hanya menjadi suggestion untuk `envelopes.adjustAllocation` yang tetap memerlukan konfirmasi user dan guard backend. Menambah atau mengedit Kebutuhan tidak boleh otomatis memindahkan dana. Tidak ada surface Anggaran terpisah pada UI; `/anggaran` hanya compatibility redirect ke detail/overview Alokasi Dana agar tidak menduplikasi fungsi. Dashboard, laporan, dan push tetap memberi peringatan actionable ketika nominal Kebutuhan terlampaui. Saat menutup periode, user dapat memilih `Pakai lagi kebutuhan di periode berikutnya`. Sistem hanya menyalin kategori dan nominal rencana Kebutuhan aktif ke periode tujuan bila identitas Kebutuhan tersebut belum ada. Rencana target yang sudah ada tidak ditimpa, dan transaksi, saldo, histori pemakaian, serta dana Alokasi tidak ikut disalin.

**Batas saat ini:** Kebutuhan masih berupa record budget per periode, bukan rule recurrence/multi-periode independen. Continuity tersedia sebagai copy opt-in saat penutupan Alokasi Dana, bukan auto-renew tanpa konfirmasi. Level 90/100 diturunkan saat runtime tanpa kolom baru. Data budget legacy yang belum memiliki `envelope_rule_id` tetap dapat dibaca dan dapat dihubungkan ke Alokasi Dana tanpa migration.

### `REQ-PROD-06` Target tabungan — Partial

Target menyimpan nominal, tanggal, rekening, prioritas, saldo terkumpul, sisa, proyeksi pace, dan kebutuhan setoran bulanan. Kontribusi/penarikan menghasilkan transfer ledger.

**Gap:** tahap/milestone target menunggu RFC-0014. Kontribusi aktual per orang tidak menjadi metrik canonical selama uang dan target diperlakukan sebagai keuangan keluarga bersama; `created_by` tetap audit aktivitas pencatatan, bukan pembagian kepemilikan hasil.

### `REQ-PROD-07` Tagihan dan kewajiban rutin — Partial

Recurring rule/occurrence mendukung nominal, frekuensi, jatuh tempo, rekening, metode pembayaran, priority, payment/reversal, overdue, status pembayaran, serta **skip/restore satu occurrence**. UI tidak lagi memiliki penanda Auto-debit. Saat occurrence jatuh tempo, sistem menempatkannya sebagai transaksi rutin yang perlu dikonfirmasi; saldo/ledger baru berubah setelah nominal aktual disimpan. Kolom `auto_debit` legacy dipertahankan hanya untuk kompatibilitas data lama dan write baru menetapkannya `false`.

**Gap:** penanggung jawab eksplisit dan receipt terhubung menunggu RFC-0011/RFC-0013.

### `REQ-PROD-08` Kalender keuangan — Partial

Google Calendar mirror menampilkan recurring shared dan tidak menjadi source status pembayaran.

**Gap:** kalender internal lintas pemasukan, target, renovasi, liburan, dan agenda berwarna belum diimplementasikan.

### `REQ-PROD-09` Dashboard pasangan — Implemented

Menampilkan **Saldo rekening** non-investasi sebagai hero operasional, Aman digunakan, Batas aman per hari, dana terlindungi, dana tersedia yang belum dibagi, pengeluaran yang belum memiliki Alokasi Dana, cash flow, tagihan, target, transaksi terbaru, peringatan Kebutuhan/Alokasi Dana/Jadwal Rutin/Target/rekonsiliasi, serta kartu **Investasi** terpisah. Saldo RDN tidak boleh digabung ke hero saldo operasional. Dana tersedia dan pengeluaran tanpa Alokasi Dana adalah metrik terpisah dan memiliki CTA berbeda.

### `REQ-PROD-10` Kontribusi dan pembagian pasangan — Partial

Schema v11 masih mendukung **pembagian beban biaya legacy** untuk expense shared dengan mode `unspecified`, `equal`, atau `percentage` demi compatibility histori, backup/restore, export, dan API lama. UI canonical transaksi baru selalu memakai `unspecified`; snapshot split lama tetap disimpan apa adanya, tidak di-backfill 50:50, dan tidak mengubah saldo ledger.

**Arah produk:** karena Saldo Bersama memakai full transparency keluarga dan pengeluaran diperlakukan sebagai pengeluaran keluarga, payer/beneficiary/settlement serta kontribusi aktual tidak menjadi roadmap aktif. RFC-0013 dipertahankan sebagai catatan kompatibilitas/domain bila positioning produk kelak berubah.

### `REQ-PROD-11` Pencatatan cepat dan transaksi belum jelas — Partial

Quick entry, pencarian, deteksi duplikat, transaksi belum dialokasikan, review queue transaksi tanpa Alokasi Dana, dan aksi **Pakai lagi** tersedia. `Pakai lagi` hanya melakukan prefill field transaksi yang aman, memakai tanggal hari ini, tidak membawa ID/row-version/idempotency lama, dan tetap memerlukan konfirmasi Simpan sehingga duplicate guard canonical tetap berlaku. Untuk expense baru, rekening sumber Rp0 disembunyikan dari daftar utama kecuali rekening terpilih/`allow_negative`; kategori yang baru dipakai pada rekening yang sama dapat dipilih cepat; dan relasi Kebutuhan `category_id + envelope_rule_id` dipakai untuk menyarankan Alokasi Dana pada rekening/periode yang sama. Satu kandidat valid boleh dipilih otomatis, beberapa kandidat tetap meminta pilihan user, edit existing tidak ditimpa, dan server tetap menjadi guard final. Dashboard/push mengingatkan transaksi expense tanpa Alokasi Dana.

**Gap:** draft sementara, kategori “belum dikategorikan”, template transaksi tersimpan, dan reminder kelengkapan menunggu RFC-0011.

### `REQ-PROD-12` Utang dan piutang — Planned

Harus memisahkan kontrak kewajiban, pencairan, cicilan, settlement, saldo tersisa, pihak terkait, jatuh tempo, dan transaksi ledger. Tidak boleh hanya menambah tipe transaksi. Lihat RFC-0012.

### `REQ-PROD-13` Laporan — Partial

Tersedia cash flow bulanan, saldo awal/akhir, tren 3/6/12 bulan **Saldo utama/non-investasi**, kategori, rekening, nature, Kebutuhan vs aktual, dan aktivitas pencatatan pengguna. Breakdown pembagian beban legacy tidak menjadi panel laporan canonical. Transfer internal tidak dihitung sebagai arus kas. Presentation boleh menampilkan **Total kekayaan tercatat · saat ini** = Saldo rekening non-investasi + Total investasi, tetapi tidak boleh menambahkan nilai investasi saat ini ke titik historis atau double-count Saldo RDN. Presentation mobile ≤820px memakai mode `Ringkasan` dan `Per kategori`, navigasi periode, chart tren pengeluaran, KPI utama, perbandingan bulan sebelumnya, serta progressive disclosure untuk breakdown; alert operasional tidak dirender di Laporan karena Notification Center/Dashboard adalah surface tindakan. Desktop mempertahankan workspace analitik existing. Seluruh presentation tetap read-only dan memakai contract canonical `reports.monthly`.

**Gap:** debt/receivable dan target stages menunggu model datanya. Payer/beneficiary serta kontribusi nyata tidak menjadi roadmap aktif selama positioning full-transparency keluarga tetap berlaku.

### `REQ-PROD-14` Rekonsiliasi saldo — Implemented

Menyimpan saldo sistem, saldo aktual, selisih, status, catatan, dan actor untuk rekening non-Investasi. Dashboard dan Notification Center memberi pengingat rekonsiliasi lebih dari 30 hari. Hasil rekonsiliasi eksplisit—termasuk mismatch—menjadi checkpoint sehingga selisih tetap berada di histori tanpa terus menghasilkan notifikasi aktif; contextual entry membawa rekening yang sudah diketahui, sedangkan entry manual tetap memakai picker. Jika hasil pencocokan masih berbeda, UI menawarkan pemeriksaan transaksi rekening terkait tanpa membuat adjustment otomatis. Rekening Investasi/RDN memakai `investments.reconciliations.create` karena Saldo RDN dan holding harus diverifikasi bersama.

### `REQ-PROD-15` Hak akses dan transparansi keluarga — Implemented

Administrator/Member, shared/personal, ownership query, dan backend authorization tersedia. Kedua akun keluarga terotorisasi membaca seluruh rekening, transaksi, laporan, rekonsiliasi, dan data finansial keluarga yang relevan. `personal` berarti rekening dipegang/dioperasikan salah satu anggota, bukan rekening tersembunyi dari pasangan. Write tetap capability-driven dan diverifikasi backend.

**Keputusan produk:** mode balance-only, contribution-only, private account, hidden transaction, atau privacy projection per pasangan tidak akan dikembangkan selama positioning Saldo Bersama tetap full transparency. RFC-0015 ditolak sebagai arah produk.

### `REQ-PROD-20` Investasi manual asset-centric — Implemented

Sistem mencatat saham dan reksa dana aktual secara manual tanpa menyimpan credential aplikasi investasi atau menganggap broker/market API sebagai authority. Mental model user adalah **aset**, bukan broker/RDN/portfolio: route Investasi menampilkan Total investasi tercatat, daftar aset langsung, tab Aset/Aktivitas, filter Semua/Saham/Reksa Dana, detail quantity/modal/harga/nilai/P&L, serta aksi Beli/Jual/Perbarui nilai. Nama Ajaib/Bibit/Indodax/source tidak menjadi parent UI.

Posisi aset baru dibuat melalui `investments.assets.create` dengan instrumen existing atau metadata instrumen yang diizinkan, quantity/share, cost basis, reference price, tanggal, dan catatan. Backend dapat reuse portfolio legacy yang operable atau membuat compatibility portfolio + rekening internal Rp0 `is_system_hidden=1`; rekening internal tidak tampil pada Rekening, Transfer, Planning, atau generic reconciliation. Compatibility layer ini mempertahankan FK/histori v15/v16 tanpa memaksa user membuat RDN/broker terlebih dahulu.

Buy/Sell v17 adalah **pencatatan posisi accounting-only**. `cash_amount` tetap immutable untuk weighted cost basis/realized P/L, tetapi `cash_effect_enabled=0` sehingga Buy/Sell baru tidak memutasikan rekening/RDN dan tidak memerlukan Saldo RDN cukup. Sell tetap tidak boleh melebihi holding; fee/tanggal/idempotency/row-version tetap divalidasi. Valuasi manual append-only, harga trade/opening-position menjadi fallback, realized P/L hanya terbentuk pada sell, dan unrealized P/L berasal dari market value dikurangi remaining cost basis. Semua event investasi tetap bukan income/expense.

Data lama v15/v16 tidak ditulis ulang. Migration v17 memberi default `cash_effect_enabled=1` pada histori trade/correction existing dan view `investment_account_events` hanya memproyeksikan row dengan flag tersebut; Cash RDN legacy karena itu tetap dapat direplay. Portfolio/RDN/reconciliation/correction lama tetap readable dan tersedia untuk maintenance/recovery, tetapi bukan flow utama UI. Direct position v17 menggunakan semantic `opening_position` + `cash_effect_enabled=0`. Backup schema v17 membawa flag additive dan hidden-account marker; restore v3-v16 tetap additive-compatible.

**Acceptance:** user dapat menambah saham/reksa dana tanpa membuat broker/RDN/portfolio; UI tidak mengelompokkan aset berdasarkan broker; Total investasi utama = `market_value`, bukan market + RDN; direct position/Buy/Sell v17 tidak mengubah saldo rekening dan tidak ditolak karena cash RDN; oversell/stale write/invalid fee/tanggal tetap ditolak backend; Member tidak dapat mengambil alih portfolio personal pengguna lain; internal compatibility account tidak muncul pada `accounts.list`; histori v15/v16 mempertahankan cash effect; backup→restore mempertahankan quantity, cost basis, realized/unrealized P/L, flags v17, dan histori authoritative.

### `REQ-PROD-16` Notifikasi berguna — Partial

Queue idempotent dan Web Push mendukung recurring due, Kebutuhan threshold, Alokasi Dana threshold, target tertinggal, transaksi belum dialokasikan, **peringatan dana recurring expense kurang pada H-2**, dan konfirmasi occurrence recurring yang berhasil dicatat. In-app Notification Center juga menghasilkan funding-gap ketika total Kebutuhan pada suatu Alokasi melebihi dana yang sudah dipisahkan; rekonsiliasi Investasi tidak menjadi reminder otomatis. Saldo untuk shortage dihitung dari ledger Turso melalui read-model canonical. Queue normal dibuat server dari objek yang sudah lolos guard, tetapi transport Web Push memakai privacy-safe lock-screen payload: hanya tipe/id/target yang dikirim dan Service Worker menampilkan copy generik tanpa nominal, rekening, merchant, atau nama objek finansial. Setiap user dapat mengaktifkan/mematikan tujuh tipe alert otomatis canonical secara account-level. Pengingat manual one-shot tambahan tersedia pada occurrence Jadwal Rutin, Kebutuhan periode aktif, Alokasi Dana aktif, dan Target aktif, disimpan per user dengan row version, audit, serta dedupe scheduler. Push hanya aktif bila VAPID lengkap.

**Gap:** transaksi besar configurable, saldo rendah umum configurable, cadence rekonsiliasi configurable, dan verifikasi real Android/iOS masih belum tersedia. Perubahan pasangan diprioritaskan sebagai aktivitas in-app/audit yang transparan, bukan push per transaksi.

### `REQ-PROD-17` Keamanan dan anti-kesalahan — Implemented

Google login, signed session v2 + registry `user_sessions`, registry `users` canonical, backend authorization, audit append-only, soft cancel, idempotency, row version, duplicate guard, formula neutralization, XLSX, backup/restore guarded, filter transaksi, dan integrity check tersedia. Frontend mutation memakai intent coordinator untuk coalescing double-submit dan reuse idempotency key pada retry outcome-unknown. Selama hasil mutation biasa belum definitif, payload berbeda untuk action yang sama diblok dan metadata intent aman dipersist lintas reload tanpa payload finansial agar edit user tidak diam-diam menjadi mutation kedua; external action mereservasi key sebelum side effect. Confirmation destructive action memiliki synchronous reentrancy lock. Alokasi Dana memiliki archive/restore rule dan reverse movement tanpa hard delete. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama; anggota runtime dikelola Administrator melalui registry `users`.

**Operasional yang belum terbukti:** full quality gate pada runtime Node yang didukung pada patch terbaru, migration parity production, real-resource restore drill, external alerting, dan rotasi secret yang pernah ikut ZIP manual.

### `REQ-PROD-18` Reminder konsistensi pencatatan — Planned

Sistem dapat memberi nudge actor-scoped bila tidak ada aktivitas pencatatan transaksi dalam cadence yang dipilih user, tanpa menganggap hari tanpa transaksi sebagai error dan tanpa menampilkan nominal/detail privat pada lock screen. Cadence harus configurable/opt-in dan memakai scheduler + preference notification canonical, bukan hardcode “5 hari” untuk semua user.

**Status:** belum ada runtime alert type khusus inactivity/completeness. Implementasi baru boleh dilakukan setelah product cadence, opt-in default, dedupe, timezone, dan privacy copy disetujui serta ditambahkan ke notification contract.

## Alur produk

**Setup usable = Rekening + Kategori siap → user sudah dapat mencatat transaksi. Perencanaan bersifat opsional: uang dapat dibagi ke Alokasi Dana bernama → dirinci menjadi Kebutuhan → dijadwalkan bila rutin; Target tetap jalur saving terpisah untuk dana yang masih dikumpulkan. Transaksi aktual tetap menjadi sumber ledger, lalu dibandingkan dengan Kebutuhan/anggaran, direkonsiliasi, dan ditutup per periode sesuai blocker canonical.**

Continuation UI hanya memberi prefill atau navigasi. Tidak ada workflow baru yang boleh auto-submit mutation finansial, membuat adjustment rekonsiliasi, atau mengubah blocker period-close di luar contract backend canonical. Restore master tetap terpusat di **Pengaturan → Data & cadangan → Pemulihan data**; feedback global tidak menjadi generic undo/rollback.

Fitur planned tidak boleh memengaruhi saldo sampai model, migration, authorization, audit, backup/restore, dan test disetujui melalui RFC.

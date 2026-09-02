# Product Requirements

## Tujuan

Saldo Bersama adalah sistem pengendali uang privat untuk dua akun Google. Sistem harus menjawab: uang berasal dari mana, berada di rekening mana, sudah dialokasikan untuk apa, siapa yang membayar/menerima manfaat/menanggung kewajiban, tersisa berapa, dan apakah kewajiban serta target bersama masih aman.

## Pengguna dan istilah role

- **Administrator**: mengelola member, master data, rekening, maintenance, backup/restore, dan operasi administratif.
- **Member**: pengguna kedua dengan permission operasional terbatas; tidak dapat membuat atau mengelola master rekening.
- UI memakai istilah Administrator/Member. Backend mempertahankan key internal `owner` untuk Administrator demi kompatibilitas data/session existing; `ALLOWED_USERS_JSON` menerima `administrator` hanya untuk bootstrap/recovery Administrator, sedangkan anggota operasional dikelola di registry `users`.

## Invariant produk

- `REQ-FIN-001` Nominal Rupiah disimpan sebagai integer.
- `REQ-FIN-002` Saldo dihitung dari saldo awal dan seluruh cash-impact event canonical yang valid; transaksi aktif menjadi event utama, sedangkan rekening RDN juga memasukkan event buy/sell/koreksi investasi. Saldo tidak boleh diedit bebas.
- `REQ-FIN-003` Transfer mengurangi sumber dan menambah tujuan, tetapi tidak masuk total income/expense.
- `REQ-FIN-004` Transaksi normal menggunakan soft cancel/archive, bukan hard delete.
- `REQ-FIN-005` Write penting memakai idempotency dan audit append-only.
- `REQ-FIN-006` Edit record yang versionable menolak stale `row_version`.
- `REQ-SEC-001` Firebase identity diverifikasi server dan authorization default deny.
- `REQ-SEC-002` Data personal hanya dapat diakses menurut role, scope, dan ownership backend.
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

**Gap yang memerlukan RFC/schema:** participant role eksplisit (`payer`, `beneficiary`, `liable_party`), bukti/struk privat, draft/rencana/belum dibayar, utang, dan piutang. Field generik `used_by` tidak menjadi contract canonical. Lihat RFC-0011 dan RFC-0012.

### `REQ-PROD-02A` Alokasi per penerima — Implemented

Alokasi Dana memisahkan ownership ledger (`scope`/`owner_user_id`) dari penerima jatah (`assignee_user_id`). `NULL` berarti Bersama; shared source dapat dialokasikan untuk Administrator atau Member. Setiap Alokasi Dana canonical wajib memiliki satu `source_account_id`. Rekening personal hanya dapat menjadi sumber jatah untuk pemilik rekening tersebut. Member hanya dapat memakai/memindahkan Jatah Bersama atau jatahnya sendiri, dan transaksi yang memakai Alokasi Dana wajib memakai rekening sumber yang sama. Nama internal `envelope`/route `/perencanaan/kantong` dipertahankan hanya untuk compatibility.


### `REQ-PROD-19` Satu pembayaran dengan beberapa kategori/Kebutuhan — Planned

Satu cash movement perlu dapat direpresentasikan sebagai beberapa line item kategori/Kebutuhan tanpa membuat saldo rekening berubah lebih dari sekali. Total line item wajib integer Rupiah dan tepat sama dengan nominal transaksi header; setiap line harus mengikuti category/Alokasi Dana yang valid dan reporting tidak boleh double-count.

**Status:** belum ada schema/runtime. `transactions.category_id` dan `transactions.envelope_period_id` masih singular. Desain dibahas di RFC-0019; multi-source payment bukan bagian MVP dan tidak boleh diakali dengan array JSON pada kolom transaksi.

### `REQ-PROD-03` Kategori kebutuhan — Partial

Kategori memiliki jenis transaksi dan `nature` untuk fixed, variable, unexpected, discretionary, emergency, savings, dan other. Kategori dapat ditambah/diarsipkan.

**Gap:** parent/subcategory dan taxonomy bertingkat menunggu RFC-0014.

### `REQ-PROD-04` Alokasi Dana — Implemented

Pemasukan dapat dibagi melalui Alokasi Dana daily, weekly, biweekly, monthly, paycycle, atau custom; shared/personal; rollover; overspend policy; realokasi; sisa alokasi; dan dana belum dialokasikan. Dana tersedia dapat ditambahkan ke Alokasi Dana existing atau dilepas kembali tanpa membuat transaksi ledger. Dashboard serta success flow pemasukan dapat membuka funding flow dengan rekening sumber dan nominal sebagai prefill saja; user tetap memilih Alokasi Dana dan mengonfirmasi alokasi. Alokasi bersifat account-bound: membuat/menambah Alokasi Dana tidak mengubah saldo ledger, tetapi mengurangi `available_balance`; pemakaian Alokasi Dana mengurangi saldo fisik dan sisa alokasi bersama-sama; realokasi antar rekening wajib memakai transaksi Transfer. Sisa dana yang dilepas dari Alokasi Dana dapat diteruskan ke flow setoran Target dengan konteks rekening asal tanpa auto-submit. Saat periode ditutup, rule aktif selalu memiliki periode aktif berikutnya. Policy `unallocated` membuat periode berikutnya dengan alokasi Rp0 dan melepaskan sisa ke dana tersedia, sedangkan `carry` hanya membawa sisa aktual. Pembuatan periode berikutnya tidak membuat transaksi ledger baru dan tidak menambah dana di luar saldo rekening.

### `REQ-PROD-05` Kebutuhan dalam Alokasi Dana — Partial

Alokasi Dana mendukung periodisasi harian sampai custom. Kebutuhan kategori dikelola dari detail Alokasi Dana dan memakai record budget serta relasi existing `budgets.envelope_rule_id`. Kategori tetap master data bersama dan kategori yang sama boleh dipakai pada lebih dari satu Alokasi Dana; identitas Kebutuhan periode karena itu mencakup kategori, ownership, dan Alokasi Dana. Pemakaian anggaran Kebutuhan hanya menghitung transaksi aktif pada kategori, ownership, periode, dan Alokasi Dana yang sama. Detail Alokasi Dana merangkum total nominal Kebutuhan aktif periode berjalan terhadap `allocated_amount`, bukan terhadap sisa setelah transaksi; selisih lebih ditampilkan sebagai dana belum direncanakan, sedangkan kekurangan hanya menjadi suggestion untuk `envelopes.adjustAllocation` yang tetap memerlukan konfirmasi user dan guard backend. Menambah atau mengedit Kebutuhan tidak boleh otomatis memindahkan dana. Halaman Anggaran menjadi overview read-only lintas Kebutuhan. Dashboard, laporan, dan push tetap memberi peringatan actionable ketika anggaran terlampaui. Saat menutup periode, user dapat memilih `Pakai lagi kebutuhan di periode berikutnya`. Sistem hanya menyalin kategori dan nominal rencana Kebutuhan aktif ke periode tujuan bila identitas Kebutuhan tersebut belum ada. Rencana target yang sudah ada tidak ditimpa, dan transaksi, saldo, histori pemakaian, serta dana Alokasi tidak ikut disalin.

**Batas saat ini:** Kebutuhan masih berupa record budget per periode, bukan rule recurrence/multi-periode independen. Continuity tersedia sebagai copy opt-in saat penutupan Alokasi Dana, bukan auto-renew tanpa konfirmasi. Level 90/100 diturunkan saat runtime tanpa kolom baru. Data budget legacy yang belum memiliki `envelope_rule_id` tetap dapat dibaca dan dapat dihubungkan ke Alokasi Dana tanpa migration.

### `REQ-PROD-06` Target tabungan — Partial

Target menyimpan nominal, tanggal, rekening, prioritas, saldo terkumpul, sisa, proyeksi pace, dan kebutuhan setoran bulanan. Kontribusi/penarikan menghasilkan transfer ledger.

**Gap:** kontribusi aktual per orang dan tahap renovasi menunggu model payer/beneficiary lanjutan RFC-0013 serta RFC-0014. Pembagian beban transaksi shared sudah tersedia, tetapi bukan bukti kontribusi Target.

### `REQ-PROD-07` Tagihan dan kewajiban rutin — Partial

Recurring rule/occurrence mendukung nominal, frekuensi, jatuh tempo, rekening, metode pembayaran, priority, payment/reversal, overdue, status pembayaran, serta **skip/restore satu occurrence**. UI tidak lagi memiliki penanda Auto-debit. Saat occurrence jatuh tempo, sistem menempatkannya sebagai transaksi rutin yang perlu dikonfirmasi; saldo/ledger baru berubah setelah nominal aktual disimpan. Kolom `auto_debit` legacy dipertahankan hanya untuk kompatibilitas data lama dan write baru menetapkannya `false`.

**Gap:** penanggung jawab eksplisit dan receipt terhubung menunggu RFC-0011/RFC-0013.

### `REQ-PROD-08` Kalender keuangan — Partial

Google Calendar mirror menampilkan recurring shared dan tidak menjadi source status pembayaran.

**Gap:** kalender internal lintas pemasukan, target, renovasi, liburan, dan agenda berwarna belum diimplementasikan.

### `REQ-PROD-09` Dashboard pasangan — Implemented

Menampilkan total saldo, saldo aman, dana terlindungi, dana tersedia yang belum dibagi, pengeluaran yang belum memiliki Alokasi Dana, cash flow, tagihan, target, transaksi terbaru, dan peringatan Kebutuhan/Alokasi Dana/Jadwal Rutin/Target/rekonsiliasi. Dana tersedia dan pengeluaran tanpa Alokasi Dana adalah metrik terpisah dan memiliki CTA berbeda.

### `REQ-PROD-10` Kontribusi dan pembagian pasangan — Partial

MVP menyediakan **pembagian beban biaya** untuk expense shared dengan mode `unspecified`, `equal`, atau `percentage`. Snapshot split integer disimpan per transaksi, histori lama tidak diubah menjadi 50:50, dan split tidak mengubah saldo ledger.

**Gap:** payer, beneficiary, liable party, settlement, nominal/template split, dan kontribusi aktual belum dimodelkan. Laporan “aktivitas pencatatan” tetap bukan laporan kontribusi. Lihat RFC-0013.

### `REQ-PROD-11` Pencatatan cepat dan transaksi belum jelas — Partial

Quick entry, pencarian, deteksi duplikat, transaksi belum dialokasikan, review queue transaksi tanpa Alokasi Dana, dan aksi **Pakai lagi** tersedia. `Pakai lagi` hanya melakukan prefill field transaksi yang aman, memakai tanggal hari ini, tidak membawa ID/row-version/idempotency lama, dan tetap memerlukan konfirmasi Simpan sehingga duplicate guard canonical tetap berlaku. Untuk expense baru, rekening sumber Rp0 disembunyikan dari daftar utama kecuali rekening terpilih/`allow_negative`; kategori yang baru dipakai pada rekening yang sama dapat dipilih cepat; dan relasi Kebutuhan `category_id + envelope_rule_id` dipakai untuk menyarankan Alokasi Dana pada rekening/periode yang sama. Satu kandidat valid boleh dipilih otomatis, beberapa kandidat tetap meminta pilihan user, edit existing tidak ditimpa, dan server tetap menjadi guard final. Dashboard/push mengingatkan transaksi expense tanpa Alokasi Dana.

**Gap:** draft sementara, kategori “belum dikategorikan”, template transaksi tersimpan, dan reminder kelengkapan menunggu RFC-0011.

### `REQ-PROD-12` Utang dan piutang — Planned

Harus memisahkan kontrak kewajiban, pencairan, cicilan, settlement, saldo tersisa, pihak terkait, jatuh tempo, dan transaksi ledger. Tidak boleh hanya menambah tipe transaksi. Lihat RFC-0012.

### `REQ-PROD-13` Laporan — Partial

Tersedia cash flow bulanan, saldo awal/akhir, tren 3/6/12 bulan, total saldo lintas bulan, kategori, rekening, nature, budget vs actual, aktivitas pencatatan pengguna, dan breakdown pembagian beban biaya shared yang dipisahkan dari recorder activity. Transfer internal tidak dihitung sebagai arus kas. Presentation mobile ≤820px memakai mode `Ringkasan` dan `Per kategori`, navigasi periode, chart tren pengeluaran, KPI utama, perbandingan bulan sebelumnya, alert actionable, serta progressive disclosure untuk breakdown; desktop mempertahankan workspace analitik existing. Seluruh presentation tetap read-only dan memakai contract canonical `reports.monthly`.

**Gap:** payer/beneficiary dan kontribusi nyata, debt/receivable, serta target stages menunggu model datanya.

### `REQ-PROD-14` Rekonsiliasi saldo — Implemented

Menyimpan saldo sistem, saldo aktual, selisih, status, catatan, dan actor. Dashboard memberi peringatan selisih atau rekonsiliasi lebih dari 30 hari. Jika hasil pencocokan masih berbeda, UI menawarkan pemeriksaan transaksi rekening terkait tanpa membuat adjustment otomatis.

### `REQ-PROD-15` Hak akses dan privasi — Partial

Administrator/Member, shared/personal, ownership query, dan backend authorization tersedia.

**Gap:** mode full detail, balance-only, contribution-only, dan private penuh per rekening memerlukan projection backend serta RFC-0015.

### `REQ-PROD-20` Investasi manual berbasis RDN — Implemented

Sistem mencatat portfolio broker secara manual tanpa menyimpan credential broker atau menganggap broker/market API sebagai authority. Setiap portfolio memakai satu rekening canonical `account_type=investment` sebagai RDN. Deposit/withdraw RDN tetap Transfer ledger biasa dan netral terhadap income/expense. Buy/Sell dicatat sebagai histori investasi append-only yang mengubah saldo RDN melalui cash-impact event canonical dan **tidak** membuat income/expense transaction.

Backend memvalidasi ownership/capability, instrumen, lot/share, nominal integer Rupiah, fee, tanggal, saldo RDN, idempotency, dan `row_version`. Buy hanya boleh untuk instrumen aktif; holding instrumen yang kemudian inactive tetap dapat dijual. Cost basis memakai weighted average. Valuasi manual membuat snapshot baru; bila belum ada valuasi manual, harga trade terakhir menjadi fallback read-model. Realized P/L hanya terbentuk pada sell dan unrealized P/L berasal dari market value dikurangi remaining cost basis; keduanya tidak diklasifikasikan sebagai cashflow income/expense.

Rekonsiliasi membandingkan keadaan broker dengan state canonical **as-of tanggal rekonsiliasi** dan tidak pernah auto-adjust. Trade baru pada/sebelum checkpoint rekonsiliasi terakhir ditolak; selisih historis diselesaikan lewat correction explicit agar snapshot reconciliation tetap bermakna. Mismatch memerlukan correction eksplisit Administrator yang audited dan tetap menjaga trade history. Semua event investasi wajib tidak lebih awal dari `initial_balance_date` RDN. Backup schema v15 membawa histori investasi authoritative, restore lama v3-v14 tetap additive-compatible, dan definitive restore tetap menunggu foreign-key + business-integrity verification.

**Acceptance:** tidak ada double-count Bank↔RDN/portfolio; insufficient RDN dan over-sell ditolak backend; stale edit ditolak; retry intent mempertahankan idempotency key; personal portfolio tidak dapat dimutasi actor lain; reconciliation tidak menjadi backdoor adjustment; backup→restore mempertahankan RDN, quantity, cost basis, realized/unrealized P/L, dan histori authoritative.

### `REQ-PROD-16` Notifikasi berguna — Partial

Queue idempotent dan Web Push mendukung recurring due, Kebutuhan threshold, Alokasi Dana threshold, target tertinggal, transaksi belum dialokasikan, **peringatan dana recurring expense kurang pada H-2**, dan konfirmasi occurrence recurring yang berhasil dicatat. Saldo untuk shortage dihitung dari ledger Turso melalui read-model canonical. Queue normal dibuat server dari objek yang sudah lolos guard, tetapi transport Web Push memakai privacy-safe lock-screen payload: hanya tipe/id/target yang dikirim dan Service Worker menampilkan copy generik tanpa nominal, rekening, merchant, atau nama objek finansial. Setiap user dapat mengaktifkan/mematikan tujuh tipe alert otomatis canonical secara account-level. Pengingat manual one-shot tambahan tersedia pada occurrence Jadwal Rutin, Kebutuhan periode aktif, Alokasi Dana aktif, dan Target aktif, disimpan per user dengan row version, audit, serta dedupe scheduler. Push hanya aktif bila VAPID lengkap.

**Gap:** transaksi besar configurable, saldo rendah umum configurable, perubahan pasangan, cadence rekonsiliasi configurable, dan verifikasi real Android/iOS masih belum tersedia.

### `REQ-PROD-17` Keamanan dan anti-kesalahan — Implemented

Google login, signed session v2 + registry `user_sessions`, registry `users` canonical, backend authorization, audit append-only, soft cancel, idempotency, row version, duplicate guard, formula neutralization, XLSX, backup/restore guarded, filter transaksi, dan integrity check tersedia. Frontend mutation memakai intent coordinator untuk coalescing double-submit dan reuse idempotency key pada retry outcome-unknown. Selama hasil mutation biasa belum definitif, payload berbeda untuk action yang sama diblok dan metadata intent aman dipersist lintas reload tanpa payload finansial agar edit user tidak diam-diam menjadi mutation kedua; external action mereservasi key sebelum side effect. Confirmation destructive action memiliki synchronous reentrancy lock. Alokasi Dana memiliki archive/restore rule dan reverse movement tanpa hard delete. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama; anggota runtime dikelola Administrator melalui registry `users`.

**Operasional yang belum terbukti:** full quality gate Node 24 pada patch terbaru, migration parity production, real-resource restore drill, external alerting, dan rotasi secret yang pernah ikut ZIP manual.

### `REQ-PROD-18` Reminder konsistensi pencatatan — Planned

Sistem dapat memberi nudge actor-scoped bila tidak ada aktivitas pencatatan transaksi dalam cadence yang dipilih user, tanpa menganggap hari tanpa transaksi sebagai error dan tanpa menampilkan nominal/detail privat pada lock screen. Cadence harus configurable/opt-in dan memakai scheduler + preference notification canonical, bukan hardcode “5 hari” untuk semua user.

**Status:** belum ada runtime alert type khusus inactivity/completeness. Implementasi baru boleh dilakukan setelah product cadence, opt-in default, dedupe, timezone, dan privacy copy disetujui serta ditambahkan ke notification contract.

## Alur produk

**Setup usable → uang masuk → opsional dibagi ke Alokasi Dana → digunakan lewat ledger → transaksi tanpa Alokasi Dana direview sampai selesai → dibandingkan dengan Kebutuhan/anggaran → sisa Alokasi Dana dapat diarahkan ke Target → saldo direkonsiliasi → blocker period close diselesaikan sebelum penutupan.**

Continuation UI hanya memberi prefill atau navigasi. Tidak ada workflow baru yang boleh auto-submit mutation finansial, membuat adjustment rekonsiliasi, atau mengubah blocker period-close di luar contract backend canonical. Restore master tetap terpusat di **Pengaturan → Pemulihan data**; feedback global tidak menjadi generic undo/rollback.

Fitur planned tidak boleh memengaruhi saldo sampai model, migration, authorization, audit, backup/restore, dan test disetujui melalui RFC.

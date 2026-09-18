# Product Requirements

> **Status:** Canonical  
> **Purpose:** Menentukan behavior produk yang seharusnya berlaku.  
> **Update when:** Behavior produk, acceptance criteria, atau product boundary berubah.

## Tujuan

Saldo Bersama adalah sistem pengendali keuangan keluarga privat untuk dua akun Google dalam satu rumah tangga. Sistem harus menjawab: uang keluarga berasal dari mana, berada di rekening mana, sudah dialokasikan untuk apa, siapa yang mencatat perubahan, tersisa berapa, dan apakah kewajiban, target, serta investasi keluarga masih aman. Kedua pengguna terotorisasi melihat data keuangan keluarga yang sama secara penuh; kepemilikan rekening hanya menentukan pemegang/capability operasi, bukan privasi baca.

## Prinsip UX produk

- **User mencatat kejadian nyata; sistem menghitung konsekuensinya.** User tidak boleh dipaksa memperbarui saldo, Kebutuhan, Alokasi Dana, atau ringkasan lain secara manual bila dampaknya dapat diturunkan dari mutation canonical.
- Beranda harus menjawab secepat mungkin **berapa uang yang aman dipakai** dan **apa tindakan terpenting berikutnya**, bukan menjadi katalog seluruh fitur.
- Bahasa permukaan mengutamakan istilah orang awam; istilah internal seperti `budget`, `envelope`, dan `occurrence` tidak boleh bocor sebagai mental model utama.
- Otomatisasi boleh memilih ketika hasilnya pasti dan dapat dijelaskan. Bila beberapa Kebutuhan/tujuan sama-sama valid, UI wajib meminta pilihan user dan tidak menebak.

## Pengguna dan istilah role

- **Administrator**: mengelola member, master data, rekening, maintenance, backup/restore, dan operasi administratif.
- **Member**: pengguna kedua dengan permission operasional terbatas; tidak dapat membuat atau mengelola master rekening.
- UI memakai istilah Administrator/Member. Backend mempertahankan key internal `owner` untuk Administrator demi kompatibilitas data/session existing; `ALLOWED_USERS_JSON` menerima `administrator` hanya untuk bootstrap/recovery Administrator, sedangkan anggota operasional dikelola di registry `users`.

## Invariant produk

- `REQ-FIN-001` Nominal Rupiah disimpan sebagai integer.
- `REQ-FIN-002` Saldo dihitung dari saldo awal dan seluruh cash-impact event canonical yang valid; transaksi aktif menjadi event utama, sedangkan rekening RDN juga memasukkan event buy/sell/koreksi investasi. Saldo tidak boleh diedit bebas.
- `REQ-FIN-003` Transfer mengurangi sumber dan menambah tujuan, tetapi tidak masuk total income/expense. Rekening Investasi/RDN hanya boleh masuk ledger transaksi biasa melalui Transfer; Buy/Sell/Koreksi memakai event Investasi canonical.
- `REQ-FIN-003A` Saldo RDN adalah dana investasi, bukan saldo operasional. Dashboard memisahkan Saldo rekening non-investasi dari Total investasi; Saldo RDN tidak masuk Dana Tersedia Beranda (`safeToSpend`), Batas harian, dana belum dialokasikan, Alokasi Dana operasional, atau reserved Jadwal Rutin.
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

Composer transaksi mobile bersifat progressive: jenis, nominal, rekening, kategori, dan relasi Kebutuhan menjadi jalur utama; tanggal (default hari ini), metode pembayaran, dan catatan berada pada **Detail tambahan**. Untuk expense, tepat satu Kebutuhan yang cocok pada rekening/kategori/periode dihubungkan otomatis; bila beberapa Kebutuhan cocok, user wajib memilih; bila tidak ada yang cocok, transaksi tetap dapat dicatat sebagai Pengeluaran Belum Dialokasikan. **Belum memilih** harus menjadi state tersendiri dan tidak boleh direpresentasikan sebagai `Tanpa Kebutuhan`; pilihan `Tanpa Kebutuhan` adalah intent eksplisit user dan memakai Dana Tersedia. Context transaksi yang dibuka dari row Kebutuhan membawa `budget_id` + `envelope_period_id` + kategori + rekening dan tidak boleh hilang hanya karena ada Kebutuhan lain berkategori sama. Perubahan rekening/kategori/tanggal membatalkan link yang menjadi stale dan menjalankan smart matching ulang. Composer transaksi tidak menyediakan pemilihan Alokasi Dana manual terpisah karena relasi operasional harus berasal dari Kebutuhan yang dipilih. Sebelum Simpan, UI boleh menampilkan **perkiraan lokal** dampak terhadap Kebutuhan, Dana Tersedia, dan saldo rekening, termasuk delta edit `kondisi kini - dampak lama + dampak baru`; preview harus menyebut sumber pengurangan dana sehingga Kebutuhan vs Dana Tersedia tidak ambigu; server tetap authority final. Setelah create berhasil, ringkasan sukses memakai snapshot `dashboard.overview` yang telah disegarkan bila tersedia. Konfirmasi eksplisit `Simpan tetap` untuk expense tanpa Alokasi Dana, duplicate guard, overspend guard, dan transfer approval **tetap dipertahankan**.

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

Alokasi Dana adalah **wadah** bernama yang account-bound. Flow utama membuat Alokasi dan Kebutuhan awal dalam **satu penyimpanan atomic**: user memilih tujuan, rekening sumber, penerima/pengguna bila relevan, lalu mengisi satu atau lebih Kebutuhan. Pemanis kartu dan policy sisa periode (`unallocated`/`carry`) tetap tersedia melalui progressive disclosure **Tampilan & periode** agar tugas utama tidak berubah menjadi form konfigurasi panjang. Periode awal tetap bulanan dan tanggalnya diturunkan sistem, bukan diisi user. Nominal dana Alokasi mengikuti total Kebutuhan yang disimpan di dalamnya. Mengikat atau melepas dana Alokasi tidak membuat transaksi ledger dan tidak mengubah saldo fisik rekening; yang berubah adalah `allocated_remaining` dan `available_balance`.

Surface **Atur dana** boleh menampilkan total compact **Dana yang bisa dialokasikan** lintas rekening sebagai konteks aksi, tetapi angka tersebut **bukan satu kolam uang virtual** dan bukan pengganti hero Dana Tersedia di Beranda. Breakdown rekening harus tersedia, dan setiap Alokasi tetap mempunyai tepat satu rekening sumber. Flow generik **Alokasikan dana** memilih rekening sumber lebih dahulu lalu hanya menawarkan Alokasi yang memakai rekening tersebut. Aksi contextual **Dana ke {Alokasi}** mengunci rekening sumber + tujuan karena intent sudah diketahui. Rekening Bersama dapat membuat Alokasi untuk Bersama atau anggota yang diizinkan capability backend; rekening personal mengunci penerima ke pemilik rekening. Dana lintas rekening tidak boleh dicampur diam-diam: realokasi lintas rekening tetap wajib melalui Transfer.

Capability penyesuaian manual fund/release tetap tersedia sebagai **advanced/compatibility control** untuk buffer/cadangan, recovery, atau kasus eksplisit; capability ini bukan mental model utama pembuatan Alokasi. Saat periode ditutup, rule aktif selalu memiliki periode aktif berikutnya. Policy `unallocated` memulai periode berikutnya pada Rp0 dan melepas sisa aman ke Dana Tersedia, sedangkan `carry` hanya membawa sisa aktual. Pembuatan periode baru tidak membuat transaksi ledger.

**Acceptance:** create canonical tidak meninggalkan Alokasi kosong: rule, periode, dan Kebutuhan awal tersimpan atomic. Jika Dana Tersedia mencukupi, `allocated_amount` naik sebesar total Kebutuhan. Jika belum cukup, Kebutuhan tetap tersimpan dan Alokasi hanya mengikat dana yang tersedia; response funding membawa `requestedAmount`, `amount`, `availableAmount`, dan `shortageAmount` untuk menampilkan kekurangan. Saldo rekening fisik tidak berubah; dana manual/buffer tidak boleh tersapu ketika Kebutuhan lain dihapus.

### `REQ-PROD-05` Kebutuhan dalam Alokasi Dana — Partial

Kebutuhan adalah rencana bernama pada satu Alokasi dan periode, dengan **nama kebutuhan spesifik** terpisah dari **kategori master**. Contoh: `Arisan PT`, `Arisan Sekolah`, dan `Arisan Rumah` dapat memakai kategori master `Arisan`. Flow tambah dari detail Alokasi mendukung beberapa Kebutuhan sekaligus dalam editor compact; batch maksimal 20 item disimpan **atomic** dan menolak nama kebutuhan duplikat pada periode/ownership/Alokasi yang sama, bukan kategori ganda. Kategori dipilih memakai picker inline canonical yang sama seperti picker rekening pada Transaksi; kategori baru dapat dibuat dari flow yang sama beserta ikon. Setiap kebutuhan memiliki pola internal `flexible`, `fixed_once`, atau `recurring`; UI menyebutnya **Bisa dipakai beberapa kali**, **Sekali bayar**, dan **Rutin** melalui progressive disclosure agar input utama tetap nama + nominal + kategori. Pola Rutin membuat Jadwal Rutin dan ikut rollback bila salah satu item gagal. Edit Kebutuhan existing tetap single-item. Pemakaian nominal memprioritaskan `transactions.budget_id`; fallback transaksi legacy berbasis kategori hanya digunakan bila tidak ambigu agar dua kebutuhan berkategori sama tidak double-count.

Menyimpan atau menaikkan nominal Kebutuhan otomatis mendanai Alokasi dari **Dana Tersedia** sebesar delta. Menurunkan nominal, mengarsipkan, atau menghapus Kebutuhan hanya melepas bagian dana yang masih aman: dana yang sudah terpakai/dipesan dan buffer/cadangan sengaja tidak boleh ikut terlepas. Nominal Kebutuhan tidak boleh diturunkan di bawah pemakaian aktual. Jika Dana Tersedia tidak cukup, rencana Kebutuhan **tetap disimpan** dan backend mengikat dana sebanyak yang benar-benar tersedia. Metadata funding mengembalikan `requestedAmount`, `amount`, `availableAmount`, dan `shortageAmount`; tidak ada saldo/ledger fiktif. UI harus menjelaskan kekurangan dan pembayaran otomatis hanya boleh terjadi ketika dana aktual yang diperlukan memang tersedia.

Tidak ada surface Anggaran terpisah; `/anggaran` hanya compatibility redirect ke Alokasi Dana. Saat menutup periode, `Pakai lagi kebutuhan di periode berikutnya` tetap opt-in; copy rencana tidak boleh menyalin transaksi/histori pemakaian atau menciptakan saldo baru. Pendanaan periode tujuan mengikuti rule funding current saat Kebutuhan periode tersebut diaktifkan/disimpan.

**Batas saat ini:** Kebutuhan masih berupa record budget per periode, bukan rule multi-periode independen. Pola `recurring` menautkan Kebutuhan ke Jadwal Rutin, sedangkan continuity antarperiode tetap copy opt-in saat penutupan Alokasi Dana, bukan auto-renew tanpa konfirmasi. Level 90/100 diturunkan saat runtime tanpa kolom baru. Data budget legacy yang belum memiliki `envelope_rule_id` tetap dapat dibaca dan dapat dihubungkan ke Alokasi Dana tanpa migration.

### `REQ-PROD-06` Target tabungan — Partial

Target menyimpan nominal, tanggal, rekening, prioritas, saldo terkumpul, sisa, proyeksi pace, dan kebutuhan setoran bulanan. Kontribusi/penarikan menghasilkan transfer ledger.

**Gap:** tahap/milestone target menunggu RFC-0014. Kontribusi aktual per orang tidak menjadi metrik canonical selama uang dan target diperlakukan sebagai keuangan keluarga bersama; `created_by` tetap audit aktivitas pencatatan, bukan pembagian kepemilikan hasil.

### `REQ-PROD-07` Tagihan dan kewajiban rutin — Partial

Recurring rule/occurrence mendukung nominal, frekuensi, jatuh tempo, rekening, metode pembayaran, priority, payment/reversal, overdue, status pembayaran, serta **skip/restore satu occurrence**. Untuk pembayaran expense, Jadwal Rutin dapat ditautkan ke tepat satu Kebutuhan melalui `budget_id`: satu kandidat kompatibel boleh dipilih otomatis, beberapa kandidat pada Jadwal Rutin generic tetap meminta pilihan user, dan nol kandidat tetap sah sebagai pembayaran mandiri. Link tersebut mencegah Dana Tersedia mencadangkan pembayaran yang dananya sudah disiapkan melalui Alokasi untuk kedua kali. UI tidak memiliki penanda Auto-debit dan seluruh write baru menetapkan kolom legacy `auto_debit=false`. Jadwal Rutin generic tetap meminta user mencatat aktual; pengecualian hanya Jadwal managed milik Kewajiban yang memiliki Kebutuhan + Alokasi aktif dengan dana cukup: mulai tanggal jatuh tempo scheduler mencatat pembayaran canonical otomatis tepat sekali, dan occurrence overdue boleh dikejar setelah dananya baru siap. Bila dana tidak cukup/tidak cocok, tidak ada debit parsial dan occurrence tetap menunggu. Cicilan flat terakhir memakai nominal sisa pokok + bunga flat periode itu agar pemotongan otomatis tidak melebihi kewajiban. Projection occurrence memakai **rolling horizon 24 bulan** yang diperbarui sekali per periode oleh scheduler; tenor panjang tidak dipregenerate sampai akhir tetapi juga tidak berhenti setelah horizon awal.

Kewajiban adalah label user-facing untuk domain internal `commitments` (KPR, cicilan, pinjaman, Arisan), dan berbeda dari Target. Form hanya meminta data yang diperlukan saat ini. Khusus KPR yang sudah berjalan, user memasukkan nama/penyedia, nilai awal+sisa pokok, cicilan aktual, **cicilan berikutnya X dari Y**, pembayaran berikutnya, rekening, kategori, dan akhir kontrak opsional; aplikasi menurunkan `installments_paid = X - 1`, `due_day`, dan Jadwal Rutin tanpa membuat histori lama palsu. `current_balance` menjadi opening truth. Satu Kewajiban membuat tepat satu Jadwal Rutin managed. Smart link Kebutuhan tetap terjadi tanpa picker Kebutuhan di form Kewajiban bila pasangan kategori+rekening hanya memiliki satu kandidat pasti. `budget_id` disimpan pada `recurring_rule`, bukan diduplikasi pada tabel Kewajiban, dan resolver mengikuti salinan Kebutuhan periode berjalan dengan identity yang sama. **KPR tidak memakai inferensi pokok flat**; pembayaran mengubah sisa pokok hanya dari `remaining_principal` aktual, sementara progress periode tetap bergerak saat occurrence selesai. Untuk tipe utang non-KPR dengan pola flat dan `original_amount + total_installments`, pembayaran normal tetap dapat memisahkan pokok = nilai awal/tenor dan bunga/biaya = cicilan-pokok otomatis. Jadwal managed tetap memakai `recurring.payOccurrence`, sehingga progres, ledger, completion, dan reversal tetap satu jalur.

**Gap:** penanggung jawab eksplisit dan receipt terhubung menunggu RFC-0011/RFC-0013.

### `REQ-PROD-08` Kalender keuangan — Partial

Google Calendar mirror menampilkan recurring shared dan tidak menjadi source status pembayaran.

**Gap:** kalender internal lintas pemasukan, target, renovasi, liburan, dan agenda berwarna belum diimplementasikan.

### `REQ-PROD-09` Dashboard pasangan — Implemented

Menampilkan **Dana Tersedia** (`safeToSpend`) sebagai angka utama Beranda agar user tidak membaca seluruh Saldo rekening sebagai uang bebas, dengan helper user-facing **“Sisa uang yang aman dipakai setelah kebutuhan dan tagihan.”** **Saldo rekening** non-investasi dan **Aman dipakai / hari** tetap menjadi konteks sekunder. Snapshot **Bulan ini** tampil compact sebagai `Masuk = income + refund`, `Keluar = expense`, dan `Selisih = Masuk - Keluar`; label `Selisih` tidak boleh diganti menjadi `Sisa` karena berbeda dari Dana Tersedia.

Pada mobile, hierarchy canonical bersifat decision-first: Dana Tersedia → Bulan ini → **Perlu dilakukan** hanya bila ada alert aktif → setup bila prerequisite belum lengkap → shortcut **Atur Dana / Rekening / Target / Cocokkan** → **Rencana terdekat** (maksimal satu Kebutuhan prioritas + satu Jadwal terdekat) → Aktivitas terbaru → Investasi hanya bila sudah ada aset/nilai tercatat. Tidak ada standalone card `Insight Keuangan` atau card positif “semua aman”; kondisi normal berarti dashboard lebih tenang. `Atur Dana` adalah label pengalaman untuk workspace Perencanaan dan boleh menjadi heading halaman agar intent user tetap konsisten; tab/domain canonical di dalamnya tetap `Alokasi Dana`, `Jadwal Rutin`, dan `Kewajiban`, sehingga istilah ini bukan domain finansial baru. Alert diurutkan berdasarkan urgensi tindakan manusia (selisih investasi aktif, jadwal terlambat, Kebutuhan/Alokasi terlampaui, jatuh tempo, kekurangan dana, expense belum masuk Kebutuhan, Target tertinggal, lalu stale reconciliation), bukan severity+judul semata. Reconciliation non-investasi yang sudah menjadi checkpoint tetap tidak membangkitkan persistent difference alert historis.

Dana Tersedia Beranda sudah memperhitungkan proteksi, sisa Alokasi Dana, dan komitmen Jadwal Rutin operasional yang belum tercakup Alokasi; Jadwal Rutin yang tertaut ke Kebutuhan dalam Alokasi tidak boleh dikurangi kedua kali. Saldo RDN tidak boleh masuk hero operasional. Dana tersedia rekening dan pengeluaran tanpa Alokasi Dana tetap merupakan metrik terpisah dengan CTA berbeda.

### `REQ-PROD-10` Kontribusi dan pembagian pasangan — Partial

Runtime masih mendukung **pembagian beban biaya legacy** untuk expense shared dengan mode `unspecified`, `equal`, atau `percentage` demi compatibility histori, backup/restore, export, dan API lama. UI canonical transaksi baru selalu memakai `unspecified`; snapshot split lama tetap disimpan apa adanya, tidak di-backfill 50:50, dan tidak mengubah saldo ledger.

**Arah produk:** karena Saldo Bersama memakai full transparency keluarga dan pengeluaran diperlakukan sebagai pengeluaran keluarga, payer/beneficiary/settlement serta kontribusi aktual tidak menjadi roadmap aktif. RFC-0013 dipertahankan sebagai catatan kompatibilitas/domain bila positioning produk kelak berubah.

### `REQ-PROD-11` Pencatatan cepat dan transaksi belum jelas — Partial

Quick entry, pencarian, deteksi duplikat, transaksi belum dialokasikan, review queue transaksi tanpa Alokasi Dana, dan aksi **Pakai lagi** tersedia. `Pakai lagi` hanya melakukan prefill field transaksi yang aman, memakai tanggal hari ini, tidak membawa ID/row-version/idempotency lama, dan tetap memerlukan konfirmasi Simpan sehingga duplicate guard canonical tetap berlaku. Untuk expense baru, rekening sumber Rp0 disembunyikan dari daftar utama kecuali rekening terpilih/`allow_negative`; kategori yang baru dipakai pada rekening yang sama dapat dipilih cepat; dan relasi Kebutuhan memakai `budget_id` bila sudah eksplisit. Tombol `+` pada satu Kebutuhan adalah intent eksplisit: composer wajib mempertahankan rekening sumber, kategori, Alokasi, dan `budget_id` Kebutuhan tersebut sebagai context terkunci **sejak render pertama**, menonaktifkan smart-selection generic, serta fail-closed saat submit bila context berubah sehingga user tidak memilih ulang dan transaksi tidak dapat jatuh diam-diam ke Dana Tersedia. Tanggal tetap dapat dipilih hanya di dalam periode Alokasi; Kebutuhan `Sekali bayar` tidak menawarkan `Tambah lagi` setelah transaksi contextual berhasil. Smart matching Kebutuhan dievaluasi per pasangan Kebutuhan+Alokasi untuk entry generic: tepat satu kandidat boleh dipilih otomatis, sedangkan dua atau lebih kandidat—termasuk beberapa Kebutuhan berkategori sama pada Alokasi yang sama—wajib meminta pilihan user. Edit existing tidak ditimpa dan server tetap menjadi guard final. Expense tanpa Alokasi Dana tetap memakai konfirmasi eksplisit `Simpan tetap` sampai product flow tersebut diputuskan ulang; Dashboard/push mengingatkan transaksi yang belum masuk rencana.

**Gap:** draft sementara, kategori “belum dikategorikan”, template transaksi tersimpan, dan reminder kelengkapan menunggu RFC-0011.

### `REQ-PROD-12` Utang dan piutang — Planned

Harus memisahkan kontrak kewajiban, pencairan, cicilan, settlement, saldo tersisa, pihak terkait, jatuh tempo, dan transaksi ledger. Tidak boleh hanya menambah tipe transaksi. Lihat RFC-0012.

### `REQ-PROD-13` Laporan — Partial

Tersedia cash flow bulanan, saldo awal/akhir, tren 1 bulan harian atau 3/6/12 bulan, kategori, rekening, Kebutuhan vs aktual, aktivitas pencatatan, dan **scope per Alokasi**. Scope Alokasi dihitung di backend melalui `allocation_rule_id`; summary berubah menjadi dialokasikan/terpakai/sisa/penggunaan dan seluruh breakdown/tren/transaksi mengikuti scope yang sama, bukan filter kosmetik frontend. Transfer internal tidak dihitung sebagai arus kas. Halaman `/laporan` memakai satu hierarchy responsive yang flat/minimal: satu surface ringkasan utama, lalu section dengan spacing/divider agar mobile hemat ruang dan desktop tetap lega; shell/navigation aplikasi tidak berubah. Alert operasional tidak dirender di Laporan karena Notification Center/Dashboard adalah surface tindakan. Seluruh angka UI, **PDF siap baca multipage**, dan **Excel terolah** berasal dari contract canonical `reports.monthly` yang sama.

**Gap:** dokumen otomatis tersimpan untuk semester/tahunan, debt/receivable, dan target stages menunggu tahap berikutnya. Payer/beneficiary serta kontribusi nyata tidak menjadi roadmap aktif selama positioning full-transparency keluarga tetap berlaku.

### `REQ-PROD-14` Rekonsiliasi saldo — Implemented

Menyimpan saldo sistem, saldo aktual, selisih, status, catatan, dan actor untuk rekening non-Investasi. Dashboard dan Notification Center memberi pengingat rekonsiliasi lebih dari 30 hari. Hasil rekonsiliasi eksplisit—termasuk mismatch—menjadi checkpoint sehingga selisih tetap berada di histori tanpa terus menghasilkan notifikasi aktif; contextual entry membawa rekening yang sudah diketahui, sedangkan entry manual tetap memakai picker. Jika hasil pencocokan masih berbeda, UI menawarkan pemeriksaan transaksi rekening terkait tanpa membuat adjustment otomatis. Rekening Investasi/RDN memakai `investments.reconciliations.create` karena Saldo RDN dan holding harus diverifikasi bersama.

### `REQ-PROD-15` Hak akses dan transparansi keluarga — Implemented

Administrator/Member, shared/personal, ownership query, dan backend authorization tersedia. Kedua akun keluarga terotorisasi membaca seluruh rekening, transaksi, laporan, rekonsiliasi, dan data finansial keluarga yang relevan. `personal` berarti rekening dipegang/dioperasikan salah satu anggota, bukan rekening tersembunyi dari pasangan. Write tetap capability-driven dan diverifikasi backend.

**Keputusan produk:** mode balance-only, contribution-only, private account, hidden transaction, atau privacy projection per pasangan tidak akan dikembangkan selama positioning Saldo Bersama tetap full transparency. RFC-0015 ditolak sebagai arah produk.

### `REQ-PROD-20` Investasi manual asset-centric — Implemented

Sistem mencatat saham dan reksa dana aktual secara manual tanpa menyimpan credential aplikasi investasi atau menganggap broker/market API sebagai authority. Mental model user adalah **aset**, bukan broker/RDN/portfolio: route Investasi menampilkan Total investasi tercatat, daftar aset langsung, tab Aset/Aktivitas, filter Semua/Saham/Reksa Dana, detail quantity/modal/harga/nilai/P&L, serta aksi Beli/Jual/Perbarui nilai. Nama Ajaib/Bibit/Indodax/source tidak menjadi parent UI.

Posisi aset baru dibuat melalui `investments.assets.create` dengan instrumen existing atau metadata instrumen yang diizinkan, quantity/share, cost basis, reference price, tanggal, dan catatan. Backend dapat reuse portfolio legacy yang operable atau membuat compatibility portfolio + rekening internal Rp0 `is_system_hidden=1`; rekening internal tidak tampil pada Rekening, Transfer, Planning, atau generic reconciliation. Compatibility layer ini mempertahankan FK dan histori investasi lama tanpa memaksa user membuat RDN/broker terlebih dahulu.

Buy/Sell current adalah **pencatatan posisi accounting-only**. `cash_amount` tetap immutable untuk weighted cost basis/realized P/L, tetapi `cash_effect_enabled=0` sehingga Buy/Sell baru tidak memutasikan rekening/RDN dan tidak memerlukan Saldo RDN cukup. Sell tetap tidak boleh melebihi holding; fee/tanggal/idempotency/row-version tetap divalidasi. Valuasi manual append-only, harga trade/opening-position menjadi fallback, realized P/L hanya terbentuk pada sell, dan unrealized P/L berasal dari market value dikurangi remaining cost basis. Semua event investasi tetap bukan income/expense.

Histori investasi lama tidak ditulis ulang: row legacy yang memang memiliki dampak cash tetap dapat direplay melalui `investment_account_events`, sedangkan record Buy/Sell/opening-position current memakai `cash_effect_enabled=0`. Portfolio/RDN/reconciliation/correction lama tetap readable untuk maintenance/recovery, tetapi bukan flow utama UI. Backup current membawa compatibility flags dan seluruh history authoritative; restore normalizer mempertahankan semantics historis tanpa mengarang event baru.

**Acceptance:** user dapat menambah saham/reksa dana tanpa membuat broker/RDN/portfolio; UI tidak mengelompokkan aset berdasarkan broker; Total investasi utama = `market_value`, bukan market + RDN; direct position/Buy/Sell current tidak mengubah saldo rekening dan tidak ditolak karena cash RDN; oversell/stale write/invalid fee/tanggal tetap ditolak backend; Member tidak dapat mengambil alih portfolio personal pengguna lain; internal compatibility account tidak muncul pada `accounts.list`; histori legacy mempertahankan cash effect; backup→restore mempertahankan quantity, cost basis, realized/unrealized P/L, cash-effect/compatibility flags, dan histori authoritative.

### `REQ-PROD-16` Notifikasi berguna — Partial

Queue idempotent dan Web Push mendukung recurring due, Kebutuhan threshold, Alokasi Dana threshold, target tertinggal, transaksi belum dialokasikan, **peringatan dana recurring expense kurang pada H-2**, konfirmasi occurrence recurring, reminder rekonsiliasi configurable, dan reminder konsistensi pencatatan opt-in. Saldo untuk shortage dihitung dari ledger Turso melalui read-model canonical. Queue normal dibuat server dari objek yang sudah lolos guard, tetapi transport Web Push memakai privacy-safe lock-screen payload: hanya tipe/id/target yang dikirim dan Service Worker menampilkan copy generik tanpa nominal, rekening, merchant, atau nama objek finansial.

Notification Center bersifat task-first: kondisi actionable ditampilkan sebagai **Perlu dilakukan**, event lain sebagai histori terbaru, dan deep-link membawa konteks entity/tindakan yang sudah diketahui. Status baca canonical disimpan server per actor sebagai `notification_key + fingerprint` sehingga HP/Desktop sinkron; **read tidak sama dengan resolved**. Source alert tetap menentukan apakah kondisi aktif, dan fingerprint baru membuat kondisi yang berubah/memburuk muncul sebagai unread kembali. Preference tujuh tipe alert tetap account-level, `recurring_completed` default mati agar tidak berisik, pengingat manual one-shot tetap tersedia, dan cadence rekonsiliasi dapat dipilih 0/14/30/60 hari (default 30). Push hanya aktif bila VAPID lengkap.

**Gap:** verifikasi real Android/iOS masih diperlukan. Transaksi besar configurable dan generic low-balance alert sengaja belum menjadi contract karena threshold universal dapat menambah noise; perubahan pasangan diprioritaskan sebagai aktivitas in-app/audit yang transparan, bukan push per transaksi.

### `REQ-PROD-17` Keamanan dan anti-kesalahan — Implemented

Google login, signed session v2 + registry `user_sessions`, registry `users` canonical, backend authorization, audit append-only, soft cancel, idempotency, row version, duplicate guard, formula neutralization, XLSX, backup/restore guarded, filter transaksi, dan integrity check tersedia. Frontend mutation memakai intent coordinator untuk coalescing double-submit dan reuse idempotency key pada retry outcome-unknown. Selama hasil mutation biasa belum definitif, payload berbeda untuk action yang sama diblok dan metadata intent aman dipersist lintas reload tanpa payload finansial agar edit user tidak diam-diam menjadi mutation kedua; external action mereservasi key sebelum side effect. Confirmation destructive action memiliki synchronous reentrancy lock. Alokasi Dana memiliki archive/restore rule dan reverse movement tanpa hard delete. `ALLOWED_USERS_JSON` hanya bootstrap/recovery Administrator pertama; anggota runtime dikelola Administrator melalui registry `users`.

**Operasional yang tetap memerlukan evidence:** full quality gate pada runtime Node yang didukung, migration parity Production, real-resource restore drill, external alerting, dan secret-rotation drill sesuai runbook.

### `REQ-PROD-18` Reminder konsistensi pencatatan — Implemented

Sistem dapat memberi nudge actor-scoped bila tidak ada aktivitas pencatatan transaksi dalam cadence yang dipilih user, tanpa menganggap hari tanpa transaksi sebagai error dan tanpa menampilkan nominal/detail privat pada lock screen. Cadence bersifat **opt-in** dengan pilihan Mati/3/5/7 hari dan default Mati. Aktivitas dihitung dari `created_by`, sehingga transaksi pasangan tidak dianggap sebagai aktivitas pencatatan actor lain. Scheduler memakai timezone Asia/Jakarta, dedupe berbasis actor + checkpoint aktivitas + cadence, privacy-safe Push, dan deep-link `/transaksi`.

**Acceptance:** reminder mati secara default; cadence di luar 0/3/5/7 ditolak; actor tanpa aktivitas memakai waktu pembuatan user sebagai checkpoint; scheduler tidak membuat duplikasi untuk checkpoint/cadence yang sama; copy tidak menyalahkan user dan tidak memuat nominal/detail privat pada lock screen; perubahan setting memakai row-version dan audit server-side.

## Alur produk

**Setup usable = Rekening + Kategori siap → user sudah dapat mencatat transaksi. Perencanaan bersifat opsional: buat wadah Alokasi Dana → tambahkan Kebutuhan → sistem mengikat Dana Tersedia otomatis sesuai nominal Kebutuhan → jadwalkan bila rutin; Target tetap jalur saving terpisah untuk dana yang masih dikumpulkan. Transaksi aktual tetap menjadi sumber ledger, lalu dibandingkan dengan Kebutuhan/anggaran, direkonsiliasi, dan ditutup per periode sesuai blocker canonical.**

Continuation UI hanya memberi prefill atau navigasi. Tidak ada workflow baru yang boleh auto-submit mutation finansial, membuat adjustment rekonsiliasi, atau mengubah blocker period-close di luar contract backend canonical. Restore master tetap terpusat di **Pengaturan → Data & cadangan → Pemulihan data**; feedback global tidak menjadi generic undo/rollback.

Fitur planned tidak boleh memengaruhi saldo sampai model, migration, authorization, audit, backup/restore, dan test disetujui melalui RFC.


### Pemanis visual Alokasi
Dekorasi kartu Alokasi Dana boleh dipilih dari template canonical dan disimpan sebagai `decoration_key`. Metadata ini murni presentasi dan tidak boleh mengubah perhitungan finansial.

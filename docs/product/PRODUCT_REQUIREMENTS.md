# Product Requirements

## Tujuan

Saldo Bersama adalah sistem pengendali uang privat untuk dua akun Google. Sistem harus menjawab: uang berasal dari mana, berada di rekening mana, sudah dialokasikan untuk apa, dipakai oleh siapa, tersisa berapa, dan apakah kewajiban serta target bersama masih aman.

## Pengguna dan istilah role

- **Owner**: mengelola anggota, master data, maintenance, backup/restore, dan operasi administratif.
- **Member**: role runtime yang saat ini dipakai untuk pasangan. Perluasan hak menjadi “Partner” penuh masih menunggu keputusan RFC-0016.
- Istilah UI boleh memakai “pasangan”, tetapi action permission tetap mengikuti `owner`/`member` sampai RFC diterima dan source diubah.

## Invariant produk

- `REQ-FIN-001` Nominal Rupiah disimpan sebagai integer.
- `REQ-FIN-002` Saldo dihitung dari saldo awal dan transaksi aktif; tidak boleh diedit bebas.
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

Mendukung income, expense, transfer, refund, adjustment; tanggal, nominal, rekening, kategori, pencatat, merchant, metode, catatan, status aktif/cancelled/archived, idempotency, conflict, dan audit.

**Gap yang memerlukan RFC/schema:** pengguna uang (`used_by`), bukti/struk privat, draft/rencana/belum dibayar, utang, dan piutang. Lihat RFC-0011 dan RFC-0012.

### `REQ-PROD-03` Kategori kebutuhan — Partial

Kategori memiliki jenis transaksi dan `nature` untuk fixed, variable, unexpected, discretionary, emergency, savings, dan other. Kategori dapat ditambah/diarsipkan.

**Gap:** parent/subcategory dan taxonomy bertingkat menunggu RFC-0014.

### `REQ-PROD-04` Kantong dan alokasi — Implemented

Pemasukan dapat dikendalikan melalui kantong daily, weekly, biweekly, monthly, paycycle, atau custom; shared/personal; rollover; overspend policy; realokasi; sisa alokasi; dan dana belum dialokasikan.

### `REQ-PROD-05` Anggaran harian, mingguan, bulanan — Partial

Kantong mendukung periodisasi harian sampai custom. Budget kategori bulanan memiliki ambang configurable. Dashboard, laporan, dan push memberi peringatan actionable ketika batas terlampaui.

**Batas saat ini:** budget kategori bukan rule multi-periode; level 90/100 diturunkan saat runtime tanpa kolom baru.

### `REQ-PROD-06` Target tabungan — Partial

Target menyimpan nominal, tanggal, rekening, prioritas, saldo terkumpul, sisa, proyeksi pace, dan kebutuhan setoran bulanan. Kontribusi/penarikan menghasilkan transfer ledger.

**Gap:** kontribusi per orang dan tahap renovasi menunggu RFC-0013/RFC-0014.

### `REQ-PROD-07` Tagihan dan kewajiban rutin — Partial

Recurring rule/occurrence mendukung nominal, frekuensi, jatuh tempo, rekening, metode, auto-debit, priority, payment/reversal, overdue, dan status pembayaran.

**Gap:** penanggung jawab eksplisit dan receipt terhubung menunggu RFC-0011/RFC-0013.

### `REQ-PROD-08` Kalender keuangan — Partial

Google Calendar mirror menampilkan recurring shared dan tidak menjadi source status pembayaran.

**Gap:** kalender internal lintas pemasukan, target, renovasi, liburan, dan agenda berwarna belum diimplementasikan.

### `REQ-PROD-09` Dashboard pasangan — Implemented

Menampilkan total saldo, saldo aman, dana terlindungi, dana belum dialokasikan, cash flow, tagihan, target, transaksi terbaru, dan peringatan budget/kantong/tagihan/target/rekonsiliasi.

### `REQ-PROD-10` Kontribusi dan pembagian pasangan — Planned

Sistem perlu membedakan pencatat, pengguna, pembayar, penanggung, dan aturan split 50:50/persentase/nominal/tanggung jawab tertentu.

**Catatan:** laporan “aktivitas pencatatan” saat ini bukan laporan kontribusi. Lihat RFC-0013.

### `REQ-PROD-11` Pencatatan cepat dan transaksi belum jelas — Partial

Quick entry, pencarian, deteksi duplikat, dan transaksi belum dialokasikan tersedia. Dashboard/push mengingatkan transaksi expense tanpa kantong.

**Gap:** draft sementara, kategori “belum dikategorikan”, clone/template, dan reminder kelengkapan menunggu RFC-0011.

### `REQ-PROD-12` Utang dan piutang — Planned

Harus memisahkan kontrak kewajiban, pencairan, cicilan, settlement, saldo tersisa, pihak terkait, jatuh tempo, dan transaksi ledger. Tidak boleh hanya menambah tipe transaksi. Lihat RFC-0012.

### `REQ-PROD-13` Laporan — Partial

Tersedia cash flow bulanan, saldo awal/akhir, tren 3/6/12 bulan, total saldo lintas bulan, kategori, rekening, nature, budget vs actual, dan aktivitas pencatatan pengguna. Transfer internal tidak dihitung sebagai arus kas.

**Gap:** kontribusi nyata, debt/receivable, dan target stages menunggu model datanya.

### `REQ-PROD-14` Rekonsiliasi saldo — Implemented

Menyimpan saldo sistem, saldo aktual, selisih, status, catatan, dan actor. Dashboard memberi peringatan selisih atau rekonsiliasi lebih dari 30 hari.

### `REQ-PROD-15` Hak akses dan privasi — Partial

Owner/member, shared/personal, ownership query, dan backend authorization tersedia.

**Gap:** mode full detail, balance-only, contribution-only, dan private penuh per rekening memerlukan projection backend serta RFC-0015.

### `REQ-PROD-16` Notifikasi berguna — Partial

Queue idempotent dan Web Push mendukung recurring due, budget threshold, kantong threshold, target tertinggal, transaksi belum dialokasikan, **peringatan dana recurring expense kurang pada H-2**, dan notifikasi generik ketika occurrence recurring tercatat selesai. Saldo untuk shortage dihitung dari ledger Turso melalui read-model canonical; push lock-screen tetap tidak memuat nama tagihan, rekening, atau nominal. Push hanya aktif bila VAPID lengkap.

**Gap:** transaksi besar configurable, saldo rendah umum configurable, perubahan pasangan, cadence rekonsiliasi configurable, dan verifikasi real Android/iOS masih belum tersedia.

### `REQ-PROD-17` Keamanan dan anti-kesalahan — Implemented

Google login, signed session, allowlist, backend authorization, audit append-only, soft cancel, idempotency, row version, duplicate guard, formula neutralization, XLSX, backup/restore guarded, filter transaksi, dan integrity check tersedia. Frontend mutation sekarang memakai intent coordinator untuk coalescing double-submit dan reuse idempotency key pada retry outcome-unknown; external action mereservasi key sebelum side effect. Confirmation destructive action memiliki synchronous reentrancy lock. Kantong memiliki archive/restore rule dan reverse movement tanpa hard delete.

**Operasional yang belum terbukti:** full quality gate Node 24 pada patch terbaru, migration parity production, real-resource restore drill, external alerting, dan rotasi secret yang pernah ikut ZIP manual.

## Alur produk

**Uang masuk → dibagi ke kantong → digunakan lewat ledger → dibandingkan dengan budget → sisa diarahkan ke target → saldo direkonsiliasi.**

Fitur planned tidak boleh memengaruhi saldo sampai model, migration, authorization, audit, backup/restore, dan test disetujui melalui RFC.

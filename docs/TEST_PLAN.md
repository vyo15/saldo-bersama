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

- Schema Production harus versi 20 sebelum runtime current menerima traffic.
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
- Smart default rekening/kategori/Alokasi tidak auto-submit.
- Expense tanpa Alokasi dan Transfer memvalidasi Dana Tersedia bila negative balance tidak diizinkan.
- Cancel/archive/retry menjaga ledger, audit, dan idempotency.
- RFC-0019 belum runtime: satu transaksi canonical masih satu category/Alokasi; test tidak boleh mengasumsikan line item sudah implemented.

### Kategori

- Kategori expense/income mengikuti type/nature/status canonical.
- Approval `masterDataRequests.review` memicu dependency realtime kategori sehingga device Member tidak memerlukan restart aplikasi.
- Kategori master tidak diduplikasi hanya karena dipakai pada beberapa Alokasi.

## Alokasi Dana dan Kebutuhan

### Flow Alokasi canonical

- Create Alokasi meminta nama, rekening sumber, pengguna/penerima, dan optional pengaturan periode/rollover; **tidak meminta budget awal** sebagai flow utama.
- Alokasi baru tanpa Kebutuhan memiliki `allocated_amount=0`.
- Manual fund/release tetap diuji sebagai advanced/compatibility control dan tidak membuat transaksi ledger.
- Realokasi antar rekening tidak boleh menjadi envelope movement lintas account; gunakan Transfer canonical.

### Auto-funding Kebutuhan

- `budgets.batchCreate` mendukung maksimal 20 item, atomic, kategori unik pada Alokasi/batch, dan optional Jadwal Rutin dalam transaction yang sama.
- Menambah Kebutuhan otomatis menaikkan dana Alokasi sebesar delta dari Dana Tersedia tanpa mengubah saldo fisik.
- Edit nominal hanya menyesuaikan delta; nominal tidak boleh turun di bawah usage aktual.
- Bila Dana Tersedia kurang, backend mengembalikan `BUDGET_FUNDING_INSUFFICIENT` dengan `requiredAmount`, `availableAmount`, `shortageAmount`; **tidak ada partial budget/recurring/funding write**.
- Frontend tetap boleh menyimpan input sebagai draft lokal, menampilkan `Butuh`, `Dana tersedia`, dan `Kurang`, serta menawarkan tambah saldo tanpa kehilangan draft; tombol Simpan tidak menjalankan mutation saat shortage.
- Archive/delete melepaskan hanya remaining need yang aman. Dana terpakai, reserved/committed, kebutuhan lain, dan inferred buffer tidak boleh ikut dilepas.
- Restore Kebutuhan mendanai ulang remaining need dan gagal atomic bila dana tidak cukup.
- Copy Kebutuhan saat period close bersifat opt-in; histori transaksi/usage tidak disalin dan funding periode tujuan mengikuti rule current.
- `/anggaran` hanya compatibility redirect; tidak boleh menghidupkan surface Anggaran kedua.

## Jadwal Rutin dan Target

- Recurring occurrence mengikuti timezone Asia/Jakarta, idempotency, account capability, completion/skip/restore, dan shortage rule.
- Scheduled Kebutuhan yang dibuat bersama batch harus memakai ownership/source account kompatibel; satu pelanggaran me-rollback seluruh batch.
- Target movement tidak boleh memanipulasi saldo tanpa transaksi/movement canonical dan reversal harus audit-safe.
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

- Dashboard memakai saldo operasional non-investasi dan tidak double-count RDN/market value.
- Report monthly/trend tidak menghitung Transfer sebagai income/expense dan memakai snapshot/read transaction konsisten.
- Rekonsiliasi non-investasi dan Investasi/RDN memakai service berbeda; generic reconciliation menolak RDN.
- Reconciliation checkpoint menyimpan mismatch historis tanpa persistent active alert setelah user melakukan pencocokan eksplisit.

## Notification dan Web Push

- Notification Center menggunakan feed/action canonical yang sama untuk mobile/desktop.
- Lock-screen Push tidak memuat nominal, rekening, merchant, atau nama objek finansial sensitif.
- Preference user dihormati; VAPID incomplete menonaktifkan Push fail-closed tanpa merusak in-app notifications.
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
- Detail object dengan sub-item erat memakai hierarchy section/list, bukan tumpukan card setara tanpa kebutuhan.

### Microcopy

- Satu fakta edukatif memiliki satu tempat utama pada satu surface.
- Copy tersebut tidak boleh diduplikasi lagi pada helper field/list bila sudah dijelaskan pada description/info canonical.
- Helper field menjelaskan field; warning finansial/destructive/recovery/error/conflict tetap dekat dengan dampaknya.
- Istilah Saldo, Dana Tersedia, Dialokasikan, Alokasi Dana, Kebutuhan, dan RDN mengikuti `product/GLOSSARY.md`.

## Security, maintenance, dan recovery

- Import/restore/reset/destructive operation memakai preview, verified backup bila wajib, confirmation, integrity verification, audit, dan allowlist exact.
- `maintenance_mode` memblok write dan tidak memblok read yang dibutuhkan untuk recovery.
- Trial Reset hanya pada database Development/Production yang binding marker-nya cocok; unbound/marker asing fail-closed sebelum side effect.
- Restore tidak menghidupkan kembali expired rate-limit state atau mengubah source-of-truth mirror direction.
- Secret/token/raw financial fixture/raw stack trace tidak masuk frontend, log, commit, atau ZIP.

## Schema dan migration

- Migration berurutan, additive bila memungkinkan, dicatat di `schema_migrations`, dan current runtime version sama dengan `DATABASE_SCHEMA_VERSION`.
- Schema Production harus versi 20 sebelum deployment current menerima traffic.
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

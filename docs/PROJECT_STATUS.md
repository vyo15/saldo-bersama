# Project Status

**Last source verification:** 2026-08-04
**Repository:** `vyo15/saldo-bersama`
**Source baseline:** `saldo-bersama-clean(131).zip` + patch modal/template/sidebar yang disetujui 2026-08-04
**Schema:** version 5, migrations `001_initial_schema.sql`, `002_account_number.sql`, dan `003_account_bank_template.sql`
**Runtime baseline:** Node 24.x, npm 10+

Dokumen ini adalah snapshot. Source dan test aktual tetap menjadi bukti implementasi utama.

## Arsitektur aktif

- React 19, React Router, dan Vite PWA.
- Shared UI primitive memakai CSS Modules serta design tokens; feature dilarang direct import toolkit.
- Firebase Google Authentication dan signed HttpOnly session.
- Login mobile memakai logo resmi, komposisi glass card, background rupiah bergaya ilustratif CSS, theme toggle, reduced-motion fallback, trust messaging, dan kredit pembuat; host tombol Google canonical serta verifikasi backend tetap tidak berubah.
- Lima Vercel Functions canonical: session, gateway, export, health, jobs.
- Turso/libSQL sebagai satu-satunya source of truth finansial.
- Apps Script hanya integration bridge bertanda tangan untuk Sheets mirror, Calendar, Drive backup, dan scheduler.
- Google Sheets hanya mirror data `shared`; data personal tidak dikirim ke spreadsheet bersama.
- Web Push diproses melalui queue backend.

## Struktur dan quality guard

- Backend planning, reporting, dan maintenance telah dipisah per domain dengan facade kompatibel.
- Metadata read/write, maintenance allowance, external side effect, dan kebutuhan idempotency berada di `api/_lib/actions/policy.js`; handler canonical berada di `api/_lib/actions/registry.js`.
- Frontend API transport, cache, error, dan facade feature telah dipisah; page/form tidak melakukan direct write melalui transport global.
- Dashboard dipisah menjadi orchestration page dan komponen desktop/mobile.
- Test backend dikelompokkan berdasarkan business, database, security, maintenance, integration, tooling, governance, migration, dan performance.
- Artifact policy, safe cleanup, clean ZIP verification, serta build budget tersedia.
- Browser smoke berbasis Chromium/CDP tersedia untuk redirect login, viewport mobile, overflow, target sentuh, landmark, accessible name, dan accessibility tree tanpa dependency browser-test tambahan.
- Integrasi axe penuh dan visual-regression baseline masih belum tersedia karena dependency tersebut belum menjadi bagian lockfile.



## Modal, template rekening, dan navigasi shell 2026-08-04

- Focus trap dialog memakai callback Escape melalui ref stabil. Mengetik pada controlled input tidak lagi memicu cleanup/setup trap, memindahkan fokus ke tombol tutup, atau memaksa pengguna mengklik field setiap karakter.
- Schema v5 menambah `accounts.bank_template` yang divalidasi backend. Template BCA/BNI/BTN/Mandiri/Permata kini disimpan terpisah dari `accounts.name`; mengganti template tidak mengubah nama rekening.
- Migration v5 memetakan suffix bank legacy ke field baru tanpa mengubah nama, saldo, transaksi, ownership, atau authorization. Restore v5 menerima backup v3/v4 dan menormalisasi field yang belum ada sebelum apply.
- Form tambah/edit mengirim template canonical, menyediakan initial focus pada Nama rekening, dan memakai placeholder nama yang netral. Preview kartu membaca template secara eksplisit.
- Sidebar desktop tetap memakai bentuk/mask melengkung Saldo Bersama, tetapi rail dan target sentuh diperbesar. Submenu disederhanakan menjadi daftar satu baris dengan close button aksesibel; menu mobile tidak lagi menduplikasi theme toggle dan logout dipisahkan ke footer.

## Rekening, kategori, authorization read-path, dan responsive parity 2026-08-03

- Route `/rekening` sekarang fokus pada daftar/detail rekening; pengelolaan kategori dipindahkan ke `/kategori` dengan API facade dan state mandiri.
- Panel detail rekening diperbesar hingga kolom 28–32rem, kartu detail maksimum 26.5rem, dan seluruh asset bank tetap rasio 1.586:1. Pada viewport sempit detail menjadi dialog overlay dengan focus trap, Escape, scroll lock, dan focus restoration setelah rekening dipilih. Nomor panjang dipadatkan hanya pada muka kartu; detail/copy tetap memakai nilai lengkap.
- Kedua pengguna aktif dapat membaca seluruh rekening dan ledger pasangan. Response rekening membawa `owner_name`, `is_owned_by_actor`, `can_transact`, `can_reconcile`, `can_manage`, dan `read_only` dari backend.
- Hak operasi tidak diperluas: member hanya dapat memakai shared atau personal miliknya, hanya dapat update/cancel transaksi sendiri pada scope operable, dan tidak dapat merekonsiliasi rekening personal pasangan.
- Transaction form menyaring pilihan write berdasarkan `can_transact`; daftar/filter transaksi, breakdown laporan, riwayat rekonsiliasi, dan alert rekening menampilkan label pemilik agar rekening bernama sama tidak ambigu.
- Total saldo dashboard tetap transparan untuk semua rekening, sedangkan saldo aman, batas harian, dana belum dialokasikan, dan jumlah transaksi belum dialokasikan hanya memakai rekening/scope yang dapat dioperasikan actor.
- Bug mobile `.two-column-grid,` yang menyembunyikan Tagihan, seluruh chart Laporan, serta kolaborasi/admin Pengaturan telah diperbaiki. Override `.settings-card` ≤580px juga dipulihkan.
- Blok responsive global dikonsolidasikan menjadi satu blok per breakpoint dan diurutkan besar-ke-kecil; static/browser regression menjaga selector tidak menggantung dan capability mobile tetap memiliki ukuran nonzero.
- Navigasi memakai ikon semantic, route `/kategori`, dan pemilihan mobile berbasis path alih-alih indeks array.
- Owner dapat menetapkan pemilik rekening personal dari daftar user aktif. Kegagalan refresh user tidak menyebabkan client menebak user ID: create fallback ke actor terverifikasi di backend dan edit mempertahankan ownership existing.
- Route Kategori mendukung kategori refund seperti kontrak backend. Mutation rekening/kategori memakai refresh best-effort setelah respons server sukses; kegagalan reload domain maupun refresh dashboard/bootstrap ditampilkan sebagai refresh warning dan tidak mengubah mutation yang sudah terkonfirmasi menjadi kegagalan semu.

## Financial account-card UI 2026-08-03

- Halaman Rekening memakai workspace list/detail: banyak rekening tetap ringkas di kolom daftar, sedangkan rekening terpilih ditampilkan pada panel detail sticky di desktop dan overlay penuh pada mobile setelah item dipilih.
- Seluruh visual BCA, BNI, BTN, Mandiri, dan Permata memakai kanvas WebP 768×484 serta rasio CSS 1.586:1. Asset Mandiri dinormalisasi agar tidak berbeda tinggi/lebar dari bank lain.
- Kartu tidak dibungkus panel dekoratif tambahan; gambar base, nomor rekening, contactless, dan nama rekening membentuk satu visual proporsional. Saldo dan metadata tetap berada di luar gambar kartu.
- Schema v4 menambah `accounts.account_number` melalui migration `002_account_number.sql`. Nilai dinormalisasi menjadi 6–34 digit di backend; nomor rekening bank wajib pada create dan dapat diperbarui dengan `row_version`.
- Nomor rekening hanya dikirim setelah session serta binding user backend valid, dapat dibaca kedua pengguna terotorisasi dan disalin dari panel detail, tetapi tidak pernah dipakai sebagai nomor kartu debit. PIN, CVV, masa berlaku, dan nomor kartu tetap dilarang.
- Audit account menyimpan bentuk bertopeng `••••1234`, bukan nomor lengkap. Sheets mirror dan export baca tidak menambahkan nomor rekening; backup teknis terjaga tetap mencakup seluruh tabel untuk recovery.
- Form tambah/edit menyediakan field `No rekening`; preview langsung memakai grouping empat digit. Create/update tetap menunggu konfirmasi server dan me-reload master/dashboard.
- Static regression test menjaga layout list/detail, field nomor rekening, clipboard action, font monospace, rasio 1.586:1, ukuran asset 768×484, serta batas asset 160 KB.

## Browser parity stability follow-up 2026-08-02

Verifikasi Node 24 pada Clean 95 membuktikan quality gate unit/build hijau, tetapi browser journey masih 5/7. Dua root cause terpisah ditemukan:

1. Assertion privacy desktop memakai selector test `.desktop-finance-dashboard`, sedangkan class runtime canonical adalah `.dashboard-desktop`. Fitur runtime ada; selector test salah.
2. `useApiResource` memulai status internal `idle`. Beberapa page hanya menahan `loading`, sehingga satu frame konten ber-heading dapat muncul sebelum effect mengubah status menjadi loading. Browser helper dapat menangkap frame transien tersebut lalu heading hilang.

Perbaikan canonical:

- status yang diekspos hook menjadi `loading` ketika resource enabled masih internal `idle`;
- route readiness menolak `main.loading-screen` dan memverifikasi kondisi stabil dua kali;
- selector privacy browser mengikuti class runtime yang benar.

Tidak ada perubahan pada API, authorization, saldo, schema, atau business rule.

## CI browser-smoke hardening 2026-08-02

- Workflow Quality menyediakan public dummy `VITE_GOOGLE_CLIENT_ID` dan `VITE_FIREBASE_API_KEY` hanya saat build/check CI.
- Browser smoke memblokir Google Identity Services eksternal dan memakai mock lokal deterministik, sehingga tidak menunggu jaringan/provider.
- Governance test menjaga fixture public CI tetap tersedia dan tidak mengubah environment Production.

## Product-control alignment 2026-08-02

- Dokumen kebutuhan 17 area kini menjadi requirement canonical dengan status Implemented/Partial/Planned.
- `transactions.list` mendukung filter rekening, kategori, dan pencatat serta mengembalikan filter option yang sudah scope-filtered.
- `reports.monthly` menambah tren 3/6/12 bulan, total saldo lintas bulan, breakdown rekening, category nature, dan aktivitas pencatatan.
- Dashboard/laporan menampilkan alert budget, kantong, recurring, target, transaksi belum dialokasikan, serta rekonsiliasi.
- Goal read model menambah sisa target, proyeksi pace, dan kebutuhan setoran bulanan tanpa menyimpan angka turunan.
- Scheduled notification queue menambah budget/kantong threshold, goal behind, dan unallocated expense dengan dedupe key.
- Fitur yang memerlukan schema/authorization baru tidak dipaksakan; enam RFC Proposed mencakup transaction lifecycle/receipt, debt, contribution, hierarchy/stages, privacy, dan partner permission.
- Bootstrap dan sinkronisasi Vercel Development kini membersihkan `VERCEL_OIDC_TOKEN` secara otomatis sebelum memakai env dan setelah `vercel link`, termasuk jalur gagal; `env:push:development` dapat dijalankan ulang tanpa `env:clean` manual.

## Hotfix runtime backend 2026-08-02

- Refactor service sebelumnya meninggalkan import dependency pada reporting, budget, recurring, import, restore, dan integrity recovery. Import tersebut sudah dipulihkan tanpa mengubah schema atau kontrak API.
- `app.initialState` sekarang diuji melalui dispatcher authenticated dan database SQLite in-memory, sehingga error `GATEWAY_ERROR` akibat `ReferenceError` tidak dapat lolos hanya dengan syntax check.
- Backend ESLint `no-undef` dan `no-unused-vars` menjadi bagian `npm run lint`.
- Import/restore/integrity regression test menjalankan jalur apply dan maintenance recovery dengan Google bridge stub lokal.

## Browser route-readiness hotfix 2026-08-02

- Quality gate lokal Node 24, lint backend/frontend, 153 test unit/backend, production build, dan build budget telah lulus.
- Authenticated browser journey awal lulus 5/7; dua kegagalan identik pada `/rekening` berasal dari race test ketika `Page.navigate` sudah mengganti `location.pathname` tetapi DOM lama/loading masih aktif.
- Helper browser sekarang menunggu `document.readyState === "complete"` dan heading route expected sebelum assertion parity dijalankan.
- Tidak ada perubahan runtime UI, route, API, schema, authorization, atau data finansial pada hotfix ini.
- `npm run test:browser` wajib diulang pada Node 24 untuk mengonfirmasi 7/7 hijau.

## Desktop/mobile capability parity 2026-08-02

- Dashboard desktop dan mobile memakai satu view model, state filter, selection, lookup, serta privacy state yang sama.
- Dashboard desktop memakai kartu rekening aktual sebagai pemilih utama. Perubahan kartu hanya memfilter transaksi rekening dan running balance dihitung dari seluruh transaksi terbaru rekening sebelum filter tampilan diterapkan; statistik kategori tetap berlabel semua rekening karena API belum menyediakan breakdown kategori per rekening.
- Mobile menampilkan batas aman harian, dana belum dialokasikan, ringkasan rekening/kategori, seluruh alert melalui progressive disclosure, filter lengkap, dan detail transaksi bottom sheet.
- Desktop memperoleh privacy nominal yang sama; filter jenis transaksi tidak lagi disembunyikan pada layout compact.
- Tombol logout desktop tetap tersedia pada lebar 821–940px sampai navigasi mobile mengambil alih pada 820px.
- Menu `Lainnya` ditandai aktif pada route sekunder dan membawa `aria-current=page`.
- Browser fixture authenticated owner/member dan breakpoint regression ditambahkan tanpa mengubah API, role, schema, atau business logic.
- Full browser execution tetap bergantung pada build Node 24 dan Chromium; static/unit regression sudah menjadi quality guard source.

## Status implementasi dan aktivasi

- Auth, authorization, transaksi, saldo, transfer, idempotency, conflict, audit, planning, report, integration outbox, export XLSX, backup/restore guard, PWA, dan push tersedia pada source.
- Production migration tetap **pending real-data parity**.
- Backup/restore real-resource drill tetap wajib sebelum dinyatakan siap recovery production.
- Google bridge dan Web Push hanya aktif bila grup environment terkait lengkap dan telah diuji pada resource nyata.
- Branch protection, repository ruleset, GitHub Security features, serta Vercel dashboard settings harus diverifikasi di dashboard; source tidak dapat membuktikannya.
- Alerting eksternal dan retensi observability belum lengkap.

## Keputusan dan risiko aktif

1. Runtime lokal dan Vercel Production memakai satu database Turso sesuai keputusan pemilik. Jangan menjalankan data dummy atau operasi destruktif.
2. Vercel Development menjadi source bootstrap `.env.local` untuk komputer tepercaya; Production tetap runtime deployment dan Preview tetap kosong.
3. Environment canonical terdiri dari delapan key core wajib, satu logging opsional, serta grup integrasi opsional yang harus lengkap.
4. Rate limit runtime masih best-effort per instance.
5. Backup teknis terkompresi dan ber-checksum; enkripsi aplikasi belum menjadi baseline yang terbukti.
6. Mantine tetap staged dependency dan hanya boleh dipakai melalui wrapper shared.
7. ZIP manual penuh pernah memuat `.env.local`; `SESSION_SECRET` dan `TURSO_AUTH_TOKEN` harus dirotasi sebelum deployment berikutnya.

## Validasi terakhir pada patch desktop/mobile parity

```text
Source validation: 296 file PASS
Frontend unit/static tests: 49/49 PASS
Backend/database/security/tooling/governance tests: 104/104 PASS
Total automated tests: 153/153 PASS
Node syntax: 91 file PASS
Apps Script syntax/boot: 6 file, 2 urutan load PASS
npm ci/lint/build pada sandbox: belum dapat dijalankan karena registry internal tidak menyediakan vite-7.3.6.tgz dan runtime sandbox Node 22.16.0; Node 24 check pada komputer project wajib
browser smoke: belum dijalankan pada sandbox karena build/dependency tidak tersedia
```

## Prioritas berikutnya

1. Jalankan `npm ci`, `npm run check`, dan `npm run test:browser` pada Node 24 setelah menerapkan patch.
2. Uji seluruh route, dashboard filters/detail/privacy, logout breakpoint 820/821/940/941, serta owner/member pada perangkat nyata.
3. Uji filter transaksi, tren laporan, dashboard alert, target projection, dan push queue pada dua akun nyata.
4. Rotasi secret yang pernah ikut ZIP manual dan sinkronkan Development/Production secara guarded.
5. Putuskan RFC-0016 sebelum mengubah hak planning member; RFC schema lain tetap Proposed.
6. Terapkan branch protection/ruleset dan required `Quality` check.
7. Jalankan migration parity serta backup/restore real-resource drill.
8. Lengkapi axe/visual regression dan observability eksternal melalui dependency/RFC yang disetujui.

## Cara melanjutkan

Baca `../AGENTS.md`, dokumen ini, `PROJECT_HANDOFF.md`, dan source/test aktual. Jangan memakai ringkasan chat sebagai source of truth ketika repository tersedia.

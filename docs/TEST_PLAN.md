# Test Plan

## Hardening v14 (session/environment v12 dan rate-limit v13 tetap dipertahankan)

- Member collaboration v14: request rekening/kategori harus actor-scoped, review Administrator-only, `row_version` guarded, duplicate pending tidak membuat entity ganda; transfer shared → personal wajib approval untuk Member, approval membuat tepat satu transaksi canonical, personal milik Member dapat menjadi source direct ke tujuan readable yang valid, dan rekening personal pasangan tetap tidak boleh menjadi source/debit Member.
- Command isolation: `npm run dev` tidak boleh membuat/mengubah `.env.production.local`; `npm run prod` tidak boleh pull/menimpa `.env.local`. Google bridge pusat hanya boleh diselaraskan ke profile Production lokal jika grup Development lengkap dan Production kosong; drift lengkap fail-closed.
- `npm run prod` boleh membuka Production bila database/schema/frontend core sehat dan hanya scheduler/integrasi optional yang degraded; schema/binding/database/maintenance/`INTEGRITY_FAILED` tetap blocker. Scheduler menyimpan kode stage spesifik, bukan `STAGE_FAILED` generik.

- Schema Production harus versi 14 dan `database_environment` harus cocok dengan `DATABASE_ENVIRONMENT` serta `VERCEL_ENV`; cross-binding dan Preview bercredential harus fail-closed.
- OAuth production memverifikasi state, nonce, dan PKCE S256; session v2 hanya valid bila registry verifier hash, user aktif, Firebase UID binding, dan role canonical cocok; `ALLOWED_USERS_JSON` hanya bootstrap owner. Uji list/revoke own session, IDOR antar-user, revoke-all, role change/deactivation revoke, dan forced legacy re-login.
- `OUTCOME_UNKNOWN` harus memakai idempotency key yang sama setelah reload tanpa menyimpan payload finansial di browser storage.
- Scheduler configured tanpa heartbeat sukses atau heartbeat stale harus membuat health degraded; public `/api/health` tetap hanya status/timestamp/requestId.
- Backup v14 tidak membawa session/binding/heartbeat maupun `rate_limit_buckets`; restore v3-v13 tetap kompatibel dan restore sukses mencabut semua session lama serta mengosongkan bucket throttle ephemeral.


## Kontrak test

Gunakan dua lapis bukti otomatis:

1. **Behavior/domain test** untuk rule, helper, service, mutation, saldo, authorization, data integrity, dan kontrak UI yang dapat diuji deterministik tanpa browser.
2. **Static/source contract test** hanya untuk invariant yang memang literal seperti route, dependency boundary, forbidden API, required export, security guard, dan struktur deployment. Jangan mengunci nama variabel lokal atau bentuk JSX internal untuk membuktikan behavior.

UI/responsive/focus/navigation yang membutuhkan rendering browser diverifikasi melalui **manual device QA** sesuai scope. Automated `test:browser` telah dipensiunkan dari quality gate dan tidak boleh ditambahkan kembali tanpa approval perubahan tooling.

Setiap bug/regression harus memiliki regression test yang gagal terhadap behavior lama bila praktis dan PASS setelah fix. Setelah test/source/docs final, `npm run verify` wajib dijalankan lagi dari tree yang sama. PASS dari tree sebelum edit terakhir tidak berlaku.

## Otomatis

```bash
npm run lint
npm run test
npm run build
npm run verify
npm run zip
```

Untuk workflow harian, pengguna tidak perlu menjalankan gate manual sebelum setiap delivery: `git push origin main` memanggil managed pre-push yang membaca ref/SHA aktual, menolak dirty/non-fast-forward/mismatch, menjalankan full verification, lalu memeriksa profile + schema/binding Production secara **read-only** sebelum ref dikirim. Schema source yang lebih baru dari Production harus membatalkan push; push tidak boleh auto-migrate.

`npm run verify` adalah full gate tunggal: source validation, lint/syntax, frontend regression, production build, build budget, dan seluruh backend regression dengan coverage. Backend suite tidak dijalankan dua kali, dan guard security/governance tetap tercakup oleh suite canonical. `npm run zip` memastikan pre-push Auto Quality Guard tersedia lalu menjalankan full verification sebelum packaging. PASS menghasilkan `saldo-bersama-clean.zip`; failure tetap menghasilkan exit non-zero, tetapi bila source canonical masih valid dibuat `saldo-bersama-UNVERIFIED.zip` diagnostik dengan laporan tersanitasi staging-only. Archive UNVERIFIED tidak boleh dipakai untuk release/deploy. `npm ci` dan `npm run dev` juga memastikan pre-push Auto Quality Guard lokal tersedia; `git push` tetap dibatalkan bila full verification gagal. Di CI, langkah archive memanggil packager langsung setelah `npm run verify`, sehingga full verification tidak diduplikasi.



### Journey continuity transaksi, Alokasi Dana, Target, rekonsiliasi, dan period close

Patch continuity wajib mempertahankan kontrak berikut:

- `Pakai lagi` hanya tersedia untuk transaksi aktif yang didukung, membuka composer canonical dengan draft terbatas, memakai tanggal hari ini, tidak membawa transaction ID, `row_version`, idempotency key, atau field sistem, dan tidak pernah auto-submit.
- Smart rekening hanya menampilkan sumber yang dapat digunakan: sumber Pengeluaran dengan saldo Rp0 dan sumber Transfer dengan dana tersedia Rp0 disembunyikan; rekening tujuan Pemasukan/Transfer tetap lengkap, rekening terpilih tetap terlihat saat edit, dan rekening `allow_negative` tidak boleh disembunyikan atau diberi warning saldo palsu. Composer tidak lagi menyediakan Search/Lihat semua untuk rekening sumber; urutan recent-use tetap hanya presentational dan tidak boleh mengubah capability backend.
- Smart Alokasi hanya memakai Kebutuhan aktif dengan kategori, `envelope_rule_id`, rekening sumber, dan periode tanggal transaksi yang cocok. Tepat satu kandidat boleh dipilih otomatis pada create; kandidat >1 wajib dipilih user; 0 kandidat tetap mengizinkan `Belum dialokasikan`; edit existing dan draft Alokasi explicit tidak boleh ditimpa.
- Early funds feedback hanya merupakan UX hint untuk transaksi bertanggal hari ini; backend tetap source of truth untuk `INSUFFICIENT_BALANCE`, `UNALLOCATED_FUNDS_INSUFFICIENT`, dan overspend. `Tambah lagi` wajib membuat idempotency key baru serta mereset nominal/kategori/Alokasi/catatan, sementara mobile transfer khusus dengan `notifyOnSuccess=false` mempertahankan success flow existing.
- `Catat pengeluaran` dari detail Alokasi/Kebutuhan hanya tersedia bila hari ini berada di periode Alokasi aktif dan hanya membuka composer canonical dengan prefill, tanpa mutation langsung atau auto-submit.
- Create income biasa dan pencatatan recurring income menampilkan pilihan **Bagi ke Alokasi Dana** hanya setelah server memberi hasil sukses definitif; rekening sumber/nominal hanya prefill dan mutation alokasi tetap memakai `envelopes.adjustAllocation`.
- Dana tersedia dashboard membuka funding flow account-bound; hanya rekening aktif dengan dana tersedia dan Alokasi Dana eligible yang boleh dipilih, nominal tidak boleh melebihi dana tersedia, dan alokasi tidak membuat transaksi ledger baru.
- Review queue `UNALLOCATED_EXPENSE` hanya aktif bila user datang dari attention flow; setelah satu edit sukses jumlah tersisa diperbarui dan filter manual biasa tidak boleh memaksa auto-open item berikutnya.
- Release Alokasi Dana mempertahankan `sourceAccountId`; CTA ke Target hanya melakukan prefill source/nominal yang masih valid dan user tetap mengonfirmasi setoran.
- Rekonsiliasi dengan selisih menawarkan **Lihat transaksi rekening** dan tidak pernah membuat adjustment otomatis.
- Preview period close memetakan blocker `UNALLOCATED_EXPENSE` ke action koreksi. Issue integritas tidak boleh memaparkan raw error. UI tidak boleh mengubah advisory menjadi blocker jika backend `periods.previewClose` tidak menetapkannya sebagai blocker.
- Setup checklist menilai usability, bukan sekadar keberadaan row: kategori memerlukan income+expense aktif, Alokasi Dana memerlukan rekening sumber aktif, dan Target memerlukan rekening aktif. Guided continuation hanya muncul pada `setupFlow`, bukan pada create normal harian.
- Lifecycle master memakai entry CTA netral **Kelola data** sebelum preview server; modal hanya menawarkan hard delete untuk data benar-benar unused atau archive untuk data historis. Restore master tetap melalui **Pengaturan → Pemulihan data** dan tidak diduplikasi oleh generic undo.
- Kontrol sentuh dashboard balance visibility, menu Kategori, dan CTA perhatian Jadwal tetap memiliki effective hit target minimal 44×44px.


### Mobile UI consistency regression

- Static/UI regression mengunci token mobile normal: outer gutter/card/section 16px, control minimum 44px, `--mobile-native-control-font-size` 16px, dan metadata finansial meaningful sekitar 12px atau lebih. Teks facsimile/dekoratif non-informatif seperti miniature kartu atau elemen money-rain `aria-hidden` boleh lebih kecil hanya bila informasi operasional yang relevan tetap tersedia pada copy semantik yang terbaca.
- Verifikasi effective CSS `<=820px` untuk native `input`/`select`/`textarea` pada shared form, Transaction composer/history filter, Rekening, dan Rekonsiliasi; keberadaan `--font-size-body: 16px` desktop saja tidak cukup membuktikan Safari anti-auto-zoom.
- Generic topbar dan route full-bleed yang menyembunyikannya harus menghormati `safe-area-inset-top`; bottom navigation, feedback, modal footer, dan content gap menghormati safe-area bottom. Uji browser biasa dan installed PWA bila perangkat mendukung notch/Dynamic Island/cutout.
- Bottom navigation mobile tetap lima slot, tinggi 72px, ikon 24px, label 12px, FAB 52px, hit area tab non-FAB penuh 72px, serta active indicator non-color. Primary tab `/`, `/transaksi`, `/laporan` memulihkan scroll per tab; secondary route baru dimulai dari atas; browser Back/Forward memulihkan posisi entry history sebelumnya.
- Manual matrix minimum untuk patch responsive: 320×568, 360×640, 375×812, 390×844, 430×932, 768/820, boundary 820/821 dan 940/941, serta sanity desktop 1440px. Lakukan portrait utama + landscape sanity, light/dark, keyboard/focus-visible, reduced motion, zoom 200%, nama/email panjang, dan nominal Rupiah besar.
- Dengan virtual keyboard terbuka, Search, nominal, textarea, date/month/select, dan sticky modal action tetap dapat dijangkau. `scrollWidth <= clientWidth + 1` berlaku pada page/dialog kecuali scroller horizontal yang memang intentional.
- Data-state QA mencakup populated, true-empty, filtered-empty, loading, error, offline, dan conflict. True-empty full-page boleh optical-center; filtered/subsection empty tetap kontekstual dan tidak menjauh dari filter/action penyebab.

### Hardening regression tambahan

Patch hardening wajib mempertahankan regression berikut:

- semantic danger foreground pada `negative-soft` memenuhi kontras AA untuk teks normal;
- kontrol interaktif history transaksi mobile memakai effective target minimal 44×44px;
- laporan mobile tidak memakai micro-text 9/10px untuk metrik/label finansial;
- preferensi notifikasi menampilkan deskripsi dan switch mengacu ke deskripsi melalui `aria-describedby`;
- CSP production tidak mempertahankan allowance Google GSI yang sudah dipensiunkan;
- business integrity gagal bila `system_config.timezone` bukan `Asia/Jakarta` atau `currency` bukan `IDR`.

Manual QA untuk perubahan ini: 360×800, 390×844, 768×1024, 1366×768, light/dark, keyboard focus, 200% zoom, serta real device untuk Push. Browser automation tetap bukan gate canonical.

### Backend coverage gate

`npm run verify` menjalankan seluruh backend test sekali dengan Node built-in test coverage. Minimum canonical saat ini: **80% lines, 55% branches, 78% functions**. Coverage adalah blocking quality gate; jscpd tetap report-only/non-blocking dan tidak menggantikan behavioral test.

Cakupan wajib:

- schema STRICT, FK, integer Rupiah, ownership, bentuk transaksi, cancellation metadata, dan saldo awal negatif;
- backend `no-undef` dan `no-unused-vars` untuk mencegah import dependency hilang saat service dipecah;
- transport session login/logout wajib menunggu objek `Response`, mempertahankan `credentials: include` dan payload action, serta meneruskan API error terstruktur tanpa raw parser `TypeError`;
- authenticated `app.initialState`, budget, recurring create/update/pay/reverse, import apply, restore apply, dan integrity maintenance recovery dijalankan pada SQLite in-memory;
- income/expense/transfer/refund/adjustment; transfer mengikuti authority rekening sumber: personal Member → shared/personal pasangan boleh sebagai satu ledger canonical dengan ownership mengikuti source, shared → personal oleh Member wajib approval Administrator, source personal pasangan tetap ditolak;
- saldo historis per urutan transaksi, termasuk saldo minus sementara pada hari yang sama dan edit yang mempertahankan `created_at`;
- row-version conflict dan idempotency replay;
- guarded mutation: double-submit/coalescing, same-intent retry dengan idempotency key yang sama, `OUTCOME_UNKNOWN`, malformed successful response, persistent safe intent metadata tanpa payload finansial untuk mutation biasa, same-key retry setelah reload, payload berbeda pada action yang sama diblok selama outcome lama belum definitif, serta recovery/status opaque untuk reset, synchronous confirmation/browser-side lock, serta concurrent external reservation sebelum side effect;
- human-error guard memastikan double-submit/coalescing tidak menghasilkan mutation intent ganda;
- linked worktree release check: `.git` berbentuk file tidak gagal source validator dan clean archive tetap tidak bergantung pada `.env.local`;
- personal/shared authorization dan IDOR;
- recurring, envelope, budget, goal, reconciliation, close/reopen period; Target shared dapat menerima setoran dari rekening personal actor yang operable tanpa membuka rekening personal pasangan; archive/restore envelope rule dan reverse reallocation; restore Target/Jadwal rutin/Anggaran arsip; negative actual reconciliation hanya untuk account `allow_negative`;
- account-bound allocation: Alokasi Dana baru wajib satu `source_account_id`; `balance` fisik tidak berubah saat alokasi dibuat; `allocated_remaining` dan `available_balance` harus membentuk pembagian saldo tanpa double counting; expense dengan Alokasi Dana mengurangi saldo + sisa Alokasi Dana tetapi menjaga dana bebas untuk bagian yang ter-cover; expense tanpa Alokasi Dana/Transfer mengurangi dana bebas dan ditolak jika mengambil dana Alokasi Dana; expense Alokasi Dana beda rekening ditolak; realokasi baru lintas rekening ditolak dan reversal movement legacy tetap dapat dipakai untuk recovery;
- lifecycle allocation integrity: future-dated expense Alokasi Dana tidak membebaskan dana sebelum cutoff fisik, restore rule memeriksa dana tersedia terbaru, rule legacy tanpa sumber fail-closed, update/cancel/restore transaksi tidak boleh membuat `balance < allocated_remaining`, serta integrity mendeteksi source invalid, transaction source mismatch, active cross-account reallocation, dan `ALLOCATED_FUNDS_EXCEED_BALANCE`;
- recurring occurrence skip/restore: hanya owner, reason + row_version + idempotency, tidak mengubah ledger/saldo, status cancelled persisted, pay ditolak sampai dipulihkan, archive/restore rule tidak menghapus skip;
- notification preferences: tujuh tipe default aktif, actor-only, stale version conflict, mute per user, scheduled queue filter, backup/restore schema v14;
- Manual reminder: create/get/update/cancel pada Jadwal Rutin, Kebutuhan, Alokasi Dana, dan Target; waktu Asia/Jakarta future maksimal 366 hari; satu reminder `scheduled` per actor+entity; stale `row_version` dan create concurrent ditolak; actor tidak boleh membuat reminder untuk personal/assignee milik user lain; scheduler queue sekali dengan dedupe stabil; `reminders.get` mengembalikan `lastDispatch`; dispatch `pending/processing/failed/missing` menolak reminder baru dengan `REMINDER_DELIVERY_PENDING` sedangkan `sent/dead_letter` terminal; archive/delete/complete/close/cancel membatalkan reminder `scheduled` secara atomik; integrity mendeteksi user/entity/queue reminder yang drift; reset/backup/restore schema v14 mencakup tabel reminder dan tetap menerima snapshot lama secara additive.
- feedback global: `aria-live`, dedupe, mobile safe-area, reduced motion, tanpa generic hard rollback/undo;
- read snapshot consistency, maintenance recheck, outbox coalescing, stale worker lock ownership, scheduler replay guard, Calendar ScriptLock, dan duplicate managed-event self-healing;
- formula injection dan valid XLSX;
- backup checksum, preview expiry, safety backup, rollback restore, identity conflict, canonical `users` authorization precedence, push credential exclusion, reason + acknowledgement + exact restore phrase, serta preservation reservation `restore.apply` agar retry key yang sama mereplay hasil dan tidak menjalankan restore kedua;
- import all-or-nothing: mixed valid/invalid wajib ditolak tanpa partial apply, `confirm_duplicate` dari file diabaikan, duplicate antarbaris serta saldo/Alokasi Dana diuji kumulatif saat preview, apply stale wajib rollback seluruh record, dan success wajib safety backup + integrity verification + audit;
- service worker tanpa API cache, hanya menyimpan response navigation HTML sebagai app shell, tanpa offline write queue, dan memakai stale-while-revalidate untuk image URL stabil agar asset publik tidak tertahan versi lama setelah deploy; production OAuth desktop/mobile berjalan melalui `/api/auth/google/*` sehingga otomatis mengikuti network-only `/api/*`;
- Web Push: secure context, localhost development, iOS Home Screen requirement, permission denied, VAPID invalid/partial/key-pair mismatch/localhost subject, endpoint SSRF guard pada hostname, port, IPv4-mapped IPv6, NAT64/transition range, dan hasil DNS, terminal disable untuk resolusi private, transfer akun hanya dengan key subscription cocok, status backend, immediate test rate limit, queue detail server-generated tetapi transport lock-screen hanya `notificationType`/`targetPath`/`notificationId`, recurring shortage H-2 + completion notification dengan copy generic privacy-safe, 404/410 expiry, custom DNS lookup all/single callback, request timeout, stale lock, dan delivery per perangkat tanpa duplicate retry, serta integrity guard ownership/status queue;
- artifact cleanup/archive tidak menghapus protected path atau memuat secret/generated output; penggantian archive bersifat atomik, variasi clean lama dibersihkan dengan allowlist, dan ZIP patch/unrelated tidak disentuh;
- summary visual Target/Alokasi/Jadwal rutin/Anggota wajib memakai aset existing yang benar, bersifat dekoratif (`alt` kosong/`aria-hidden`), tidak mengubah data source/domain contract, dan tidak ikut diterapkan ke Dashboard/Transaksi/Laporan hanya sebagai hiasan;
- manual device QA summary-art pada 320/360/390/430px dan desktop wajib memeriksa overlap nominal/progress, light/dark mode, reduced motion, serta memastikan artwork tidak menangkap pointer atau menggeser action utama;
- halaman Rekening mobile wajib memakai swipe vertikal hanya pada kartu aktif, membiarkan scroll vertikal dari area kosong stack, menolak gesture horizontal, mengembalikan swipe pendek, mempertahankan pinch zoom, dan menjaga kontrol form minimal 16px;
- root, shell, main, dan content wajib memenuhi `100dvh` dengan fallback `100vh`; route Rekening harus mempertahankan background yang sama pada reserved navigation gap tanpa menghapus safe-area;
- manual device QA Rekening pada viewport kecil wajib memverifikasi tinggi shell, kontinuitas background content/experience, ruang aman sebelum navigasi, keterbacaan foreground, dan route 404 yang memenuhi sisa area konten;
- loading dan fatal error di luar shell harus memenuhi viewport, sedangkan loading/fatal error/404 di dalam shell harus memenuhi area yang tersisa tanpa body scroll lock permanen;
- menu `Lainnya` tidak boleh menduplikasi `Tambah transaksi`; route `/rekonsiliasi` harus tersedia di kelompok Kontrol saldo dan form hanya muncul berdasarkan capability backend;
- default metode pembayaran transaksi harus kosong, bukan nilai `transfer` tersembunyi; selector rekening utama harus memakai formatter provider/nama/pemilik yang konsisten;
- manual device QA composer transaksi mobile pada 320/360/390/430px wajib memeriksa empat pilihan jenis transaksi tanpa wrapper ikon ganda, field nominal menyatu dan tidak overflow, selector rekening sumber langsung tampil tanpa Search/Lihat semua, rekening sumber Rp0 tersaring sesuai jenis transaksi, dan opsi Auto-debit tidak tersedia untuk transaksi manual baru;
- login desktop wajib memilih artwork approved light/dark berdasarkan theme dan mempertahankan rasio 1672×941; panel auth desktop mengikuti visual login mobile dengan logo Saldo Bersama, copy ringkas, security hints, serta tombol HTML branded Google yang sama. Login mobile ≤820px wajib memiliki tepat empat halaman (tiga onboarding + login khusus), tiga onboarding memakai hero card clean dengan aset transparan terpisah, tanpa pill fitur di bawah deskripsi, tidak meniban area copy, serta muat satu layar tanpa scroll vertikal internal pada viewport mobile yang didukung. Desktop dan halaman login mobile tidak merender tombol/iframe Google Identity Services. Production canonical wajib membuat tombol siap melalui transport server OAuth ringan tanpa mengimpor Firebase browser Auth; localhost/device emulation boleh lazy-load Firebase popup fallback. Setelah onboarding pernah mencapai slide login, refresh/kunjungan berikutnya pada perangkat yang sama langsung membuka login, kontrol `Ulang` tetap dapat membuka onboarding, dan storage hanya berisi flag presentasional. Slide tidak aktif tidak boleh memiliki Google button/retry focusable dan artwork onboarding tidak boleh dimuat sebelum slide aktif. Manual device QA memeriksa tombol branded tunggal, target sentuh minimum 44px, desktop alignment, satu-layar pada viewport mobile relevan, swipe/keyboard, creator link, theme toggle, reduced motion, returning-user path, replay onboarding, dan round-trip auth pada perangkat nyata;
- resource enabled pada initial `idle` wajib dipresentasikan sebagai loading agar page tidak berkedip dari konten kosong ke loading screen;
- gzip bundle dan source archive tetap di bawah budget.

## Definition of Done human-error guard

Perubahan write baru belum boleh dianggap selesai bila belum membuktikan:

1. satu intent logis menghasilkan satu idempotency key sampai hasil definitif;
2. double-click/Enter berulang tidak membuat mutation kedua;
3. network putus setelah request dikirim menghasilkan `OUTCOME_UNKNOWN`, bukan pesan “gagal menyimpan” yang mendorong intent baru;
4. retry payload + `rowVersion` yang sama memakai key yang sama;
5. selama outcome belum definitif, payload berbeda untuk action yang sama tidak boleh dikirim sebagai intent baru secara diam-diam; form kritis mengunci field dan menawarkan retry data yang sama;
6. same-key concurrent external action tidak menjalankan side effect dua kali; `restore.apply` tetap memiliki reservation setelah snapshot mengembalikan tabel idempotency;
7. refresh read-model yang gagal setelah server success hanya menjadi refresh warning;
8. destructive action memiliki local reentrancy lock + backend idempotency;
9. human error dipulihkan melalui cancel/archive/restore/reverse, termasuk Alokasi Dana/Target/Jadwal Rutin/Kebutuhan, bukan hard delete atau SQL manual;
10. role/ownership/row-version/audit tetap diperiksa backend;
11. unit/service, guard regression, source validation, build budget, dan clean archive tetap hijau.

## Manual

Uji dua browser/perangkat dengan Administrator dan Member:

1. Login/logout dan redirect route; uji dari sesi bersih, pastikan login/logout berhasil tanpa reload dan tidak muncul error parser seperti `i.json is not a function`.
2. Edit record yang sama untuk memastikan 409 conflict jelas.
3. Ulangi smoke manusia: double-click/Enter spam/retry pada koneksi lambat dan pastikan hasil sama dengan automated guard suite (satu intent/satu mutation).
4. Putus jaringan sebelum write; UI harus menolak tanpa menyatakan sukses.
5. Install PWA iPhone/Android dan update app shell. Aktifkan Push pada HTTPS, pastikan verifikasi otomatis muncul, lalu periksa panel sistem. Uji dua perangkat saat satu delivery gagal sementara dan pastikan perangkat sukses tidak menerima duplikat. Pada Safari iPhone pastikan aplikasi dibuka dari Home Screen, fokus input tidak memicu auto-zoom, modal tidak bergeser horizontal, dan scroll vertikal tetap bekerja.
6. Sinkronisasi Sheets dan Calendar, termasuk failure/retry.
7. Export Excel dan periksa formula-like input.
8. Backup/restore drill pada salinan terisolasi sementara; jangan gunakan database aktif. Untuk database Development yang terikat `development`, uji **Reset data testing** hanya ketika seluruh data pada preview memang trial/error; pastikan backend `reset.preview`/`reset.apply` menolak `production` dan `unbound` **sebelum** safety backup atau purge, sementara `reset.status` tetap dapat dibaca untuk recovery; jangan menjalankan skenario destructive ini pada Production: uji preset aktivitas dan preset aktivitas + nolkan saldo; pastikan `initial_balance` menjadi 0, `initial_balance_date` canonical, `row_version` naik, dan stale account state membatalkan apply. Selain itu, pastikan financial + operational count tampil, queue rebuild sistem tidak salah dihitung/dihapus, stale fingerprint ditolak, Google Drive preflight dan safety backup terverifikasi, master/audit tetap ada, rebuild integrasi terantre, outcome unknown dapat direkonsiliasi lewat `reset.status` setelah reload, dan maintenance hanya dapat dibuka kembali setelah integrity check lulus + audit `maintenance.recover`.
9. Verifikasi scheduled housekeeping menghapus `idempotency_keys`, `import_previews`, dan `restore_previews` yang expired, tetapi mempertahankan preview berstatus `applying`, ledger, audit, backup, dan master.
10. Responsive, keyboard, focus, contrast, loading/empty/error/unauthorized/maintenance. Audit seluruh CSS untuk custom property yang tidak terdefinisi, native control di bawah 16px, duplicate media query dalam file yang sama, dan endpoint gradient yang gagal kontras.
11. Full axe scan, visual comparison, dan Chrome/Firefox/Safari device coverage dilakukan manual untuk perubahan UI yang relevan.
12. Form transaksi harus membersihkan pesan error field yang sudah diperbaiki tanpa menunggu submit ulang, tetapi tidak menghapus error field lain yang masih invalid. Perubahan sumber wajib membuang destination transfer yang tidak lagi representable; cost-sharing dan auto Alokasi juga harus merekonsiliasi error terkait.
13. Setelah `reconciliations.create` mendapat hasil definitif, form dikunci sebagai completed; Selesai/X/Escape keluar ke Beranda dan mismatch menyediakan CTA ke transaksi rekening. UI tidak boleh kembali langsung ke form yang dapat membuat intent reconciliation kedua.
14. Usability benchmark privat dilakukan dengan dua pengguna aktual tanpa third-party analytics/tracker. Ukur dari saat UI siap dipakai: expense biasa dan income biasa ditargetkan selesai sekitar ≤10 detik setelah composer terbuka, transfer tidak salah sumber/tujuan, transaksi yang belum dialokasikan dapat ditemukan dan ditindak tanpa mencari-cari kontrol, rekonsiliasi dipahami sebagai perbandingan saldo sistem vs aktual, dan Dashboard dapat menjawab kondisi uang/perhatian/tindakan utama dalam beberapa detik. Catat durasi, jumlah tap, salah input, dan titik kebingungan tanpa merekam nominal, deskripsi transaksi, email, token, atau data finansial lain.
15. Performance lab pada production build/host representative mengukur LCP ≤2.5 s, INP ≤200 ms, dan CLS ≤0.1 untuk login, first Dashboard render, membuka composer transaksi, dan Laporan. Build budget tetap gate source canonical; Web Vitals lab adalah evidence UX tambahan dan tidak boleh dicapai dengan menurunkan fitur keamanan, menunda status finansial penting, atau menaikkan threshold budget.

Tidak boleh mengklaim production-ready hanya berdasarkan unit test; real resource integration dan migration parity wajib lulus.



## Product-control alignment

Perubahan sistem pengendali uang bersama wajib mencakup skenario berikut:

- filter transaksi berdasarkan rekening, kategori, dan pencatat tetap mengikuti projection personal/shared backend;
- regression saldo wajib membandingkan aggregate SQL `visibleAccounts()` dengan `accountBalanceAsOf()` pada fixture income, expense, refund, transfer, adjustment, inactive transaction, initial-balance date, dan beberapa cutoff date; perubahan semantik `transactionImpact()` wajib menjaga parity ini;
- laporan tren 3, 6, dan 12 bulan tidak menghitung transfer sebagai pemasukan atau pengeluaran;
- `/perencanaan/kantong` mengelola Alokasi Dana dan Kebutuhan nested dengan idempotency serta `row_version`; Kebutuhan yang terhubung Alokasi Dana hanya menghitung transaksi dari `envelope_rule_id` yang sama; `/anggaran` hanya merangkum seluruh Kebutuhan tanpa mutation; `/laporan` hanya menampilkan analisis Kebutuhan vs aktual tanpa mutation;
- member dan periode historis melihat Kebutuhan sesuai capability existing, sedangkan mutation lifecycle tetap mengikuti role/periode canonical;
- breakdown per pencatat diberi label aktivitas pencatatan, bukan kontribusi finansial;
- breakdown rekening, kategori, dan nature hanya memakai transaksi aktif yang terlihat oleh actor;
- peringatan Kebutuhan dan Alokasi Dana muncul pada threshold, tidak menggandakan notifikasi, dan tidak membocorkan scope personal;
- target dengan tanggal selesai menghitung sisa, kebutuhan setoran bulanan, dan status pace secara deterministik;
- rekonsiliasi berbeda atau terlalu lama menghasilkan peringatan tanpa membuat adjustment otomatis;
- notification queue memakai dedupe key stabil, delivery dicatat per subscription, dan retry hanya mengulang perangkat yang gagal;
- setiap `REQ-*` dalam product requirements tercatat pada implementation matrix;
- setiap gap yang membutuhkan schema baru memiliki RFC `Proposed` sebelum migration atau API baru dibuat.

Fitur yang masih planned seperti receipt terhubung, utang/piutang, category hierarchy, goal stages, privacy granular lanjutan, payer/beneficiary/settlement, dan kontribusi aktual tidak boleh dianggap implemented hanya karena RFC tersedia. Pembagian beban biaya expense shared serta hak Member untuk planning `shared` sudah memiliki implementasi MVP dan harus diuji sesuai kontrak runtime, bukan lagi diperlakukan sebagai RFC-only.

## Authenticated desktop/mobile capability parity

Manual capability QA memakai akun/fixture aman Administrator dan Member pada environment testing. Cakupan minimum:

- seluruh route `/`, `/transaksi`, `/perencanaan/kantong`, `/perencanaan/jadwal`, `/anggaran`, `/target`, `/laporan`, `/rekening`, `/rekonsiliasi`, `/kategori`, `/pengaturan`, dan nested route Pengaturan dapat dirender pada mobile; `/anggaran` merender overview read-only, sedangkan route legacy `/alokasi` dan `/tagihan` harus redirect ke workspace Perencanaan tanpa error;
- heading utama, navigation landmark, route aktif, dan error state tetap benar;
- dashboard mobile membawa batas aman harian, dana belum dialokasikan, rekening, arus kas, ringkasan alokasi agregat, seluruh peringatan melalui progressive disclosure, privacy nominal, lima transaksi terbaru, serta detail transaksi; urutan presentation canonical setelah hero adalah Perlu perhatian → quick actions → transaksi terbaru → Alokasi Dana → arus kas → rekening → insight, sehingga status/perhatian/tindakan/aktivitas muncul sebelum detail pasif. Shortcut utama harus tetap `Pemasukan`, `Pengeluaran`, dan `Transfer`, transfer baru pada viewport mobile harus memakai `TransactionForm` canonical dengan presentasi `mobile-transfer`, dan filter/search lengkap tetap canonical di `/transaksi` karena `dashboard.overview` hanya membawa recent slice;
- dashboard desktop menampilkan kartu rekening aktual yang dapat dipilih, transaksi rekening terpilih, filter kategori/jenis/pencarian, privacy nominal, statistik global yang tidak salah diklaim sebagai statistik rekening, KPI arus kas, anggaran, tagihan, target, dan insight;
- `/laporan` mobile ≤820px menampilkan mode `Ringkasan` dan `Per kategori`, navigasi periode, pilihan tren 3/6/12 bulan, chart pengeluaran, KPI arus kas/total saldo/saldo aman, perbandingan bulan sebelumnya, kategori terbesar, alert actionable, anggaran vs aktual, serta rincian rekening/nature/pencatat tanpa mutation;
- perubahan periode mobile tidak boleh maju melewati bulan berjalan; kategori memakai ikon katalog canonical dan seluruh nominal berasal dari `reports.monthly` atau derivasi deterministik `trend.items`, bukan dari page slice;
- menu `Lainnya` aktif dengan `aria-current="page"` pada route sekunder;
- menu `Lainnya` tidak memuat quick-add duplikat dan menampilkan link Rekonsiliasi pada kelompok Kontrol saldo;
- grup mobile harus berurutan Perencanaan, Data keuangan, Kontrol saldo, dan Aplikasi; grup Perencanaan memuat `Perencanaan`, `Anggaran`, dan `Target`; workspace mempunyai tab `Alokasi Dana` serta `Jadwal Rutin`;
- Administrator dan Member memakai route yang sama, sementara kontrol write tetap mengikuti authorization data/API;
- viewport tidak overflow horizontal dan business form tidak diduplikasi per perangkat.

Viewport regression minimum:

```text
360×800
390×844
412×915
768×1024
820×1180
821×1180
900×1000
940×1000
941×1000
1024×768
1440×900
```

Batas 820/821 dan 940/941 wajib dijaga karena merupakan transisi navigasi mobile serta kontrol sesi desktop. Pada setiap ukuran, setidaknya satu jalur logout harus tersedia melalui header desktop atau menu mobile.
Untuk modal/bottom sheet yang mendukung gesture, regression tambahan wajib mencakup 767, 768, 769, 820, dan 821 CSS pixel: gesture mobile tetap aktif sampai 820 dan nonaktif mulai 821.

## Rekening, rekonsiliasi, dan kategori — responsive financial card

- Administrator mobile dan desktop melihat aksi `Tambah rekening` pada route Rekening dan `Tambah kategori` pada route Kategori.
- Manual QA `/rekening` memeriksa stack mobile setelah konten lazy terlihat sebelum menilai `Tambah rekening`, label `Pribadi · <pemilik>`, gesture, atau capability lain.
- Member dapat melihat rekening/kategori tetapi tidak memperoleh aksi create/edit/archive Administrator.
- Dialog rekening dan kategori terpisah serta memakai form domain yang sama pada desktop/mobile tanpa tab lintas domain.
- Stack kartu mobile memakai swipe vertikal pada kartu aktif. Container memakai `touch-action: pan-y pinch-zoom`, kartu aktif memakai `touch-action: pan-x pinch-zoom`, gesture horizontal tidak mengganti rekening, dan area kosong stack tetap menggulir halaman.
- Tombol `Daftar rekening` harus membuka daftar rekening aktif. Rekening mobile memakai quick action `Transfer` yang membuka form transfer canonical; `Riwayat` dan `Grafik` tetap menjadi tab informasi, sedangkan Jadwal rutin dan Rekonsiliasi berada pada route masing-masing.
- Kartu generic harus flat tanpa gradient; ringkasan rekening dan quick action tidak boleh membentuk card/panel tambahan.
- Scrollbar visual mobile boleh disembunyikan, tetapi `overflow-y` tidak boleh dikunci dan konten paling bawah harus tetap dapat dicapai.
- Kontrol form memakai font 16px tanpa menonaktifkan zoom viewport.
- Route `/rekonsiliasi` menampilkan form hanya untuk rekening `can_reconcile`, mengirim idempotency key, mencatat selisih tanpa adjustment otomatis, dan tetap mengandalkan authorization backend.
- Rekening desktop/mobile/detail dan selector finansial relevan wajib membedakan saldo fisik, dana dalam Alokasi Dana, dan dana tersedia; Alokasi Dana tidak boleh dipresentasikan sebagai uang tambahan di atas saldo rekening.
- Template BCA, BNI, BTN, Mandiri, dan Permata berasal dari `accounts.bank_template`; mengganti template tidak boleh mengubah nama rekening. Object legacy tanpa field boleh memakai suffix nama hanya sebagai fallback visual.
- Asset base bank memuat logo dan chip hanya satu kali; komponen tidak merender wordmark atau chip HTML yang menumpuk di atas asset.
- Nomor rekening bank 6–34 digit divalidasi backend, ditampilkan hanya pada rekening yang lolos scope authorization, dapat disalin dari detail, dan audit hanya menyimpan empat digit terakhir. Nomor kartu debit, PIN, CVV, masa berlaku, serta identifier internal tetap tidak boleh berada pada asset/DOM.
- Create bank tanpa nomor, karakter non-digit yang tidak diizinkan, account number terlalu pendek/panjang, dan constraint database harus ditolak.
- Asset BCA/BNI/BTN/Mandiri/Permata, ShopeePay/DANA/GoPay/OVO/LinkAja, Tunai, dan Tabungan harus tepat 1024×645, maksimal 100 KB, dan memakai rasio CSS 1.586:1 pada list, detail, preview, desktop, serta mobile. Lima asset bank wajib mempertahankan alpha/transparansi di luar siluet kartu agar tidak membawa background kotak saat ditumpuk atau ditampilkan di atas surface tema.
- Provider E-wallet canonical berasal dari `accounts.ewallet_template` (`generic`, `shopeepay`, `dana`, `gopay`, `ovo`, `linkaja`). Deteksi nama hanya boleh dipakai untuk object/backup legacy tanpa field tersebut; nilai `generic` yang tersimpan tidak boleh dioverride oleh inferensi nama. Provider tidak boleh memengaruhi authorization/business logic dan E-wallet lain wajib tetap aman pada fallback generic.
- `accounts.update` wajib menolak perubahan `account_type` walaupun dikirim langsung oleh client; jenis hanya ditentukan saat create, sehingga template/provider tidak dapat dipakai untuk menyamarkan perubahan jenis rekening setelah rekening memiliki histori.
- Setelah create/update/archive rekening atau kategori, daftar aktif dan dashboard diperbarui tanpa refresh manual.
- Setelah rekonsiliasi, riwayat dan alert/dashboard diperbarui.
- Submit transaksi baru dan rekonsiliasi wajib tidak menduplikasi GlobalProcessIndicator/toast setelah write sukses. `transactions.create` dan `reconciliations.create` menggunakan feedback lokal; transaction create menampilkan `FinancialSuccessOverlay`, sedangkan rekonsiliasi baru menampilkan overlay setelah fase refresh read-model selesai.
- `FinancialSuccessOverlay` wajib dipakai untuk Pengeluaran, Pemasukan, Transfer, Refund, dan rekonsiliasi matched. Uji logo aplikasi, badge ceklis animasi, MoneyRain, ringkasan kontekstual, aksi sekunder, tidak adanya tombol X pada success result, focus trap, Escape, safe-area mobile, serta `prefers-reduced-motion`.
- Rekonsiliasi difference tetap memakai hasil warning tanpa money rain dan boleh menyediakan tombol tutup eksplisit. Refresh read-model yang gagal setelah write success tidak boleh mengubah outcome write menjadi gagal; UI harus menyatakan bahwa server sudah menyimpan tetapi tampilan mungkin perlu dimuat ulang.
- Viewport 360, 390, 820/821, 940/941, dan 1440 tidak overflow horizontal.
- Controlled input pada Modal harus dapat menerima beberapa karakter berurutan tanpa fokus berpindah ke tombol tutup; Escape, Tab/Shift+Tab, body scroll lock, dan focus restoration tetap diuji.
- Saat Modal mutation kritis memakai `dismissible=false`, tombol X harus disabled, Escape/backdrop/swipe tidak menutup dialog, tetapi Tab/Shift+Tab dan focus trap tetap berfungsi.
- Loading di dalam shell tidak boleh merender nested `main`; loading panel/inline tidak boleh mengambil tinggi satu viewport. Empty/error inline harus tetap compact pada mobile.
- Migration v5 menerima enum template bank valid, migration v6 menambah delivery Web Push per subscription, migration v7 menambah notification preference actor-scoped, dan migration v8 menambah `ewallet_template` additive. Migration v9 menambah `envelope_rules.assignee_user_id` additive, migration v10 menambah `manual_reminders`, dan migration v11 menambah `transactions.cost_share_mode` + `cost_share_json`; migration v12 menambah session/environment dan migration v13 menambah durable rate-limit bucket; restore runtime v14 tetap menerima backup schema v3-v13; field additive yang belum ada dinormalisasi secara aman, session registry tidak dipulihkan, dan preference default aktif dipertahankan untuk backup lama.
- Alokasi assigned harus memisahkan `assignee_user_id` dari ownership ledger: Member hanya dapat memakai/memindahkan Jatah Bersama atau jatah sendiri, rekening personal mengunci penerima ke pemilik rekening, notifikasi assigned hanya menuju penerima, dan penonaktifan user diblok bila masih ada jatah aktif.
- Budget personal harus dihitung hanya dari transaksi personal user terkait, tidak boleh dipakai sebagai substitusi jatah per orang dari rekening Bersama, dan user dengan Budget personal aktif tidak dapat dinonaktifkan.
- Sidebar melengkung harus tetap terlihat, target sentuh minimal 44px, submenu minimal dapat ditutup, dan menu mobile tidak menduplikasi theme toggle.

## Regression rekening transparan dan capability mobile

- Member harus menerima seluruh rekening shared/personal beserta `owner_name`; rekening personal pasangan wajib `read_only=true`, `can_transact=false`, dan `can_reconcile=false`.
- Member harus dapat membaca transaksi pasangan untuk menelusuri saldo, tetapi update/cancel hanya boleh untuk transaksi sendiri pada scope operable; transaksi legacy pada rekening personal pasangan tetap harus ditolak.
- `totalBalance` harus mencakup semua rekening readable, sedangkan `safeToSpend`, `dailySafeToSpend`, `unallocatedFunds`, dan `unallocatedCount` hanya boleh memakai rekening/scope operable actor.
- Lifecycle finansial end-to-end backend harus menguji income → dana tersedia → tambah dana ke Alokasi Dana existing → expense dengan Alokasi Dana → Kebutuhan → release sisa → setor Target → rekonsiliasi, termasuk bukti bahwa adjust alokasi tidak mengubah saldo ledger.
- Penutupan Alokasi Dana wajib menguji `unallocated` dengan sisa dan tanpa sisa, `carry` dengan sisa dan Rp0, serta memastikan rule aktif selalu memiliki periode aktif berikutnya. Periode `unallocated` berikutnya harus mulai Rp0; `carry` hanya boleh membawa sisa aktual dan tidak boleh menciptakan uang baru.
- `reuse_needs=true` wajib menguji copy Kebutuhan aktif ke bulan berikutnya, skip saat identitas target sudah ada, tidak memulihkan atau menimpa target secara diam-diam, dan tidak menyalin transaksi, saldo, pemakaian, atau dana Alokasi. `reuse_needs=false` tidak boleh membuat Kebutuhan baru.
- Status Kebutuhan pada detail Alokasi Dana dan overview Anggaran wajib memakai presentation contract yang sama untuk `Aman`, `Pemakaian cepat`, `Hampir habis`, `Anggaran habis`, dan `Melebihi anggaran`.
- Shared planning Member harus diuji positif untuk Alokasi Dana/adjustment/Kebutuhan/Target/Jadwal Rutin shared. Alokasi Dana, Kebutuhan, dan Jadwal Rutin juga wajib diuji positif pada rekening/scope personal milik Member sendiri dan negatif untuk personal pengguna lain; Target baru tetap wajib memakai rekening Bersama, sedangkan lifecycle destruktif/recovery yang dikontrak Administrator-only tetap negatif untuk Member.
- Cost sharing schema v11 harus menguji `unspecified`, `equal`, `percentage`, total 100%, rounding integer deterministik, edit nominal, report aggregation, audit, integrity, backup/restore, dan bahwa split tidak mengubah saldo di luar expense canonical. Regression juga wajib membuktikan participant/basis snapshot transaksi lama tetap stabil ketika roster user berubah dan pembayaran occurrence Jadwal Rutin shared memakai kontrak split yang sama.
- Dashboard wajib membedakan `unallocatedFunds` dari `unallocatedExpenseAmount`/`unallocatedCount`; free funds harus tetap tampil walau jumlah expense tanpa Alokasi Dana nol.
- Label pemilik wajib konsisten pada filter transaksi, account breakdown, reconciliation history, dan reconciliation alert.
- `reconciliations.list` bersifat readable; `reconciliations.create` tetap operable. Negative authorization test wajib memakai request langsung ke service, bukan hanya tombol tersembunyi.
- Form transaksi hanya menawarkan rekening sumber dengan `can_transact !== false`; rekening tujuan transfer boleh rekening aktif/readable lain. Backend wajib tetap menolak rekening personal pasangan sebagai source/debit Member.
- Transfer personal Member → personal pasangan harus berhasil sebagai satu ledger canonical dengan `scope`/`owner_user_id` mengikuti rekening sumber Member. Transfer shared → personal oleh Member harus tetap `TRANSFER_APPROVAL_REQUIRED` dan tidak mengubah saldo sebelum approval Administrator.
- Member harus dapat membuat/mengubah Alokasi Dana dan Jadwal Rutin pada rekening personal miliknya sendiri, tetapi tidak pada rekening personal pasangan. Target baru oleh role mana pun tetap wajib rekening Bersama.
- Read-model planning harus mengirim capability action-specific dari backend: Alokasi menghormati ownership + `assignee_user_id`, Kebutuhan linked mengikuti capability Alokasi, Jadwal Rutin personal pasangan tidak boleh mengekspos pay/edit/reminder, dan reverse occurrence harus memakai transaction ID yang benar-benar operable actor. Frontend tidak boleh menghitung ulang authorization dari `role/scope/owner_user_id`.
- Dashboard `overview.envelopes` wajib memakai resolver capability Alokasi canonical yang sama dengan `envelopes.list`; setup checklist dan pilihan Alokasi untuk transaksi/Jadwal Rutin tidak boleh menghitung assignee authorization sendiri di frontend.
- `app.initialState`/bootstrap wajib membawa route transfer server-side untuk pasangan rekening aktif/readable (`direct` atau `approval_required`); frontend tidak boleh menentukan approval transfer dari kombinasi role/scope sendiri. Backend mutation tetap membaca ulang rekening dan menegakkan guard canonical.
- Capability Target `can_withdraw` wajib false bila actor tidak memiliki rekening tujuan lain yang valid untuk transfer langsung; UI tidak boleh menawarkan modal penarikan tanpa destination yang dapat dipilih.
- Dashboard mobile harus memakai route canonical `/anggaran`; `/perencanaan/kebutuhan` hanya compatibility redirect. Empty state planning kritis harus tetap terlihat dan hanya menawarkan CTA yang capability-nya tersedia.
- Form rekening personal Administrator dapat memilih user aktif. Saat `users.list` gagal, create harus fallback ke actor backend dan edit harus mempertahankan `owner_user_id` existing tanpa field required kosong.
- Route `/kategori` harus menyediakan tipe refund sesuai `CATEGORY_TYPES` backend. Mutation master yang sudah sukses tidak boleh dilaporkan gagal karena reload domain atau refresh dashboard/bootstrap sesudahnya gagal; UI harus mempertahankan status sukses server dan mengekspos refresh warning.
- Manual mobile QA pada viewport representatif memeriksa dua tab `/perencanaan` termasuk drill-down detail Alokasi Dana dan konfirmasi Jadwal Rutin, kedua mode mobile `/laporan` beserta pergantian periode/rentang tren dan chart tanpa overflow, nested route `/pengaturan` sesuai role, detail read-only pasangan `/rekening`, route `/kategori`, overflow horizontal modal, focus trap, Escape close, body scroll lock, dan focus restoration.
- Regression dependency UI memverifikasi setiap named import `react-icons/fi` pada `frontend/src` benar-benar tersedia pada package. `npm run build` tetap blocking karena route lazy seperti `/laporan` dapat lolos source-text/unit test tetapi gagal dimuat bila bundler menemukan named export invalid.
- Nomor rekening panjang wajib dipadatkan pada visual kartu tanpa mengubah nilai lengkap pada detail/copy.
- Boundary responsive wajib mencakup fallback sempit 340/341 dan 370/371/420/421 bila styling terkait disentuh, plus 580/581, 820/821, dan 940/941. Static test menolak dangling selector serta `.two-column-grid { display:none }`.

## Human-error protection dan data lifecycle

Regression wajib membuktikan:

- member ditolak untuk preview/apply lifecycle owner;
- rekening aktif dengan saldo awal Rp0, saldo saat ini Rp0, tanpa transaksi/dependency/reconciliation dapat dihapus owner setelah alasan, acknowledgement, exact phrase, `row_version`, dan idempotency lulus;
- transaksi cancelled tetap dianggap histori dan memblokir hard delete rekening;
- rekening dengan saldo, transaksi, Alokasi Dana, Jadwal Rutin, Target, atau rekonsiliasi tidak dapat hard delete;
- retry dengan idempotency key sama tidak menggandakan audit;
- audit delete-unused tetap ada dan nomor rekening penuh tidak dicatat;
- rekening/kategori arsip dapat dipulihkan bila duplicate/ownership/version guard lulus;
- transaksi cancelled hanya dapat dipulihkan owner pada periode terbuka, unlinked, dan dengan proyeksi saldo valid;
- user inactive hanya dapat aktif melalui `users.reactivate` dengan row version, alasan, audit, dan registry `users` canonical;
- tutup periode membutuhkan preview dan exact confirmation, lalu memvalidasi ulang integrity/unallocated transaction;
- ConfirmationModal memerlukan alasan/typed phrase/acknowledgement/countdown sesuai tingkat risiko dan mencegah submit Enter tidak sengaja;
- destructive UI tidak menghilangkan data sebelum server sukses dan menampilkan conflict secara jelas;
- generic purge tidak ada pada action registry, permission, API, atau UI.


## Build budget dan route isolation

- Jangan menaikkan limit build budget hanya untuk membuat QA hijau. Cari import sinkron, CSS global, asset legacy, atau dependency besar yang seharusnya lazy-loaded.
- Dependency provider yang hanya dibutuhkan pada aksi tertentu, seperti Firebase popup fallback development, harus berada pada lazy chunk terpisah dan tidak membengkakkan `LoginPage` route chunk. Host production canonical tidak boleh mengunduh Firebase browser Auth hanya untuk menyalakan tombol server OAuth.
- CSS shell terautentikasi tidak boleh dimuat pada route login bila tidak dibutuhkan. Shared brand/loading style tetap berada pada global primitive.
- Asset publik yang sudah tidak direferensikan source, test, manifest, atau docs wajib dihapus setelah usage scan.
- Build budget harus dijalankan setelah production build dan tetap menjadi blocking quality gate.
- Asset main JS, global CSS, atau route yang mencapai 90% batas menghasilkan warning headroom. Warning adalah trigger review static import/lazy boundary sebelum feature berikutnya, bukan alasan menaikkan threshold.
- Regression statis menjaga presentation/dialog besar Transaksi serta dialog Alokasi Dana/Kebutuhan/Jadwal Rutin tetap berada di lazy boundary yang sengaja dibuat untuk headroom.

## Maintainability, artifact hygiene, dan duplicate-report policy

- `npm-audit-YYYYMMDD.json` adalah diagnostic lokal: boleh berada sementara di working directory, wajib di-ignore Git/source validator, dan **tidak boleh** masuk clean ZIP. Validator dan packager memakai policy local-only yang sama.
- `cache.js` dan `client.js` wajib memakai serializer canonical yang sama agar query key dan mutation fingerprint tidak drift ketika urutan property payload berubah.
- Helper versioning mengekstrak stamp update (`row_version`/`updated_at`/`updated_by`) dan create (`row_version`/`created_*`/`updated_*`) yang benar-benar identik; ownership (`scope`, `owner_user_id`, `owner_scope`), optimistic `WHERE row_version=?`, reversal metadata, dan business transition tetap eksplisit di service domain.
- GitHub Quality menjalankan jscpd pinned `4.2.5` secara langsung dan **report-only/non-blocking**. Prioritas refactor adalah clone JavaScript/JSX yang berisiko drift; migration SQL dan CSS module deklaratif tidak dikejar hanya demi persentase.
- Feedback transient success/info/warning memakai `FeedbackProvider`; error mutation, conflict, maintenance/read-only, backup/restore/import, dan status integrasi yang perlu tetap terlihat memakai notice persisten. Generic hard undo/rollback tidak tersedia; reversal finansial tetap action domain audited.
- Recurring occurrence mutation wajib enqueue Calendar dengan `recurring_occurrence:<occurrence_id>` dan mirror recurring melalui `<recurring_rule_id>`; pay/reverse/skip/restore harus memakai identitas sinkronisasi yang sama.

## Modal, Kategori, dan route Pengaturan

- Ukur `scrollWidth <= clientWidth + 1` pada dialog dan `.modal__body` untuk Tambah Transaksi, Tambah/Edit Kategori, Rekening, Import, Restore, serta konfirmasi periode pada 320, 360, 390, 414, dan 430px.
- Pastikan `.modal__body` memakai `overflow-x: hidden`, `overflow-y: auto`, dan indikator scrollbar mobile tersembunyi tanpa body scroll lock permanen.
- Transaksi mobile memakai history-first: periode + grafik ringkas di atas, type chips horizontal yang terkendali, Search/Filter sebagai icon control, dan advanced filter memakai type selector compact plus baris native-select untuk Alokasi Dana, rekening, kategori, dan pencatat. Pengembalian serta Penyesuaian tetap dapat dipilih. Tidak ada nested horizontal scroll pada content; horizontal scroll hanya untuk chip filter cepat yang memang bounded.
- Verifikasi `/transaksi` mobile pada 320/360/390/414/430px: heading route tidak diduplikasi di body; bulan previous/next bekerja sampai bulan berjalan; report-summary failure tidak memblokir ledger; filter common + advanced mempertahankan query canonical; judul tanpa description memakai kategori/merchant/jenis sebagai fallback tanpa `Tanpa keterangan`; metadata nama pencatat lengkap dapat wrap tanpa mendorong nominal keluar viewport; cancelled/managed/unallocated badge tetap stabil; detail modal tetap scrollable dan lifecycle action tetap capability-driven.
- `categories.create` menormalkan non-pengeluaran tanpa nature eksplisit menjadi `other`, menolak nature pengeluaran pada income/refund, serta menolak kategori expense baru dengan nature `savings`.
- Data legacy `savings` tetap dapat dibaca dan diubah menuju klasifikasi baru tanpa migration diam-diam.
- `/pengaturan` hanya memuat `system.health`; setiap nested route memuat resource sendiri dan menampilkan result/error dekat tindakan.
- Administrator-only deep link tetap menampilkan guard frontend dan wajib ditolak backend bila request dipaksakan oleh member.

## Web Push desktop dan mobile

- `system.health` pada Pengaturan wajib memakai `status`, `schemaVersion`, dan `maintenanceMode`; test menolak akses `database` serta `schema.ready` pada response action tersebut.
- Schema Production harus versi 14 dan `npm run db:integrity -- production` harus lulus sebelum register subscription.
- `npm run env:check` wajib memvalidasi pasangan `VITE_VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` serta format `VAPID_SUBJECT`.
- Bootstrap Development interaktif wajib menarik ulang Vercel Development walaupun `.env.local` lama terlihat lengkap; hasil pull mengganti file hanya setelah sembilan core + Web Push lolos validasi.
- Mode non-interaktif tidak membuka login/network bootstrap dan hanya menerima `.env.local` yang sudah valid.
- `npm run env:push:development -- --settings-only` wajib menyinkronkan Web Push dan Google bridge yang aktif tanpa menyentuh core environment.
- Setelah `npm run env:push:production`, deployment Production baru wajib dibuat. Bundle lama tidak boleh dianggap menggunakan key baru.
- `npm run dev` wajib fail-closed sebelum membuka localhost bila Vercel Development memiliki `DATABASE_ENVIRONMENT` selain `development`, Turso Development tidak reachable, schema bukan v14, atau binding database bukan Development.
- `.env.local` tidak boleh memuat `GOOGLE_OAUTH_CLIENT_SECRET`; setiap workstation tepercaya mempunyai `.env.production.local`. `npm run dev` tidak boleh membuat atau mengubah `.env.production.local`, sedangkan `npm run prod` tidak boleh pull/menimpa `.env.local` dan wajib menolak database host/token Turso, `SESSION_SECRET`, atau VAPID yang sama dengan Development dan melakukan check Production read-only sebelum membuka Vercel.
- Operasi database harus profile-aware: `db:migrate`, `db:bind-environment`, dan `db:integrity` default ke `.env.local` Development; target `production` wajib membaca `.env.production.local`, dan migration harus menolak binding existing lintas-environment sebelum mutation.
- `npm run prod:check` dan `npm run prod` wajib memverifikasi core Production + frontend shell canonical. `/api/health` hanya memblokir core availability untuk database/schema/binding, maintenance, dan integrity failure; scheduler, Google integration, backup, atau notification degradation tetap tersedia pada authenticated operational health sebagai warning. Bila live aggregate lama/edge case masih degraded sementara core Production lokal sehat, tooling harus mengeluarkan diagnosis metadata-safe dan boleh membuka frontend dengan warning tanpa menyarankan migration ulang.
- Desktop Chrome/Edge dan Android Chrome: Aktifkan, izin granted, register server, verifikasi otomatis, click membuka `/pengaturan/notifikasi`, Nonaktifkan, dan register ulang.
- iPhone/iPad: tab Safari harus menampilkan instruksi Home Screen; aplikasi standalone iOS/iPadOS yang mendukung harus dapat meminta izin melalui ketukan tile dan menerima verifikasi otomatis.
- Dua perangkat pada akun yang sama harus memiliki subscription terpisah. Retry perangkat gagal tidak boleh mengirim ulang ke perangkat yang sudah sukses.
- Subscription 404/410 harus dinonaktifkan. Endpoint lokal/private harus ditolak. Queue server boleh menyimpan copy server-generated, tetapi payload Web Push normal hanya boleh membawa `notificationType`, `targetPath`, dan `notificationId`; nominal, nama rekening, merchant, serta nama objek finansial tidak boleh keluar ke lock screen. Test Push tetap generik. QA perangkat nyata wajib memverifikasi copy generik pada Android/iOS/desktop.
- Apps Script hanya memiliki satu trigger `runScheduledJobs`, secret scheduler sama dengan Vercel, dan `/api/jobs` berhasil memproses queue tanpa menggagalkan backup ketika Push gagal. Queue failure maupun partial per-device delivery harus membuat scheduler heartbeat `degraded` agar kegagalan perangkat tidak tersembunyi oleh satu delivery yang sukses.

## Full reset

Full reset harus diuji pada database terisolasi: preview mencakup accounts/categories/ledger/operational state; users/audit/backups/integrity/idempotency/nonce anti-replay/config/schema tetap; safety backup berisi data sebelum purge; stale preview ditolak; queue rebuild canonical tidak membuat preview sesudah reset terlihat kotor; outcome unknown direkonsiliasi lewat `fullReset.status`; member ditolak; dan integrity/audit/maintenance failure menyebabkan rollback/fail-closed.

## Login Google mobile

- Desktop dan mobile memakai satu tombol HTML branded Google milik Saldo Bersama dan tidak memakai `google.accounts.id.renderButton()`. Pada production canonical, tombol menavigasi ke `/api/auth/google/start`; server membuat signed OAuth transaction state/nonce berumur singkat beserta PKCE S256 challenge, Google kembali ke `/api/auth/google/callback`, server menukar authorization code + `code_verifier` ke Google ID token lalu ke Firebase ID token melalui Identity Toolkit, dan verifier Firebase + registry `users` canonical membuat registered server session. Localhost/device emulation memakai `signInWithPopup` + in-memory persistence sebagai fallback development. Backend session tetap menjadi authority.
- Tombol disabled selama auth/session diproses, mencegah double-submit, dan menampilkan error ramah tanpa raw provider error. Production tidak memakai Firebase browser redirect state. Server callback wajib memverifikasi signed `state`, `nonce`, PKCE, audience/issuer/expiry binding, tidak menyimpan Google access/refresh token, menolak open redirect, dan hanya membuat session setelah Firebase ID token diverifikasi serta status/role/binding registry `users` backend lolos. `VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com` tetap public config untuk popup development/compatibility; OAuth redirect URI production wajib `https://saldo-bersama.vercel.app/api/auth/google/callback` dan `GOOGLE_OAUTH_CLIENT_SECRET` wajib Production Sensitive.
- Network, unauthorized-domain, web-storage, provider error, dan redirect-result-missing tetap kembali ke halaman login dengan copy aman dan dapat dicoba ulang. Progress bar, counter langkah, serta tombol back visual tidak tampil pada seluruh flow mobile.
- Desktop dan mobile memakai tombol HTML branded yang sama. Production memakai server OAuth callback, localhost/device emulation memakai Firebase popup. Backend registry `users`, role/status, binding UID, dan verifikasi Firebase ID token tetap source of truth.
- Regression frontend wajib membuktikan production routing module tidak mengimpor `@firebase/*`, local popup module tidak memegang production redirect, `returnTo` menolak external/protocol-relative/backslash path, onboarding preference tetap fail-safe saat localStorage diblokir, dan inactive carousel slide tidak merender kontrol auth focusable.
- Production manual QA wajib memastikan `saldo-bersama.vercel.app` ada di Firebase Authorized Domains, Google provider aktif, OAuth Web Client memuat `https://saldo-bersama.vercel.app/api/auth/google/callback`, dan `GOOGLE_OAUTH_CLIENT_SECRET` tersedia pada Vercel Production Sensitive, lalu menguji round-trip pada Android Chrome dan iPhone Safari/Home Screen bila tersedia. Responsive emulation desktop tidak dianggap bukti real-device karena localhost tetap menggunakan popup fallback. Evidence Vercel yang diharapkan: `session.oauth.start` → callback `session.login` dengan `flow=google-oauth-server` status 200 → `GET /api/session` 200; production desktop/mobile tidak lagi mengandalkan client `POST /api/session`.

## Hardening v14 tambahan

- Local process limiter dan durable cross-instance rate limit memakai key hash+scope yang sama; gateway, export, login, serta OAuth valid harus menolak request di atas limit tanpa menjadikan client sebagai authority.
- Bucket expired dibersihkan housekeeping, tidak masuk logical backup, dan controlled restore menghapus state throttle lama.
- `system.health` menjadi degraded untuk unresolved integration dead-letter, notification queue dead-letter yang masih actionable, per-device Push dead-letter yang belum diikuti keberhasilan lebih baru, backup terbaru gagal, atau integrity run terbaru gagal tanpa mengekspos payload finansial, notification title/body, error message mentah, maupun resource ID. Public `/api/health` hanya ikut degraded untuk core blocker: database/schema/binding tidak siap, maintenance aktif, atau integrity failure. Dead-letter/backup/scheduler warning tidak boleh mematikan core availability dan histori failure yang sudah dipulihkan tidak boleh membuat operational health degraded selamanya.

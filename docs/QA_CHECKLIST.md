# QA Checklist

## Quality gate otomatis

```bash
npm run check
```

Catat command, exit code, dan bagian yang belum dapat dijalankan. Jangan menyatakan build/lint/test berhasil tanpa eksekusi nyata.

- [ ] `check-apps-script-syntax.mjs` memuat seluruh file dalam shared runtime pada urutan alfabet dan terbalik.
- [ ] Setelah seluruh source ditempel, dropdown editor menampilkan `setupSaldoBersama`, `doGet`, dan `doPost` tanpa startup error.
- [ ] Setup memperoleh lock, menghasilkan `SETUP_STATUS=ready`, dan hanya selesai setelah schema tervalidasi.
- [ ] Setup parsial menghasilkan `SETUP_STATUS=failed`; deployment dihentikan sampai root cause selesai.
- [ ] Spreadsheet baru menghasilkan schema version 2 dan menghapus `Sheet1` hanya bila kosong setelah validasi.
- [ ] Spreadsheet v1 menjalankan preview migration dan semua nilai `ambiguous` harus nol.
- [ ] Migration memakai confirmation property sementara, safety backup tervalidasi, maintenance, integrity check, dan rollback fail-closed.

## Ledger dan integritas

- [ ] Nominal nol, negatif, desimal, NaN, Infinity, dan terlalu besar ditolak.
- [ ] Tanggal semu seperti 31 Februari ditolak.
- [ ] Refund memerlukan rekening tujuan dan tidak salah memerlukan rekening sumber.
- [ ] Transfer sumber=tujuan ditolak.
- [ ] Transfer tidak masuk income/expense total.
- [ ] Saldo frontend dan backend konsisten untuk income, expense, transfer, refund, dan adjustment.
- [ ] Adjustment hanya dapat dibuat owner, mempunyai alasan, dan tipe tidak dapat diubah ke/dari adjustment.
- [ ] `goal_id`, `recurring_occurrence_id`, scope, ownership, dan metadata pembuat dari client ditolak.
- [ ] Transaksi masa depan tidak memengaruhi saldo hari ini.
- [ ] Dashboard, rekonsiliasi, dan period close historis memakai cutoff akhir periode.
- [ ] Transaksi sebelum `initial_balance_date` rekening ditolak.
- [ ] Pembatalan menghitung ulang saldo dan sisa kantong.
- [ ] Rekening/kategori arsip tidak dapat dipakai untuk transaksi baru.
- [ ] Formula `= + - @` dinetralkan.
- [ ] Duplicate submit memakai idempotency key yang sama.
- [ ] Deteksi transaksi mirip tidak diam-diam membuat duplikat.
- [ ] Edit versi lama ditolak dengan conflict.
- [ ] Member hanya dapat edit/cancel transaksi miliknya sesuai policy.
- [ ] Member tidak dapat membaca rekening, transaksi, recurring, budget, goal, notification, atau laporan personal pengguna lain.
- [ ] Transfer lintas shared/personal atau personal owner berbeda ditolak.
- [ ] Scope transaksi diturunkan dari rekening dan kontradiksi client ditolak.
- [ ] Dua write bersamaan diserialisasi LockService.
- [ ] Periode tertutup dan seluruh bulan sebelumnya menolak perubahan ledger karena saldo akhir bersifat kumulatif.
- [ ] Reopen wajib dimulai dari closure paling akhir; bulan lebih lama ditolak selama closure yang lebih baru masih aktif.
- [ ] Snapshot closure mendeteksi drift saldo, cash flow, budget, envelope, recurring, dan progress goal.
- [ ] Pengeluaran tanpa kantong masuk antrean review.
- [ ] Integrity check mendeteksi ID duplikat, referensi hilang, owner hilang, dan over-allocation.

## Alokasi, budget, dan recurring

- [ ] Alokasi tidak melebihi dana belum dialokasikan.
- [ ] Kantong rekening tertentu tidak dapat memakai sisa yang sudah dikonsumsi kantong global/rumah tangga.
- [ ] Periode aturan yang sama tidak boleh overlap.
- [ ] Harian, mingguan, dua mingguan, bulanan, periode gajian, dan custom menghasilkan rentang benar.
- [ ] Sisa/rollover tidak dihitung sebagai pemasukan.
- [ ] Mutasi kantong tidak mengubah total kekayaan.
- [ ] Over-budget memerlukan alasan sesuai policy.
- [ ] Kebijakan overspend `deny`, `confirm`, `warn`, dan `owner_approval` benar-benar ditegakkan backend.
- [ ] Pembuatan rule+period envelope atomik dan tidak meninggalkan rule yatim.
- [ ] Rollover `none`, `carry`, dan `unallocated` memberi hasil yang benar.
- [ ] `recurring.list` tidak menulis data; generation action/worker memperoleh lock dan audit.
- [ ] Daily, weekly, biweekly, monthly, bimonthly, quarterly, semiannual, dan annual menghasilkan occurrence yang benar.
- [ ] Occurrence overdue dihitung dari tanggal aktual, bukan status stale.
- [ ] Pembayaran sebagian dan pelunasan terhubung ke transaksi aktual.
- [ ] Linked transaction recurring dibuat melalui jalur internal yang mengisi `recurring_occurrence_id`, tetapi field tersebut tetap ditolak dari client umum.
- [ ] Jatuh tempo pada hari terakhir bulan historis ditandai overdue/late bila belum selesai.
- [ ] Budget archived dapat diaktifkan kembali pada row yang sama dan duplicate budget aktif dideteksi.
- [ ] Goal pada rekening archived tidak dapat menerima movement baru; reverse ditolak bila transaksi linkage berada pada periode terkunci.

## Auth dan security

- [ ] Hanya akun allowlist dapat membuat session.
- [ ] `ALLOWED_USERS_JSON` menolak email invalid, role selain `owner`/`member`, dan duplikat email dengan role konflik.
- [ ] Email belum terverifikasi ditolak.
- [ ] Role Vercel dan sheet `Users` yang berbeda ditolak.
- [ ] Owner terakhir tidak dapat dinonaktifkan atau diturunkan tanpa pengganti.
- [ ] Member tidak dapat menjalankan action owner.
- [ ] Owner melihat semua; member hanya melihat shared dan rekening personal miliknya.
- [ ] Transaksi, dashboard, report, envelope, goal, recurring, dan notifikasi tidak membocorkan agregat personal user lain.
- [ ] Bootstrap owner hanya berjalan pada sistem kosong; UID binding dan initialize berada dalam lock yang sama.
- [ ] Request POST tanpa Origin ditolak.
- [ ] Origin asing ditolak.
- [ ] Cookie HttpOnly, SameSite=Strict, dan Secure pada non-development.
- [ ] Apps Script menolak HMAC salah, timestamp lama, dan nonce replay.
- [ ] Error tidak menampilkan stack trace, secret, Spreadsheet ID, atau internal path.
- [ ] Rate limit dan batas payload menghasilkan error terkontrol.

## Human error

- [ ] Preview rupiah jelas sebelum simpan.
- [ ] Saldo tidak cukup ditolak jika rekening tidak mengizinkan minus.
- [ ] Transaksi mirip memerlukan konfirmasi eksplisit.
- [ ] Over-budget memerlukan alasan.
- [ ] Pembatalan memerlukan alasan.
- [ ] Salah periode/jatah ditolak.
- [ ] Draft offline tidak mengubah saldo maupun sisa kantong.
- [ ] Tombol simpan disabled selama request.
- [ ] Retry timeout memakai idempotency key yang sama.

## Environment dan secret

- [ ] `.env.example` hanya berisi placeholder; tidak ada `.env`, token, client secret, private key, atau secret nyata di Git/ZIP.
- [ ] `VITE_` hanya digunakan untuk konfigurasi browser yang memang publik.
- [ ] `SESSION_SECRET` dan `INTERNAL_SHARED_SECRET` berbeda dan minimal 32 karakter.
- [ ] `INTERNAL_SHARED_SECRET` pada Vercel sama persis dengan Script Properties Apps Script.
- [ ] `ALLOWED_ORIGINS` berisi origin exact tanpa wildcard atau slash akhir.
- [ ] `APPS_SCRIPT_WEB_APP_URL` memakai deployment `/exec`, bukan `/dev` atau URL editor.

## Integrasi dan recovery

- [ ] Calendar event tidak duplikat dan hanya event aplikasi yang diubah.
- [ ] Calendar bersama hanya berisi recurring shared; data personal tidak disinkronkan.
- [ ] Calendar gagal tidak membatalkan transaksi.
- [ ] Push tidak menampilkan nominal/rincian sensitif.
- [ ] Push gagal tidak membatalkan pencatatan.
- [ ] Subscription invalid dapat dinonaktifkan/dibersihkan.
- [ ] Seluruh scheduled worker berhenti tanpa mutation selama maintenance/recovery.
- [ ] Backup harian dijalankan oleh trigger dan nama file unik.
- [ ] Backup berstatus verified hanya setelah schema tervalidasi.
- [ ] Import preview menampilkan invalid, duplicate, referensi hilang, dan dampak data.
- [ ] Import preview dan apply memakai validasi period lock, reserved field, serta projected sequential balance/envelope yang sama.
- [ ] Import maksimum 200 row per batch dan preview oversized ditolak sebelum cache/write.
- [ ] Import gagal melakukan rollback verified pre-import backup.
- [ ] Restore membutuhkan preview token, frasa konfirmasi, raw emergency snapshot, maintenance, dan integrity check.
- [ ] Restore tetap berhasil ketika `Backup_Log`, sheet lain, atau header aktif hilang/rusak.
- [ ] UI memperlakukan hasil integrity `{ok:false}` sebagai gagal dan menampilkan issue.
- [ ] Restore drill dilakukan pada DEV sebelum production.
- [ ] Retensi backup tidak menghapus backup manual.
- [ ] Retensi backup tidak menghapus backup `pre-migration`.

## UX, responsive, dan accessibility

- [ ] Keyboard navigation, focus trap, label, error field, kontras, dan tap target.
- [ ] Mobile 320px, 375px, tablet, laptop, dan desktop lebar.
- [ ] Loading, empty, error, offline, unauthorized, conflict, maintenance, dan stale-data state.
- [ ] Grafik memiliki ringkasan teks.
- [ ] Status tidak dibedakan hanya melalui warna.
- [ ] Data sensitif tidak muncul di URL, metadata, title, push, atau Calendar.
- [ ] Request asset JavaScript offline tidak pernah menerima fallback HTML.
- [ ] Session 401/transient error dapat kembali ke login/retry tanpa layar buntu dan destination awal dipertahankan.

## Hardening behavior tests

- [ ] Restore preview tetap berjalan ketika sheet aktif hilang.
- [ ] Backup dari household/owner lain ditolak.
- [ ] Restore schema-rusak memakai idempotency Script Properties dan key yang sama.
- [ ] Apply utama gagal selalu mencoba rollback safety.
- [ ] Rollback gagal mempertahankan maintenance dan `recovery_required`.
- [ ] Audit gagal mengompensasi create/update; compensation gagal mengunci aplikasi.
- [ ] Pembayaran recurring/mutasi goal tidak meninggalkan audit sukses prematur saat rollback.
- [ ] Linked transaction hanya dapat dibatalkan melalui modul asal.
- [ ] Export CSV/XLSX menetralkan formula dan tidak menyertakan token/subscription/idempotency internal.
- [ ] Integrity check memeriksa seluruh referensi lintas sheet dan over-allocation per rekening.
- [ ] Integrity check mendeteksi formula aktif tanpa menampilkan isi formula.
- [ ] Transaksi goal aktif wajib mempunyai tepat satu movement aktif dan linkage dua arah konsisten.
- [ ] Notification `no_subscription`/`failed` dapat diantrekan ulang setelah kondisi membaik.

## Observability dan diagnosability

- [ ] Setiap respons API memiliki `X-Request-ID`.
- [ ] UI menampilkan kode error dan referensi request tanpa stack trace.
- [ ] API dan Apps Script mencatat request ID/action/status/durasi tanpa payload finansial atau identitas lengkap.
- [ ] Logger meredaksi token, secret, signature, cookie, email, UID, payload, nominal, dan subscription.
- [ ] `npm run diagnose` tidak menampilkan nilai secret dan mendeteksi URL `/exec`, schema status, latency, serta clock skew.
- [ ] `REQUEST_EXPIRED` mengembalikan detail waktu aman dan hanya boleh retry satu kali sebelum route/mutasi.
- [ ] Retry clock calibration mempertahankan request ID, payload, dan idempotency key, tetapi memakai nonce/signature baru.
- [ ] `/api/health` menampilkan commit/deployment runtime tanpa menyatakan data bisnis sehat.
- [ ] Vercel Logs dan Apps Script Executions dapat dikorelasikan menggunakan referensi UI.

## Performance dan cache privat

- [ ] Initial load memakai maksimal satu action `app.initialState` setelah session tersedia.
- [ ] React Strict Mode tidak menggandakan `session.read`, initial state, atau route list secara network.
- [ ] Dua caller dengan action/payload/sesi sama memakai satu in-flight request.
- [ ] Abort satu subscriber tidak membatalkan request yang masih dipakai subscriber lain.
- [ ] Logout atau pergantian sesi membersihkan seluruh read cache memory.
- [ ] Cache owner/member tidak pernah berbagi key atau data.
- [ ] Read cache tidak memakai `localStorage`, service worker, CDN, atau cache publik.
- [ ] Write selalu menuju server dan invalidasi baru dilakukan setelah write berhasil.
- [ ] Perubahan transaksi hanya refresh ledger/overview terkait, bukan seluruh bootstrap.
- [ ] Perubahan rekening/kategori menginvalidasi bootstrap dan overview.
- [ ] Data lama tetap terlihat selama refresh; kegagalan refresh tampil non-blocking.
- [ ] Request lama dibatalkan/diabaikan ketika filter atau route berubah.
- [ ] Schema valid boleh memakai cache positif singkat; schema rusak dan write tetap fail closed.
- [ ] `stageTimings` tersedia tanpa payload finansial.
- [ ] `sheetMetrics` mencatat hanya nama sheet, durasi, row count, dan read count; tidak ada nilai sel.
- [ ] Halaman manajemen rekening/kategori tetap melihat archived item dan tidak memakai seed bootstrap aktif-only.

## Theme, modal, dan accessibility

- [ ] Light/dark diuji pada 360, 390, 768, 900, 1280, dan 1440 px.
- [ ] Canvas, surface, modal, input, hover, selected, dan border mempunyai hierarki yang jelas.
- [ ] Teal hanya menjadi accent; positive/error tidak disamakan dengan warna brand.
- [ ] Label minimal 14 px, navigasi desktop terbaca, dan tap target utama minimal 44 px.
- [ ] Form transaksi menampilkan field inti lebih dahulu dan detail tambahan melalui kontrol `aria-expanded`.
- [ ] Error field di bagian tambahan otomatis membuka bagian tersebut.
- [ ] Modal mempertahankan focus trap, Escape, body lock, initial focus, dan focus return.
- [ ] Footer modal tetap dapat dijangkau pada viewport pendek dan scrollbar tidak dominan.
- [ ] `prefers-reduced-motion` dihormati dan focus-visible terlihat pada keyboard.
- [ ] Native date input tetap dipakai dan bantuan tanggal Indonesia ditampilkan.

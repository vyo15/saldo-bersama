# Workflow Canonical

## Team

```text
COORD | koordinasi/review/integration
FE    | frontend/UI/UX/accessibility/responsive
BE    | backend/data/auth/security/integrations
```

## Alur kerja

```text
request
  -> validasi source terbaru
  -> baca docs/INDEX.md -> peta perubahan
  -> audit path/contract/test/docs terkait
  -> root cause
  -> plan file-by-file
  -> approval atau implementasi eksplisit
  -> patch kecil
  -> validation
  -> review diff
  -> commit pada main
  -> git push origin main
  -> pre-push verify + Production schema/binding read-only PASS
  -> Quality server-side berjalan
  -> clean ZIP bila diperlukan
```

### 0. Execution-first dan minim pertanyaan

Workflow ini memakai prinsip **kerjakan dulu selama aman**:

- bila request + approval + source sudah cukup jelas, agent melanjutkan seluruh langkah yang tercakup scope tanpa meminta konfirmasi ulang;
- ambiguity non-kritis diselesaikan dari source/test/contract canonical dengan pilihan paling kecil, kompatibel, dan aman;
- jangan menanyakan hal yang jawabannya sudah ada di percakapan atau repository;
- temuan baru yang masih berada dalam scope approved ikut diperbaiki beserta test/docs-nya;
- pertanyaan hanya boleh menjadi blocker untuk guarded scope baru, destructive/live operation, secret/credential, keputusan material yang benar-benar tidak ditentukan contract, atau input esensial yang hilang;
- bila pertanyaan wajib, tanyakan satu blocker paling sempit sekaligus;
- kegagalan environment pada full gate tidak menghentikan pekerjaan lain yang masih feasible: selesaikan patch, targeted/static validation, review diff, docs, dan artifact, lalu beri status berdasarkan evidence aktual;
- bila user meminta pekerjaan sampai selesai/ZIP, jangan berhenti di audit atau candidate parsial selama implementasi dan packaging masih dapat dilakukan aman;
- progress update tidak boleh berubah menjadi checkpoint approval untuk langkah yang sudah termasuk scope.

Aturan ini tidak mengurangi kewajiban approval pada **guarded changes** dan tidak mengizinkan agent menebak keputusan yang dapat memengaruhi data integrity, security, destructive action, atau operasi live.

### 0.1. Protokol remediation artifact `UNVERIFIED`

Artifact historical bernama `saldo-bersama-UNVERIFIED.zip` adalah **input diagnosis yang harus ditindaklanjuti**, bukan status akhir pekerjaan. Saat artifact lama ini menjadi source terbaru:

1. validasi root/source canonical seperti biasa dan baca `docs/UNVERIFIED_BUILD_REPORT.md` sebagai **evidence kegagalan gate**, bukan sebagai source of truth yang mengalahkan source/test;
2. reproduksi failure yang dilaporkan bila environment memungkinkan, lalu cari root cause pada source aktual;
3. perbaiki root cause beserta drift/bug lain yang masih berada dalam scope approved, termasuk regression test dan docs terkait;
4. jangan berhenti hanya karena nama artifact mengandung `UNVERIFIED`, jangan meminta user menjalankan ulang pekerjaan yang masih feasible di environment agent, dan jangan sekadar menyalin status laporan lama;
5. `docs/UNVERIFIED_BUILD_REPORT.md` adalah staging-only dari workflow lama dan tidak boleh dipertahankan sebagai canonical source/report final setelah remediation;
6. jalankan targeted regression dan full `npm run verify` pada tree final. Jika PASS, gunakan workflow clean verified. Jika gate masih terblokir oleh environment non-canonical, selesaikan semua patch/static/targeted validation yang masih feasible lalu laporkan limitation berdasarkan evidence baru;
7. artifact yang dikirim harus berasal dari tree terbaru setelah remediation. Jangan mengirim ulang ZIP UNVERIFIED lama atau memberi label `verified` tanpa `npm run verify` PASS pada Node canonical;
8. bila remediation mencakup penghapusan/rename file, verifikasi path lama benar-benar **absent** pada final tree dan artifact. Overlay changed-files-only tidak dianggap cukup untuk deletion karena file lama dapat tertinggal di folder penerima; gunakan full-source ZIP terbaru atau deletion handoff eksplisit, lalu ulangi regression dari tree setelah deletion diterapkan.

Workflow `npm run zip` saat ini **tidak lagi membuat artifact UNVERIFIED baru**. Verification yang gagal harus berhenti fail-closed tanpa membuat ZIP baru.

### 1. Source validation

ZIP/source terbaru wajib menjadi dasar review. Abaikan `node_modules`, build/dist, cache, `.git`, generated output, temporary file, dan secret. Review resmi menyebut nama source, root, stack relevan, path aktual yang diperiksa, file penting yang tidak ditemukan, dan limitation.

### 2. Impact scan dan scope

Sebelum coding, petakan **source -> behavior/contract -> test -> docs** memakai `docs/INDEX.md`. Cari test yang sudah mengunci area tersebut agar refactor tidak meninggalkan assertion lama. Jangan mengarang path/schema/route/dependency. Gunakan helper/component/service existing. Jika implementasi membutuhkan area guarded yang belum disetujui, berhenti dan minta approval.

Untuk bug/regression, test harus membuktikan behavior yang rusak. Jangan memakai source-text regex untuk mengunci nama variabel lokal, urutan helper internal, atau bentuk JSX yang boleh berubah tanpa mengubah behavior. Static/source tests tetap tepat untuk route literal, dependency boundary, forbidden API, security invariant, dan contract arsitektur yang memang harus literal.

### 3. Parallel work

Beberapa chat/tab boleh melakukan audit atau menyiapkan patch paralel bila scope tidak overlap. Karena user bekerja dari satu folder fisik, **penerapan patch dilakukan serial**: patch A -> validate/commit/push -> patch B.

Tidak ada task registry atau branch automation. Workflow rutin tetap di `main`; koordinasi scope dilakukan melalui plan serta diff source aktual.

### 4. Guarded changes

Approval eksplisit wajib untuk schema/migration, auth/allowlist/role, API contract, saldo/transfer/audit/idempotency, backup/restore/import/purge, env/secret/deployment, serta trust-boundary/security tooling. Guarded change tetap membutuhkan approval + review + test. Delivery rutin tetap `git push origin main`; pre-push boleh melakukan check Production **read-only**, tetapi operasi live destructive/migration tidak pernah diotomatisasi oleh push.

### 5. Validation

Urutan validation patch:

1. jalankan test regression/area yang terdampak;
2. jalankan lint/build relevan;
3. setelah seluruh edit dan docs final, jalankan full gate dari tree yang sama;
4. bila edit dilakukan lagi setelah PASS, PASS lama gugur dan gate relevan harus diulang;
5. handoff patch hanya boleh diberi status final bila full gate tree final PASS pada Node `24.18.1`; environment non-canonical hanya boleh menghasilkan candidate yang diberi label unverified.

Default full local gate setelah setiap patch:

```bash
npm run verify
```

`npm run verify` melakukan preflight Node 24 dan dependency yang sudah terpasang, lalu menjalankan source validation, lint/syntax, frontend regression, production build, build budget, serta seluruh backend regression satu kali dengan coverage. Guard security/governance sudah berada di suite frontend/backend sehingga tidak ada re-run `test:guard` terpisah. Ia tidak menjalankan `npm ci` atau menghapus dependency.

Browser automation telah dipensiunkan dari quality gate; UI/responsive diperiksa dengan regression frontend dan manual device QA sesuai scope.

Command `lint`, `test`, dan `build` tetap tersedia untuk diagnosis terarah. Full gate hanya memiliki satu entry point publik, `npm run verify`, supaya contributor tidak perlu memilih antara beberapa alias yang fungsinya bertumpuk. Build + budget dijalankan sebelum backend coverage agar kegagalan bundle/source frontend muncul lebih cepat dan tidak membuang waktu pada coverage yang mahal.

Build-budget checker juga memberi warning saat main JS, global CSS, atau route chunk mencapai 90% batas. Warning bukan kegagalan gate, tetapi wajib dianggap sinyal headroom rendah dan dipertimbangkan untuk lazy boundary/ekstraksi sebelum feature berikutnya. Jika build budget gagal, jangan ubah threshold sebagai shortcut. Audit route chunk, static dependency import, CSS global, dan asset tidak terpakai.

Auth Google tetap lazy: production canonical desktop/mobile memakai Google OAuth Authorization Code flow server-side melalui `/api/auth/google/start` dan `/api/auth/google/callback`, sedangkan localhost/device emulation memakai Firebase popup fallback.

Perubahan auth wajib ikut security/deployment regression, menguji state/nonce, PKCE S256 (`code_challenge`/`code_verifier`), redirect internal, Google→Firebase token exchange, registry `users`/`user_sessions` backend, dan tidak boleh memindahkan authorization dari backend. Verification wrapper selalu membersihkan generated build/test output sesudah PASS maupun gagal, sehingga retry dimulai dari artefak bersih tanpa menghapus dependency atau env lokal.

```bash
npm run db:integrity   # hanya bila operasi DB memang disetujui
```

`npm ci` hanya untuk bootstrap/reinstall dependency atau clean CI. Test yang tidak dijalankan harus dilaporkan sebagai limitation, bukan diklaim PASS.

### 6. Git delivery

Setelah validation PASS atau saat pre-push akan menjalankan validation canonical:

```bash
git add .
git commit -m "type: deskripsi perubahan"
git push origin main
```

Pre-push membaca ref/SHA aktual dari Git, menolak branch/ref mismatch, dirty working tree, non-fast-forward/force, lalu menjalankan full `npm run verify`. GitHub **Quality** tetap berjalan pada `main` sebagai verification server-side sekunder.

### 7. Changed-files ZIP

Jika user meminta patch ZIP, isi hanya file berubah dengan path asli. Jangan sertakan dependency, build, cache, generated file, temporary file, export/data privat, atau secret. Bila ada delete, laporkan path delete secara eksplisit.

### 8. Clean source ZIP

`npm run zip` selalu menjalankan full verification terlebih dahulu dan sekarang bersifat **clean-only**:

- verification PASS -> archive verified `saldo-bersama-clean.zip` dibuat secara atomic;
- verification gagal -> command exit non-zero dan **tidak membuat archive baru**;
- clean ZIP verified terakhir tidak ditimpa oleh hasil yang gagal.

Root/path arbitrary, patch/diff, export CSV/XLSX, database dump, env lokal, secret, dependency, dan build output tetap tidak boleh masuk.

## Keputusan

Prioritas selalu: security/privacy -> data integrity/saldo -> correctness -> accessibility/UX -> maintainability -> cosmetic cleanup. Warning complexity bukan alasan untuk refactor massal tanpa manfaat dan coverage yang memadai.

## Refactor maintainability

Urutan untuk refactor struktur/maintainability:

```text
source aktual
→ identifikasi invariant dan public contract
→ temukan test characterization/regression
→ tambah test bila contract kritis belum terkunci
→ extract satu responsibility pada satu waktu
→ jalankan targeted regression
→ cek dependency/circular import
→ sinkronkan docs
→ full quality gate
```

Refactor tidak boleh memakai perubahan behavior sebagai jalan pintas. Stable facade dipertahankan bila consumer sudah bergantung pada service/action public. Comment/JSDoc mengikuti `docs/CODE_MAINTAINABILITY.md`; targetnya rationale yang tahan lama, bukan comment pada setiap function.

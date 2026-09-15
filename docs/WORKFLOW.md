# Workflow Canonical

> **Status:** Canonical  
> **Purpose:** Workflow source review, implementation, validation, docs, dan delivery.

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
  -> pre-push verify + Production gate sesuai diff PASS
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
7. artifact yang dikirim harus berasal dari tree terbaru setelah remediation. Jangan mengirim ulang ZIP UNVERIFIED lama atau memberi label `verified` tanpa `npm run verify` PASS pada runtime Node yang didukung;
8. bila remediation mencakup penghapusan/rename file, verifikasi path lama benar-benar **absent** pada final tree dan artifact. Overlay changed-files-only tidak dianggap cukup untuk deletion karena file lama dapat tertinggal di folder penerima; gunakan full-source ZIP terbaru atau deletion handoff eksplisit, lalu ulangi regression dari tree setelah deletion diterapkan.

Workflow `npm run zip` saat ini **tidak lagi membuat artifact UNVERIFIED baru**. Verification yang gagal harus berhenti fail-closed tanpa membuat ZIP baru.

### 1. Source validation

ZIP/source terbaru wajib menjadi dasar review. Abaikan `node_modules`, build/dist, cache, `.git`, generated output, temporary file, dan secret. Review resmi menyebut nama source, root, stack relevan, path aktual yang diperiksa, file penting yang tidak ditemukan, dan limitation.

### 2. Impact scan dan scope

Sebelum coding, petakan **source -> behavior/contract -> test -> docs** memakai `docs/INDEX.md`. Cari test yang sudah mengunci area tersebut agar refactor tidak meninggalkan assertion lama. Jangan mengarang path/schema/route/dependency. Gunakan helper/component/service existing. Jika implementasi membutuhkan area guarded yang belum disetujui, berhenti dan minta approval.

Untuk bug/regression, test harus membuktikan behavior yang rusak. Jangan memakai source-text regex untuk mengunci nama variabel lokal, urutan helper internal, atau bentuk JSX yang boleh berubah tanpa mengubah behavior. Static/source tests tetap tepat untuk route literal, dependency boundary, forbidden API, security invariant, dan contract arsitektur yang memang harus literal.

### 3. Parallel patch dan final merge

Beberapa chat/tab boleh melakukan audit atau menyiapkan patch paralel untuk mempercepat pekerjaan, termasuk ketika user baru akan menggabungkan patch di akhir. Setiap patch harus diperlakukan sebagai **unit perubahan independen**, bukan project final, dan wajib mencatat baseline + scope + touched/added/deleted path + validation aktual mengikuti `templates/PATCH_MANIFEST_TEMPLATE.md`.

Aturan integrasi:

1. default artifact patch adalah **changed-files-only ZIP** dengan path asli;
2. project terbaru yang diberikan saat merge adalah **source of truth**;
3. final merger membaca perubahan patch satu per satu dan melakukan **semantic merge**, bukan extract/overwrite ZIP secara buta;
4. bila dua patch menyentuh file/contract yang sama, audit intent dan gabungkan logic yang masih relevan terhadap source terbaru;
5. patch yang sudah superseded/equivalent oleh source terbaru boleh ditandai sudah terwakili dan tidak dipaksakan masuk;
6. deletion/rename wajib membawa cleanup command Git Bash eksplisit dan usage audit;
7. setelah setiap kelompok merge yang overlap, jalankan targeted regression sebelum patch berikutnya; setelah seluruh patch masuk, jalankan lint + full verify;
8. integrasi final tetap satu pintu agar satu working folder tidak menerima overwrite paralel yang tidak direview.

Tidak ada task registry atau branch automation. Workflow rutin tetap di `main`; commit kecil yang sudah verified menjadi checkpoint sehat. Multi-chat dipakai untuk paralelisasi audit/patch, sedangkan integrasi final tetap semantic dan terkendali.

### 4. Guarded changes

Approval eksplisit wajib untuk schema/migration, auth/allowlist/role, API contract, saldo/transfer/audit/idempotency, backup/restore/import/purge, env/secret/deployment, serta trust-boundary/security tooling. Guarded change tetap membutuhkan approval + review + test. Delivery rutin tetap `git push origin main`; pre-push boleh melakukan check Production **read-only**, tetapi operasi live destructive/migration tidak pernah diotomatisasi oleh push.

### 5. Validation dan repair loop

Untuk bug/regression gunakan **root-cause-first**: reproduce/trace -> root cause -> patch kecil -> targeted regression. Jangan menumpuk workaround terhadap symptom. Jika dua repair attempt masih gagal pada failure yang sama, hentikan tambalan dan audit ulang baseline, diff, contract, serta owner logic sebelum edit berikutnya.

Urutan validation dibuat bertingkat supaya cepat:

1. jalankan syntax/static check atau targeted test paling murah yang langsung menyentuh perubahan;
2. jalankan targeted regression area terdampak sampai PASS;
3. setelah edit source stabil, jalankan `npm run lint`;
4. bila lint gagal, perbaiki **root cause source** lalu ulangi `npm run lint` sampai PASS. Jangan menonaktifkan rule atau menambah ignore hanya untuk melewati gate;
5. jalankan build/diagnosis relevan bila area perubahan memerlukannya;
6. setelah seluruh edit dan docs final, jalankan full gate `npm run verify` dari tree yang sama;
7. bila edit dilakukan lagi setelah PASS, PASS lama gugur dan lint + gate relevan harus diulang;
8. handoff patch hanya boleh berstatus **FINAL / VERIFIED** bila full gate tree final PASS pada Node `22.15.0+` (22.x) atau `24.x`; environment eksternal yang benar-benar memblokir full gate hanya boleh menghasilkan **CANDIDATE / UNVERIFIED**. Candidate **tidak boleh** membawa known lint/test/build failure yang sudah berhasil direproduksi.

User bukan runner QA pertama. Agent wajib menuntaskan repair loop yang dapat direproduksi sendiri; log Git Bash user hanya diminta sebagai fallback untuk failure environment-specific/tidak dapat direproduksi agent, misalnya credential Vercel/Turso, Windows-only behavior, browser/iPhone nyata, atau dependency/runtime eksternal.

Untuk patch yang dibuat agent/ChatGPT, `npm run zip` bukan mekanisme pertama untuk mengetahui kualitas patch. Lint repair-loop dan regression harus diselesaikan **sebelum handoff**; `npm run zip` hanya menjadi fail-closed archive gate terakhir. Jika command dapat berjalan dan menemukan error, error tersebut wajib diperbaiki pada patch yang sama.

Default full local gate setelah setiap patch:

```bash
npm run verify
```

`npm run verify` melakukan preflight runtime Node yang didukung dan dependency yang sudah terpasang, lalu menjalankan source validation, lint/syntax, frontend regression, production build, build budget, rendered browser smoke, serta seluruh backend regression satu kali dengan coverage. Guard security/governance sudah berada di suite frontend/backend sehingga tidak ada re-run `test:guard` terpisah. Ia tidak menjalankan `npm ci` atau menghapus dependency.

Rendered browser smoke kini kembali menjadi bagian quality gate melalui `scripts/browser-smoke.mjs` tanpa dependency browser-test tambahan. Smoke memakai Chrome/Chromium/Edge lokal (atau `CHROME_PATH`/`CHROME_BIN`) terhadap production build dan memeriksa login publik pada viewport canonical, page-level overflow, focus rendered, WCAG text-spacing, serta reduced-motion. Startup browser memakai port DevTools yang dipilih browser (`--remote-debugging-port=0` + `DevToolsActivePort`) agar CI tidak bergantung pada port acak yang dapat bentrok; bila browser gagal start, log proses terakhir ikut ditampilkan supaya failure GitHub Actions dapat didiagnosis. Authenticated/real-device journey tetap memakai manual device QA; smoke tidak boleh membuat auth bypass atau fixture finansial palsu.

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

### 7. Changed-files ZIP dan patch manifest

Jika user meminta patch ZIP, **default delivery adalah changed-files-only** dengan path asli. Jangan sertakan dependency, build, cache, generated file, temporary file, export/data privat, atau secret. Full-source ZIP hanya digunakan bila user meminta atau final integrator menilai overlay tidak aman.

Setiap patch paralel/handoff harus menyertakan metadata mengikuti `templates/PATCH_MANIFEST_TEMPLATE.md`: nama/scope patch, baseline commit/SHA bila tersedia, changed/added/deleted paths, area touched/not touched, validation aktual, cleanup command, serta status `FINAL / VERIFIED` atau `CANDIDATE / UNVERIFIED`. Manifest handoff tidak menjadi runtime source dan tidak ikut final merge.

Bila ada delete/rename, lakukan usage audit dan berikan command Git Bash siap-copy seperti `rm -f path/file-lama` atau `rm -rf path/folder-lama` hanya jika directory benar-benar terbukti orphan. Tidak adanya file dalam ZIP bukan bukti deletion sudah diterapkan.

Final response patch memakai urutan tetap **Artifact -> Cleanup Git Bash -> Validation -> Tidak disentuh -> Status** supaya merger/user tidak perlu menebak evidence tiap patch.

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

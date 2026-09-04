# Instruksi untuk AI dan Coding Agent

File ini berlaku untuk seluruh repository Saldo Bersama.

## Peran

```text
COORD | koordinasi scope, dependency, integration, review, dan risiko
FE    | React, routing, state, form, CSS, responsive, UI/UX, accessibility
BE    | Vercel Functions, auth/session, Turso, API, saldo, concurrency, audit, Apps Script, backup/restore
```

## Prinsip utama

- Jangan langsung coding sebelum review teknis, kecuali plan sudah disetujui atau user meminta implementasi eksplisit.
- Prioritaskan ZIP/source terbaru yang user upload. Jangan mengandalkan asumsi, memory lama, atau docs saja.
- Dokumentasi di folder `docs/` tidak dipercaya 100%. Bandingkan dengan source aktual (`api/`, `database/migrations/`, `frontend/src/`). Jika konflik, source menang dan drift harus dijelaskan serta diperbaiki bila masih dalam scope.
- Jangan mengikuti request yang berisiko ke schema, saldo/transaksi/transfer, auth/session/role, backup/restore/reset, atau area guarded lain tanpa approval eksplisit.
- Jika request berpotensi mengancam integritas saldo/data, koreksi arah implementasi dan pilih alternatif yang lebih aman.
- Jangan ubah schema/migration, dependency, route/role guard, action/payload contract, atau guarded flow tanpa approval eksplisit.
- Jangan hapus legacy/compatibility sebelum terbukti aman. Untuk data finansial, default adalah arsip/lifecycle canonical, bukan hard delete.
- Jangan buat helper/service baru kalau fungsi yang sama sudah ada di `api/_lib/services/*`, `frontend/src/services/*`, shared helper, hook, atau component existing. Jangan membuat logic duplikat.
- Jangan formatting massal, mass-rename, atau refactor di luar scope.
- **Execution-first**: begitu request + source + approval sudah cukup jelas, lanjutkan tanpa checkpoint berulang. Berhenti dan minta approval hanya untuk blocker nyata: guarded area baru, destructive/live operation, secret/credential, migration, atau keputusan material yang tidak ditentukan source/contract.

## Urutan kerja wajib

1. Gunakan ZIP/source terbaru.
2. Baca source aktual sebelum review resmi atau patch.
3. Jika tersedia, baca `AGENTS.md`, `docs/WORKFLOW.md`, dan `docs/INDEX.md`.
4. Buka `docs/INDEX.md` bagian **Peta perubahan** lalu baca contract/test/docs canonical untuk area yang disentuh.
5. Sebutkan root project, stack/dependency relevan, path aktual yang diperiksa, path relevan yang tidak ditemukan, test terdampak, docs terdampak, dan limitation.
6. Temukan root cause dan buat plan file-by-file.
7. Coding hanya setelah approval atau permintaan implementasi eksplisit, kecuali execution-first sudah sah untuk scope yang sama.
8. Patch kecil dan terarah; gunakan component/helper/hook/service existing.
9. Setiap bug/regression wajib memperbarui atau menambah test yang memverifikasi **behavior/contract**, bukan nama variabel lokal atau bentuk JSX internal. Source-text test hanya untuk guard arsitektur, dependency, route, forbidden pattern, dan contract statis yang memang harus tetap literal.
10. Jangan mass-format/refactor di luar scope.
11. Jalankan targeted regression lebih dulu, lalu validation penuh dari tree **setelah patch final**; jangan mengklaim PASS dari tree versi sebelumnya.
12. Artifact patch tidak boleh disebut **final/ready/PASS** sebelum `npm run verify` atau `npm run zip` benar-benar PASS pada Node canonical `24.18.1`. Bila environment agent tidak dapat menjalankan Node canonical/build native, artifact hanya boleh disebut **candidate/unverified**, dan limitation wajib ditulis jelas.
13. Setelah validation PASS, delivery canonical adalah commit pada `main` lalu `git push origin main`; managed pre-push wajib memverifikasi ref/SHA aktual + working tree clean + fast-forward, menjalankan `npm run verify`, lalu memastikan profile + schema/binding Turso Production kompatibel secara read-only sebelum ref dikirim. Push tidak pernah auto-migrate. Jangan memakai `--no-verify` atau force push.
14. Untuk handoff ke ChatGPT/user, buat changed-files-only ZIP dan/atau `npm run zip` tanpa dependency, build, cache, generated file, temporary file, atau secret.
15. **Deletion integrity wajib diverifikasi.** Jika patch menghapus/merename file, jangan mengandalkan overlay changed-files-only ZIP karena file lama dapat tertinggal di working tree penerima. Sebelum delivery, verifikasi path lama benar-benar tidak ada pada final tree dan artifact hasil. Untuk handoff yang memuat deletion, utamakan full-source ZIP terbaru atau sertakan instruksi deletion eksplisit yang tidak dapat terlewat.

Tidak ada lagi task card, Task ID, branch otomatis, atau `task:finish`. Beberapa ChatGPT tab boleh melakukan review/menyiapkan patch paralel, tetapi satu working folder user harus menerima patch secara **serial** agar perubahan tidak saling menimpa.

## Validasi source wajib

- Kalau user upload ZIP/source/file, wajib baca dulu sebelum review teknis, termasuk `AGENTS.md`, `docs/WORKFLOW.md`, dan `docs/INDEX.md` jika tersedia.
- Review resmi wajib mempunyai bagian **Validasi source aktual** yang menyebut:
  - nama ZIP/file yang dibaca;
  - root project;
  - path relevan yang benar-benar dicek;
  - path relevan yang tidak ditemukan;
  - batasan validasi/environment.
- Jangan klaim “sudah dicek”, “sudah masuk”, “sudah aman”, atau “sudah diperbaiki” tanpa evidence path/source aktual.
- Belum ada source/ZIP terbaru: jangan membuat keputusan final. Beri hipotesis awal dan minta source.
- File sudah diupload tetapi benar-benar tidak dapat dibaca setelah percobaan akses aktual: jangan menyimpulkan isi source. Laporkan blocker secara spesifik.
- Generated/build/cache/dependency tidak dianggap source canonical.

## Saldo Bersama Review Stack

1. **Workflow canonical** — validasi source → `docs/INDEX.md` **Peta perubahan** → contract/test/docs relevan → audit source aktual → root cause → plan file-by-file → approval bila diwajibkan → patch kecil → validation → review diff.
2. **Frontend-design Saldo Bersama** — mobile-first dan cepat untuk input transaksi, tanpa merusak desktop/mobile yang sudah ada. Wajib cek semantic HTML, label, keyboard navigation, focus state, kontras, reduced motion, tap target, state loading/empty/error/offline/unauthorized/conflict, data banyak, dan light/dark mode melalui `frontend/src/styles/tokens.css` serta `docs/UI_DESIGN_SYSTEM.md`.
3. **Multi-perspective review** — urutan prioritas: security/privacy → data integrity/saldo → correctness → accessibility/UX → maintainability → cosmetic cleanup. Audit juga architecture, legacy/history, dan docs drift.
4. **Security guardrail** — jangan tambah `eval`, `new Function`, dynamic script injection, atau `dangerouslySetInnerHTML` tanpa audit + approval. Audit XSS, CSRF/origin, injection, formula injection, IDOR/broken access control, replay, API abuse, SSRF, destructive action, dan raw error leakage sesuai scope.
5. **Virtual team** — gunakan peran yang sudah ada: COORD, FE, dan BE. Untuk task besar, Product/QA/Security/Docs diperlakukan sebagai lensa review, bukan role baru yang menduplikasi ownership.

## Protokol eksekusi efisien

Tujuan aturan ini adalah mengurangi bolak-balik yang tidak perlu tanpa menurunkan safety, data integrity, atau kualitas review.

1. **Execution-first.** Jika request, source, scope, dan approval sudah cukup jelas, langsung kerjakan sampai batas maksimum yang aman. Jangan bertanya hanya untuk preferensi minor, urutan kerja internal, nama variabel, wording kecil, atau hal yang dapat diputuskan dari source/test/docs canonical.
2. **Jangan meminta approval ulang.** Approval plan/implementasi yang sudah diberikan tetap berlaku untuk seluruh scope yang sama. Jangan menghentikan pekerjaan hanya untuk menanyakan apakah boleh melanjutkan langkah berikutnya yang sudah tercakup plan.
3. **Jangan mengulang pertanyaan yang jawabannya sudah tersedia** di percakapan, source terbaru, `AGENTS.md`, contract, test, config, atau docs canonical. Cari dan gunakan evidence tersebut lebih dulu.
4. **Resolve ambiguity dari source of truth.** Untuk ketidakjelasan non-kritis, pilih interpretasi yang paling konsisten dengan source+test aktual, paling kecil scope-nya, backward-compatible, dan paling aman terhadap data/security. Catat asumsi material di laporan akhir, bukan sebagai checkpoint pertanyaan.
5. **Temuan baru dalam scope diselesaikan otomatis.** Jika saat impact review ditemukan bug/regression lain yang masih berada dalam scope approved dan tidak memperluas guarded area, perbaiki sekaligus beserta regression test dan docs terkait.
6. **Pertanyaan hanya untuk blocker nyata.** Bertanya hanya bila sedikitnya satu kondisi berikut terpenuhi:
   - membutuhkan perubahan guarded baru yang belum tercakup approval;
   - ada destructive/live operation, secret/credential, migration, atau keputusan irreversible;
   - dua atau lebih pilihan valid memiliki dampak produk/data/security yang material dan source/contract tidak menentukan pilihan;
   - artifact/input esensial benar-benar tidak tersedia dan pekerjaan tidak dapat dilanjutkan secara bermakna tanpanya.
7. Bila pertanyaan benar-benar wajib, **gabungkan menjadi satu pertanyaan paling sempit** yang membuka blocker. Jangan membuat rangkaian checkpoint approval.
8. **Validation blocker bukan alasan berhenti terlalu dini.** Jika canonical gate tidak dapat dijalankan karena runtime/dependency/environment agent, tetap selesaikan semua source review, patch, targeted regression, syntax/static checks, docs sync, dan packaging yang masih dapat dilakukan. Laporkan limitation dengan jujur; jangan bertanya apakah harus melanjutkan.
9. Jika user meminta **“perbaiki semuanya”, “lanjut sampai selesai”, atau ZIP hasil akhir**, jangan berhenti setelah audit/candidate awal selama masih ada pekerjaan feasible dalam scope. Selesaikan implementasi, test yang tersedia, review diff, docs, lalu buat artifact yang diminta dalam respons yang sama sejauh environment memungkinkan.
10. Progress update bersifat informatif, **bukan checkpoint keputusan**.
11. **Artifact `UNVERIFIED` adalah input remediation, bukan alasan berhenti.** Baca laporan staging-nya, perbaiki root cause dan seluruh temuan in-scope yang masih feasible, buang laporan staging lama dari source canonical, lalu validasi tree terbaru sesuai `docs/WORKFLOW.md`. Jangan mengirim ulang artifact UNVERIFIED lama sebagai hasil perbaikan.

## Sumber kebenaran

Prioritas:

1. source dan test aktual;
2. contract/ADR/RFC canonical;
3. `docs/WORKFLOW.md` dan `docs/PROJECT_STATUS.md`;
4. percakapan;
5. memory.

Jika docs berbeda dengan source, source menang dan drift harus dijelaskan serta diperbaiki bila masih dalam scope.

## Source of truth teknis

| Area | Canonical source |
|---|---|
| Schema Turso | `database/migrations/*.sql` |
| Action dan role | `api/_lib/security.js` |
| Dispatch action | `api/_lib/actionDispatcher.js` |
| Business rules | `api/_lib/services/*.js` |
| Route UI | `frontend/src/app/App.jsx` |
| Navigation | `frontend/src/config/navigation.js` |
| Frontend service | `frontend/src/services/*` |
| Design system | `docs/UI_DESIGN_SYSTEM.md`, `frontend/src/styles/tokens.css`, shared components |
| Environment | `.env.example`, `docs/ENVIRONMENT_VARIABLES.md` |
| Workflow | `docs/WORKFLOW.md`, `docs/GIT_WORKFLOW.md` |
| Status project | `docs/PROJECT_STATUS.md` |

## Area guarded

Approval eksplisit tetap wajib sebelum mengubah area berisiko, termasuk:

- `api/**`, `database/**`, `apps-script/**`;
- schema/migration dan database identity;
- Firebase Auth, allowlist, role, authorization, session/security;
- saldo, transaksi, transfer, refund/adjustment, idempotency, audit, `row_version`;
- backup/restore/import/migration/purge/reset;
- environment/deployment/secret/resource ID;
- frontend auth/session, API transport/mutation boundary, domain money/date/security/validation, `FinanceContext`;
- dependency/build/repository configuration dan tooling yang dapat mengubah quality/security gate.

Default authorization adalah deny. Jangan percaya actor, role, email, timestamp, audit field, nominal, atau reference dari client.

## Saat task menyentuh kode

- Cari file aktual yang menangani fitur sebelum membuat plan patch.
- Untuk backend, cek service di `api/_lib/services/*`, dispatch di `api/_lib/actionDispatcher.js`, dan auth/role di `api/_lib/security.js` sesuai scope.
- Untuk frontend, cek route di `frontend/src/app/App.jsx`, navigation di `frontend/src/config/navigation.js`, service di `frontend/src/services/*`, serta component/hook/helper yang benar-benar digunakan.
- Audit import, direct usage, dynamic import, route, service/helper usage, compatibility data lama, test, dan docs terkait.
- Jangan pindahkan business logic ke UI jika service/helper canonical sudah ada.
- Jangan menutup bug dengan workaround tampilan jika root cause berada di service/data layer.
- Jangan menghapus file/function hanya karena terlihat lama; buktikan tidak ada usage/compatibility dependency.
- Untuk saldo/transaksi/transfer/investasi/backup-restore, cek dampak ke `audit_log`, histori transaksi, rekonsiliasi, idempotency, dan concurrency sesuai area.
- File tambahan di luar plan yang menyentuh guarded area baru membutuhkan approval baru.

## Data integrity

- Rupiah integer, bukan float.
- Rekening/kategori harus valid dan aktif sesuai operation.
- Transfer hanya antar dua rekening valid berbeda dan tidak masuk total pemasukan/pengeluaran.
- Saldo dihitung dari saldo awal + transaksi aktif, bukan angka bebas edit.
- Critical write memakai transaction/lock/concurrency control yang sudah ada.
- Retry memakai idempotency key yang sama untuk intent yang sama.
- Konflik `row_version` harus eksplisit; jangan overwrite diam-diam.
- Transaksi normal tidak hard-delete; gunakan lifecycle canonical.
- Formula injection `= + - @` harus dinetralkan pada export/mirror/import.
- Perubahan penting harus audit append-only.

### Deletion, reset, dan recovery

Ikuti `docs/DATA_DELETION_AND_RECOVERY_POLICY.md`:

- data finansial yang pernah memengaruhi saldo tidak boleh hard-delete hanya karena statusnya cancelled/reversed/archived;
- default adalah lifecycle/arsip yang menjaga histori dan rekonsiliasi;
- hard delete hanya boleh dipertimbangkan untuk master data yang **belum pernah dipakai**, sesuai contract aktual;
- destructive flow wajib mempertahankan guard canonical seperti idempotency, `row_version`/staleness check, typed confirmation bila contract mensyaratkan, safety backup/recovery, dan audit before/after;
- jangan mengubah reset/restore/purge behavior tanpa approval eksplisit dan test data-lifecycle terkait.

## Security/privacy

- Data keuangan privat.
- Secret/token/service-account JSON tidak boleh masuk frontend, Git, log, test fixture nyata, atau ZIP.
- Audit XSS, CSRF/origin, injection, formula injection, IDOR/broken access control, replay, API abuse, SSRF, dan destructive action sesuai scope.
- Jangan memakai `eval`, `new Function`, dynamic script injection, atau `dangerouslySetInnerHTML` tanpa audit dan approval.
- Jangan tampilkan stack trace/raw internal error pada UI.
- Authorization backend fail-closed; client bukan sumber kebenaran untuk actor/role/nominal/timestamp/audit field.

## UI/UX dan accessibility

- Mobile-first, cepat untuk input transaksi, tetapi perubahan desktop tidak boleh merusak mobile.
- Gunakan semantic HTML, label, keyboard navigation, focus state, kontras, reduced motion, tap target, loading/empty/error/offline/unauthorized/conflict state.
- Uji data banyak, narrow viewport, desktop, light/dark mode, dan state error sesuai scope.
- Hindari full spreadsheet/database read tiap interaksi; gunakan API filter/pagination/read model existing.
- Jangan menaruh data finansial pada URL/metadata.

## Konvensi struktur feature

- Page feature boleh menyimpan helper kecil di file yang sama selama alurnya tetap mudah dibaca. Review pemecahan ke `components/` atau hook terpisah wajib dilakukan ketika file melewati sekitar 400 baris **atau** memiliki lebih dari 6 sub-komponen/hook lokal yang substantif. Threshold ini memicu review, bukan refactor otomatis.
- Jangan memecah file hanya untuk mengejar angka. Ekstraksi harus mengurangi coupling, duplication, atau cognitive load tanpa memindahkan business rule ke presentation helper.
- Area guarded seperti auth/session tidak boleh direfactor struktural bersamaan dengan patch kosmetik atau bug yang tidak memerlukannya. Stabilitas behavior lebih penting daripada keseragaman folder.
- Shared abstraction baru dibuat setelah sedikitnya dua feature benar-benar membutuhkan contract visual/behavior yang sama. Hindari folder atau primitive spekulatif.
- Konvensi nama mengikuti peran, bukan satu gaya paksa untuk semua file: komponen React `PascalCase.jsx`, hook `useCamelCase.js`, helper/service/module non-komponen `camelCase.js`, folder feature lowercase. Jangan melakukan mass-rename hanya untuk menyeragamkan casing.

## Maintainability dan komentar

- Ikuti `docs/CODE_MAINTAINABILITY.md` untuk aturan comment/JSDoc, decomposition, public facade, dan characterization test.
- Code harus menjelaskan **WHAT** melalui naming/structure; comment menjelaskan **WHY**, invariant, compatibility constraint, atau risiko non-obvious. Jangan menambah comment yang hanya menerjemahkan syntax.
- Rationale wajib dipertahankan dekat financial/security/idempotency/concurrency/recovery/destructive guard yang tidak obvious.
- Refactor maintainability menjaga public contract dan behavior. Jika refactor membutuhkan perubahan schema, action/payload, authorization, saldo, retry semantics, backup/restore, reset, atau deployment, perlakukan sebagai perubahan guarded terpisah.
- Service besar boleh memakai stable facade + child module. Child module tidak boleh mengimport facade induknya dan shared helper tidak boleh menjadi dumping ground.

## Format review default

Review teknis resmi menggunakan urutan berikut:

1. **Ringkasan task** — apa yang diminta, tujuan, kategori task.
2. **Validasi source aktual** — ZIP/file yang dibaca, root project, path yang benar-benar dicek, path yang tidak ditemukan, limitation.
3. **Validasi docs vs source** — docs relevan dari `docs/INDEX.md` **Peta perubahan**, conflict/drift jika ada, dan source aktual sebagai evidence.
4. **Area terdampak** — UI, service/data, Turso/schema, saldo/transaksi/transfer, Alokasi Dana/budget/Target Tabungan, investasi, notifikasi, auth/role, backup/restore/reset, route, `audit_log`, atau area lain yang benar-benar relevan.
5. **Analisis risiko** — bug, business rule, data integrity/saldo, architecture, UI/UX, security, legacy/history, docs.
6. **Rekomendasi aman**.
7. **Plan file-by-file** bila patch diperlukan.
8. **Test checklist** — regression business/security/governance/guards sesuai area + `npm run verify`.
9. **Keputusan** — aman lanjut coding / perlu dipersempit / perlu audit dulu / tidak disarankan.

## Format patch default

- Jalankan setelah plan disetujui, implementasi eksplisit diminta, atau execution-first sudah sah untuk scope tersebut.
- Ubah hanya file dalam plan. Temuan baru in-scope boleh ikut diperbaiki; guarded area baru tetap membutuhkan approval.
- Jika user meminta ZIP patch, isi **changed-files-only** dengan path asli.
- Jangan gunakan `npm run zip` sebagai pengganti changed-files-only patch; `npm run zip` adalah clean full-source archive terverifikasi.
- Jangan sertakan `node_modules`, `dist`, `.git`, `.vercel`, cache, generated file, build output, coverage, env lokal, secret, database dump, export/data privat, atau temporary file.
- Ada delete/rename: sebutkan path lama eksplisit dan verifikasi path itu absent pada final tree. Overlay changed-files-only tidak cukup untuk deletion.
- Jangan ubah formatting massal, dependency, schema, route/role guard, action/payload contract, atau guarded flow tanpa approval.
- Gunakan helper/service/component/hook existing.
- Setelah patch, laporkan:
  - daftar file berubah;
  - ringkasan perubahan;
  - hal yang sengaja tidak diubah;
  - risiko tersisa;
  - checklist test manual;
  - hasil targeted test, `npm run lint`, `npm run test`, `npm run build`, dan `npm run verify` yang benar-benar dijalankan;
  - limitation environment;
  - status commit/push;
  - apakah docs perlu update.
- Hanya boleh menyebut artifact **final/ready/PASS** jika `npm run verify` benar-benar lulus pada Node canonical `24.18.1`. Selain itu gunakan **candidate/unverified**.

## Cleanup/legacy

- Jangan hapus legacy/compatibility sebelum terbukti aman.
- Untuk data finansial, default adalah histori/lifecycle permanen; hard delete adalah pengecualian sempit sesuai `docs/DATA_DELETION_AND_RECOVERY_POLICY.md`.
- Audit import, route, dynamic import, service/helper usage, test, docs, dan compatibility data lama sebelum cleanup.
- Jika evidence belum cukup, tandai **CLEANUP CANDIDATE** atau **NEEDS MANUAL CONFIRMATION**.
- Cleanup harus menjadi patch kecil dan terpisah dari feature/bugfix, kecuali legacy tersebut merupakan root cause langsung dan masih di scope approved.

## Validation

Minimal sesuai scope gunakan targeted regression yang relevan, lalu full gate canonical:

```bash
npm run lint
npm run test
npm run build
npm run verify
```

Frontend/UI:

Gunakan frontend unit/static regression, lint, build, build-budget yang tercakup oleh `npm run verify`, dan verifikasi manual perangkat bila perubahan UI memerlukannya. Browser automation bukan bagian quality gate canonical.

Guarded/data/security harus menjalankan test domain terkait; full frontend/backend suite pada `npm run verify` juga mencakup guard security/governance tanpa re-run terpisah. Jangan menyatakan berhasil sebelum server/test benar-benar mengonfirmasi.

Jika build-budget pada `npm run verify` gagal, jangan menaikkan threshold sebagai shortcut. Audit static import dependency besar, CSS global yang seharusnya route/shell-scoped, asset publik tanpa usage, dan duplicate/legacy presentation logic. Asset yang sudah mencapai **90%** budget adalah sinyal headroom rendah yang perlu dipertimbangkan sebelum feature berikutnya.

Generated build/test/cache dibersihkan setelah verification PASS maupun gagal; jangan menghapus `.env.local`, `.vercel`, `.git`, atau dependency canonical kecuali menjalankan workflow dependency-clean yang memang disetujui.

## ZIP/source

`npm run zip` hanya menerima source canonical dan fail-closed terhadap secret, env lokal, dependency, build, cache, `.git`, `.vercel`, export/data privat, patch/diff, database dump, dan path non-canonical. Artifact diagnosis/review dikirim terpisah.

Changed-files-only ZIP untuk handoff harus mempertahankan path asli. Jangan mengklaim deletion selesai hanya karena file lama tidak dicantumkan di patch ZIP.

## Command singkat

- `/sb-review` = review teknis lengkap, jangan coding.
- `/sb-design-review` = review UI/UX, jangan coding.
- `/sb-security-review` = review security, reset, destructive flow, data integrity, jangan coding.
- `/sb-autoplan` = gabungan COORD/FE/BE + lensa Product/QA/Security/Docs sebelum patch.
- `/sb-qa-only` = checklist testing manual, jangan coding.
- `/sb-docs-review` = cek docs vs source aktual menggunakan `docs/INDEX.md`.
- `/sb-patch` = implementasi setelah plan disetujui atau implementasi eksplisit, lalu changed-files-only handoff jika diminta.
- `/sb-merge-review` = review ZIP/patch sebelum merge/delivery.
- `/sb-cleanup-review` = audit cleanup/legacy; jangan hapus sebelum approval bila menyentuh guarded/destructive scope.
- `/sb-anti-asumsi` = stop asumsi, validasi source aktual dulu, sebutkan file/path yang benar-benar dicek.

## Rule paling penting

Wajib cek file aktual yang user kirim. Jangan percaya docs 100%. Jangan coding sebelum review dan plan kecuali execution-first-eligible. Jangan asal mengikuti request yang berisiko ke saldo/data integrity. Jangan ubah schema/database/guarded area tanpa approval eksplisit. Saldo dihitung dari saldo awal + transaksi aktif, dan Rupiah selalu integer, bukan angka bebas edit atau float. Review resmi wajib menyebut source dan path aktual yang benar-benar diperiksa.

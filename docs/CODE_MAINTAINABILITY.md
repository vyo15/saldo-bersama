# Code Maintainability

Dokumen ini adalah contract maintainability canonical untuk source Saldo Bersama. Tujuannya bukan mengejar jumlah file kecil atau jumlah komentar, tetapi menjaga business rule, trust boundary, dan alasan desain tetap mudah dipahami tanpa membuat implementasi ganda.

## Prinsip utama

1. **Code menjelaskan WHAT; comment menjelaskan WHY.** Nama function/module harus cukup jelas untuk menjelaskan tugas normalnya. Comment dipakai untuk rationale, invariant, compatibility constraint, atau risiko yang tidak terlihat dari syntax.
2. **Satu source of truth per business rule.** Saldo, transaction lifecycle, authorization, idempotency, planning, destructive maintenance, dan contract lain tidak boleh diduplikasi ke presentation helper.
3. **Extraction mengikuti responsibility, bukan line count.** File besar memicu review, bukan refactor otomatis. Pisahkan hanya bila boundary baru mengurangi coupling/cognitive load dan tidak memindahkan authority.
4. **Public facade stabil; implementation internal boleh berubah.** Consumer sebaiknya tidak dipaksa mengetahui struktur internal service setelah decomposition.
5. **Characterize before refactor.** Behavior kritis harus dikunci oleh test contract sebelum implementasi dipindahkan.
6. **No hidden behavior change.** Refactor maintainability tidak boleh sekaligus mengubah schema, API, saldo, role, auth, idempotency, backup/restore, atau destructive semantics tanpa approval terpisah.

## Kapan comment wajib

Comment/JSDoc wajib atau sangat dianjurkan ketika code menjaga salah satu hal berikut:

- saldo/ledger invariant, termasuk historical/projected balance;
- authorization/trust boundary atau alasan data client tidak dipercaya;
- idempotency, replay, outcome-unknown, retry, atau concurrency/version conflict;
- destructive maintenance, fail-closed, backup/recovery, restore, import, reset, purge;
- SSRF/network-safety, constant-time comparison, signature verification, formula neutralization;
- compatibility behavior atau workaround runtime/browser yang tidak obvious;
- query/read-model optimization yang sengaja mempertahankan semantic tertentu;
- non-obvious lifecycle rule yang bila dihapus dapat merusak audit/history.

Comment tidak wajib untuk formatter trivial, getter sederhana, wrapper satu baris, atau component presentational kecil yang sudah self-documenting.

## Bentuk comment yang disukai

Gunakan rationale singkat dan dekat dengan guard terkait:

```js
// Validate the projected historical ledger, not only today's balance.
// A backdated edit can invalidate an intermediate account balance.
```

Hindari comment yang hanya menerjemahkan syntax:

```js
// Ambil rekening aktif.
const account = ...;
```

## JSDoc

JSDoc dipakai untuk exported/complex boundary ketika parameter, return shape, error semantics, atau invariant tidak cukup jelas dari nama. JSDoc tidak diwajibkan untuk setiap local helper.

Untuk boundary berisiko, dokumentasikan minimal:

- authority/source of truth;
- invariant utama;
- input yang dianggap untrusted;
- side effect penting;
- failure/outcome-unknown behavior bila relevan.

## Backend service boundary

- `api/_lib/actionDispatcher.js` tetap pusat execution-policy orchestration.
- `api/_lib/actions/registry.js` hanya mapping action ke handler; business logic tidak ditempatkan di registry.
- Service facade boleh mengekspor function dari child module agar import consumer tetap stabil.
- Child module tidak boleh mengimport kembali facade induknya karena berisiko circular dependency.
- `shared.js` hanya berisi helper yang benar-benar dipakai beberapa sibling; jangan membuat dumping ground.

## Frontend boundary

- Page/component boleh mengorkestrasi state dan mutation, tetapi backend tetap authority untuk financial/security rule.
- Presentation extraction tidak boleh membuat kalkulator saldo, authorization rule, atau mutation transport kedua.
- API mutation tetap melalui client/transport canonical dan menggunakan idempotency behavior existing.
- `FinanceContext`/request epoch/cache invalidation tidak boleh diduplikasi ke feature lokal.

## File-size review

Sekitar 400+ baris atau lebih dari enam subcomponent/hook substantif memicu review. Hasil review boleh berupa:

- tetap satu file bila domain memang cohesive;
- extract presentational component;
- extract read-model/pure helper;
- extract sibling service domain;
- tambah rationale/comment saja bila decomposition justru menyebarkan invariant.

Line count bukan Definition of Done.

## CSS

- Pertahankan cascade/order kecuali perubahan visual memang diminta.
- File besar boleh diberi section comment berdasarkan ownership component.
- Dead selector hanya dihapus setelah usage terbukti tidak ada.
- Shared token dibuat jika benar-benar dipakai lintas area; jangan membuat token/primitive spekulatif.
- Maintainability refactor tidak boleh berubah menjadi redesign visual tersembunyi.

## Testing sebelum dan sesudah refactor

Sebelum memindahkan guarded behavior, cari test yang mengunci contract. Tambah characterization test bila behavior penting belum terlindungi.

Sesudah refactor, validasi minimal:

```bash
npm run validate:source
npm run lint
npm run test
npm run test:guard
npm run build
npm run build:budget
npm run test:coverage:backend
npm run check:duplicates
npm run verify
```

`npm run verify`/artifact final hanya valid pada Node canonical yang dinyatakan repository. Jika environment tidak memenuhi runtime canonical, hasil harus disebut candidate/unverified.

## Review checklist

Reviewer memeriksa bahwa:

- responsibility module lebih jelas, bukan sekadar dipindahkan;
- public contract dan action name tetap kompatibel;
- tidak ada business logic yang menjadi duplikat;
- invariant kritis mempunyai rationale yang cukup;
- tidak muncul circular dependency;
- error/security guard tidak dilemahkan;
- destructive flow tetap fail-closed dan auditable;
- test menilai behavior/contract, bukan nama variable atau bentuk JSX internal;
- docs canonical tetap sesuai source aktual.

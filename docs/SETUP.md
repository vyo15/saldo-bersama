# Setup

> **Status:** Canonical onboarding  
> **Purpose:** Menyiapkan workstation Development sampai aplikasi dapat dijalankan.  
> **Update when:** Runtime/tooling/bootstrap Development berubah.  
> **Boundary:** Daftar/arti env ada di `ENVIRONMENT_VARIABLES.md`; deployment Production ada di `DEPLOYMENT.md`.

## Prerequisite

- Git
- Node `22.15.0+` pada 22.x atau Node 24.x
- npm sesuai lockfile
- akses Vercel project private dan Development environment bila mengerjakan runtime terhubung

## Bootstrap source

```bash
git clone <repo>
cd saldo-bersama
npm ci
```

`npm ci` digunakan untuk bootstrap/reinstall/clean CI, bukan ritual sebelum setiap test/push.

## Development environment canonical

Development lokal mengambil konfigurasi canonical dari **Vercel Development**, bukan dari Production.

```bash
npm run env:pull:development
npm run env:status
```

Jika environment Development perlu disinkronkan dari file lokal yang sudah diverifikasi, gunakan script canonical pada `package.json` dan ikuti klasifikasi `ENVIRONMENT_VARIABLES.md`; jangan menyalin secret lewat chat/dokumentasi.

Database Development harus dibinding secara eksplisit:

```bash
npm run db:bind-environment -- development
```

Verifikasi marker `DATABASE_ENVIRONMENT=development`. Development dan Production memakai database terpisah; **jangan melakukan rebind silang** atau memakai credential Production sebagai shortcut local debugging.

## Menjalankan aplikasi

```bash
npm run dev
```

Bootstrap Development akan memvalidasi environment yang diperlukan. Bila environment tidak lengkap, perbaiki Vercel Development/source env sesuai `ENVIRONMENT_VARIABLES.md`; jangan fallback diam-diam ke Production.

## Auth lokal

- Production canonical memakai server OAuth.
- Localhost/device emulation boleh memakai Firebase popup fallback.
- Authorization tetap backend; env/auth bootstrap lokal tidak boleh membuat bypass role/session.

## Database dan migration

- Turso adalah source of truth.
- Migration Production tidak dijalankan otomatis saat `npm run dev`.
- Perubahan schema mengikuti `DATABASE_MIGRATION_POLICY.md` dan merupakan guarded change.
- Untuk inspection/integrity gunakan tooling canonical dan database environment yang benar; jangan menjalankan destructive command hanya untuk memastikan koneksi.

## Quality lokal

Targeted test boleh dijalankan selama development. Full gate sebelum final delivery:

```bash
npm run verify
```

Clean archive:

```bash
npm run zip
```

`npm run zip` menjalankan verification terlebih dahulu dan hanya membuat archive jika PASS.

## Sebelum mengubah source

Baca:

1. `../AGENTS.md`;
2. `INDEX.md` untuk authority/peta perubahan;
3. `WORKFLOW.md` dan `GIT_WORKFLOW.md`;
4. authority domain yang relevan;
5. `PROJECT_STATUS.md` hanya untuk snapshot current state.

Jangan memperlakukan CHANGELOG, ADR lama, RFC Proposed, atau `history/` sebagai current behavior kecuali authority canonical secara eksplisit merujuknya.

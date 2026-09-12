# Deployment

> **Status:** Runbook  
> **Purpose:** Prosedur release Production yang version-neutral dan fail-closed.  
> **Update when:** Tooling deploy, environment policy, migration/release gate, atau smoke contract berubah.  
> **Rule:** History migration/release berada di `CHANGELOG.md`/migrations; runbook ini selalu menjelaskan prosedur current.

## Preconditions

- Source final berasal dari tree yang sama dengan validation.
- Node didukung: `22.15.0+` pada 22.x atau Node 24.x.
- Working tree bersih; secret/data privat/generated artifact tidak masuk source/archive.
- Environment Production lengkap sesuai `ENVIRONMENT_VARIABLES.md`.
- Database binding memiliki `DATABASE_ENVIRONMENT=production`; Development dan Production tidak boleh silang.
- Perubahan guarded sudah memiliki approval/evidence yang diwajibkan.

## 1. Environment canonical

1. Validasi status environment dengan tooling canonical (`npm run env:status` dan script sync yang relevan).
2. Production Sensitive tetap menyimpan secret seperti `GOOGLE_OAUTH_CLIENT_SECRET`; public Firebase/VAPID keys mengikuti klasifikasi env docs.
3. Preview tidak menjadi sumber nilai canonical Production.
4. Google bridge/Push hanya dianggap aktif bila seluruh key/resource yang diperlukan lengkap; incomplete configuration harus fail-closed atau degrade tanpa merusak finance core.

## 2. Database isolation dan preflight

Sebelum perubahan schema/data-sensitive:

1. pastikan URL/token mengarah ke database Production yang benar;
2. verifikasi `DATABASE_ENVIRONMENT=production` dari database target;
3. jalankan integrity read-only/preflight bila release belum berada pada kondisi schema mismatch;
4. untuk update schema/runtime gunakan `npm run prod:update`; workflow tersebut membuat verified backup fresh dari schema aktif sebelum mutation;
5. jangan pernah menjalankan migration pada binding `unbound`, Development, atau marker yang tidak cocok.

## 3. Migration current schema

Runtime source saat ini memakai schema v21. **Schema v21 Production harus selesai dan tervalidasi sebelum runtime v21 menerima traffic.** Latest migration canonical ditentukan oleh `database/migrations/` + `DATABASE_SCHEMA_VERSION`, bukan oleh nama section runbook ini.

Operator tidak perlu mengorkestrasi migration dan promotion satu-satu. Jalankan:

```bash
npm run prod:update
```

Workflow canonical akan: (1) build source candidate, (2) membaca schema aktual, (3) membuat backup verified fresh dari schema aktif, (4) menjalankan seluruh migration pending berdasarkan target `schema_version` SQL dalam **satu transaksi atomik**, (5) menjalankan engine/FK/business integrity sebelum commit dan integrity final sesudahnya, (6) mempromosikan **candidate yang sama**, dan (7) menunggu health live menunjukkan schema/runtime current. Jika migration atau integrity dalam transaksi gagal, seluruh perubahan schema rollback ke versi awal. Bila promote gagal setelah schema sudah maju, jalankan kembali command yang sama; migration yang sudah selesai akan di-skip dan candidate dibangun/promote ulang.

## 4. Google OAuth + Firebase Authentication

Production canonical menggunakan Authorization Code flow server-side:

- start: `/api/auth/google/start`;
- callback canonical: `https://saldo-bersama.vercel.app/api/auth/google/callback`;
- state/nonce + PKCE S256 wajib tervalidasi;
- callback menukar Google token ke Firebase Identity Toolkit lalu membuat signed server session;
- localhost/device emulation tetap memakai Firebase popup fallback dan bukan contract Production.

Smoke auth dilakukan pada staged/Production host yang benar, bukan dengan auth bypass.

## 5. Apps Script bridge dan external integration

- Apps Script hanya integration bridge; tidak memiliki business logic finansial.
- Resource Google (Sheets/Calendar/Drive) diuji bila patch menyentuh bridge/integration/outbox.
- Kegagalan mirror/Calendar tidak boleh membatalkan finance transaction yang sudah commit; dead-letter/observability tetap diperiksa.

## 6. Web Push

- VAPID configuration harus lengkap dan valid agar Push aktif.
- In-app Notification Center tetap berfungsi bila Push tidak tersedia.
- Real Android/iOS smoke dilakukan bila release menyentuh Push/PWA/notification delivery.

## 7. Quality dan staged deploy

Sebelum promotion:

```bash
npm run verify
```

Kemudian:

1. push canonical melalui `git push origin main` tanpa bypass pre-push;
2. tunggu GitHub **Quality** PASS;
3. gunakan **staged Vercel Production build**/deployment hasil source commit yang sama;
4. lakukan health/auth/data read smoke sebelum promotion bila workflow Vercel menghasilkan staging URL;
5. promote hanya bila schema, binding, health, dan required smoke sesuai scope PASS.

## 8. Production smoke minimum

- `/api/health`/core health sesuai expected runtime dan environment.
- Login Administrator/Member bekerja sesuai release scope.
- Read account/dashboard tidak menunjukkan schema/binding mismatch.
- Mutation representative domain yang berubah berhasil dengan audit/idempotency yang benar.
- Bila sync-critical: lakukan smoke dua perangkat untuk mutation → revision → selective refresh tanpa restart/hard reload.
- Bila planning-critical: buat Alokasi kosong, tambah Kebutuhan dengan dana cukup, verifikasi Dana Tersedia turun sementara saldo fisik tidak berubah; shortage harus ditolak atomic.
- Bila migration/data-critical: integrity + backup/recovery evidence dicatat.

## 9. Rollback / forward fix

- Frontend/backend rollback hanya boleh diarahkan ke runtime yang kompatibel dengan schema yang sudah aktif.
- Migration tidak dibalik dengan SQL ad-hoc. Ikuti `DATABASE_MIGRATION_POLICY.md`, `ROLLBACK_RUNBOOK.md`, dan `RECOVERY_RUNBOOK.md`.
- Bila schema sudah maju tetapi code rollback tidak kompatibel, lakukan forward-fix atau deploy runtime kompatibel yang sudah diverifikasi.

## 10. Post-deploy

- Pantau health/log/dead-letter/integrity signal sesuai `OBSERVABILITY.md` dan `OPERATIONS_RUNBOOK.md`.
- Update `PROJECT_STATUS.md` hanya jika **current state** berubah; kronologi release masuk `CHANGELOG.md`/Git.
- Jangan menempelkan hasil smoke tanggal tertentu ke runbook canonical.

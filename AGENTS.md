# Instruksi untuk AI dan Coding Agent

File ini berlaku untuk seluruh repository. Tujuannya agar pekerjaan dapat dilanjutkan oleh ChatGPT, coding agent, atau anggota tim lain tanpa mengulang konteks dari awal dan tanpa menebak arsitektur.

## Urutan baca wajib

Sebelum review atau perubahan apa pun, baca:

1. `docs/PROJECT_STATUS.md` — status terakhir, risiko terbuka, dan next step.
2. `docs/PROJECT_HANDOFF.md` — handoff task terakhir.
3. `README.md` dan `docs/INDEX.md`.
4. `docs/ARCHITECTURE.md`, `docs/product/PRODUCT_REQUIREMENTS.md`, dan `docs/product/GLOSSARY.md`.
5. Dokumen kontrak yang relevan: API, authorization, environment, data, security, observability, migration, release, atau recovery.
6. Source aktual dan test pada area yang akan disentuh.

Percakapan lama, screenshot, memory, dan dokumentasi bukan pengganti source. Bila docs berbeda dengan source, prioritaskan source lalu perbaiki docs pada patch yang sama.

## Source of truth

| Area | Canonical source |
|---|---|
| Schema Turso | `database/migrations/*.sql` |
| Action dan role | `api/_lib/security.js` |
| Dispatch action | `api/_lib/actionDispatcher.js` |
| Business rules | `api/_lib/services/*.js` |
| Route UI | `frontend/src/app/App.jsx` |
| Environment | `.env.example` + `docs/ENVIRONMENT_VARIABLES.md` |
| Status project | `docs/PROJECT_STATUS.md` |
| Handoff task | `docs/PROJECT_HANDOFF.md` |
| Keputusan arsitektur | `docs/adr/` |
| Riwayat release | `CHANGELOG.md` |

## Workflow wajib

1. Validasi ZIP/source terbaru dan sebutkan root serta path aktual.
2. Audit penggunaan, import/export, service, schema, test, config, dan docs yang terkait.
3. Temukan root cause; jangan menutup bug data dengan UI.
4. Buat plan file-by-file dan tunggu approval, kecuali user meminta patch eksplisit.
5. Patch kecil, terarah, tanpa formatting massal.
6. Jalankan `npm run validate:source`, `npm run lint`, `npm run test`, `npm run build`, dan test khusus yang relevan.
7. Perbarui `docs/PROJECT_STATUS.md`, `docs/PROJECT_HANDOFF.md`, dan `CHANGELOG.md` pada setiap task yang mengubah project.
8. Perbarui kontrak/ADR/RFC/runbook bila keputusan atau perilaku berubah.
9. Jangan klaim lulus bila command tidak dijalankan.

## Area guarded

Jangan mengubah tanpa approval eksplisit:

- schema/migration Turso;
- Firebase Auth, allowlist, role, authorization;
- action/API contract;
- perhitungan saldo, transfer, audit, soft cancel, idempotency, `row_version`;
- import, export, backup, restore, purge, migration;
- environment, secret, deployment, scheduler;
- timezone Asia/Jakarta dan format Rupiah integer;
- dependency atau stack utama.

Bila file tambahan diperlukan di luar plan, berhenti dan minta approval.

## Aturan keamanan dan data

- Browser tidak tepercaya; actor, role, UID, timestamp, audit field, scope, dan status berasal dari server.
- Turso token, session secret, Google bridge secret, jobs secret, VAPID private key, dan file credential tidak boleh masuk frontend, Git, ZIP, log, issue, atau chat.
- Jangan gunakan `eval`, `new Function`, script injection, command execution, atau `dangerouslySetInnerHTML` tanpa audit dan approval.
- Data finansial normal tidak dihapus permanen.
- Jangan membuat offline write queue.
- Jangan membaca/menulis Google Sheets sebagai database.

## Handoff antar-chat

Setiap task selesai harus meninggalkan jejak yang bisa dibaca chat berikutnya:

- `docs/PROJECT_HANDOFF.md`: apa yang diminta, file berubah, test aktual, risiko, unresolved, next safe step.
- `docs/PROJECT_STATUS.md`: status fitur dan risiko terkini.
- `CHANGELOG.md`: perubahan yang sudah masuk.
- `docs/IMPLEMENTATION_MATRIX.md`: hanya bila status implementasi berubah.
- ADR/RFC: bila ada keputusan lintas arsitektur atau kontrak.

Jangan menyimpan secret, data pengguna, atau isi transaksi nyata pada handoff.

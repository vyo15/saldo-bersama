# Release Checklist

## Pre-release

- [ ] Semua task yang termasuk release sudah `DONE` atau guarded task yang relevan sudah merged.
- [ ] `npm run check` lulus pada Node 24 canonical.
- [ ] Untuk perubahan frontend/browser, `npm run test:browser` lulus penuh; PASS `npm run check` saja belum cukup untuk menyatakan merge-ready.
- [ ] Migration/schema impact direview bila relevan.
- [ ] Backup/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] Migration hanya dijalankan bila disetujui.
- [ ] Smoke test owner/member sesuai scope.
- [ ] Saldo/data integrity diverifikasi bila transaksi/data terdampak.

## Close

- [ ] Commit/tag release dicatat bila digunakan.
- [ ] Known issue/rollback window dicatat.
- [ ] Task terkait sudah di-archive.
- [ ] `PROJECT_STATUS.md` mencerminkan kondisi aktual.

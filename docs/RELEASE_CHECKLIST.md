# Release Checklist

## Pre-release

- [ ] Semua perubahan yang termasuk release sudah disetujui dan validation relevan sudah selesai.
- [ ] Perubahan masuk melalui branch + Pull Request; **Quality / check** wajib PASS sebelum merge ke `main`.
- [ ] `npm run check` lulus pada Node 24 canonical.
- [ ] Untuk perubahan frontend/UI, `npm run verify` lulus dan pemeriksaan manual device/viewport relevan sudah dilakukan; tidak ada automated browser gate.
- [ ] Migration/schema impact direview bila relevan.
- [ ] Backup/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Jika auth mobile berubah, Firebase Authorized Domains dan OAuth redirect URI `https://saldo-bersama.vercel.app/__/auth/handler` sudah diverifikasi tanpa mengubah allowlist/role backend.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] Migration hanya dijalankan bila disetujui.
- [ ] Smoke test Administrator/Member sesuai scope.
- [ ] Login desktop GIS dan login mobile redirect diuji terpisah; mobile harus kembali dari Google ke domain aplikasi lalu membentuk server session tanpa loop atau popup.
- [ ] Saldo/data integrity diverifikasi bila transaksi/data terdampak.

## Close

- [ ] Commit/tag release dicatat bila digunakan.
- [ ] Known issue/rollback window dicatat.
- [ ] Known issue, follow-up, atau pekerjaan tersisa dicatat bila ada.
- [ ] `PROJECT_STATUS.md` mencerminkan kondisi aktual.

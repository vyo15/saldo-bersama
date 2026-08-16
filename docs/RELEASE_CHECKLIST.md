# Release Checklist

## Pre-release

- [ ] Semua perubahan yang termasuk release sudah disetujui dan validation relevan sudah selesai.
- [ ] Perubahan masuk melalui branch + Pull Request; **Quality / check** wajib PASS sebelum merge ke `main`.
- [ ] `npm run check` lulus pada Node 24 canonical.
- [ ] Untuk perubahan frontend/UI, `npm run verify` lulus dan pemeriksaan manual device/viewport relevan sudah dilakukan; tidak ada automated browser gate.
- [ ] Migration/schema impact direview bila relevan.
- [ ] Backup/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Jika auth mobile berubah, Firebase Google provider dan Authorized Domains (`localhost`, `saldo-bersama.vercel.app`) sudah diverifikasi tanpa mengubah allowlist/role backend; flow popup tidak membutuhkan redirect URI custom `/__/auth/handler`.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] Migration hanya dijalankan bila disetujui.
- [ ] Smoke test Administrator/Member sesuai scope.
- [ ] Login desktop GIS dan login mobile Firebase popup diuji terpisah; popup harus dibuka langsung dari tap user, menghasilkan Firebase ID token, membentuk server session, lalu masuk aplikasi tanpa freeze atau double-submit.
- [ ] Saldo/data integrity diverifikasi bila transaksi/data terdampak.

## Close

- [ ] Commit/tag release dicatat bila digunakan.
- [ ] Known issue/rollback window dicatat.
- [ ] Known issue, follow-up, atau pekerjaan tersisa dicatat bila ada.
- [ ] `PROJECT_STATUS.md` mencerminkan kondisi aktual.

# Release Checklist

## Pre-release

- [ ] Semua perubahan yang termasuk release sudah disetujui dan validation relevan sudah selesai.
- [ ] Perubahan masuk melalui branch + Pull Request; **Quality / check** wajib PASS sebelum merge ke `main`.
- [ ] `npm run check` lulus pada Node 24 canonical.
- [ ] Untuk perubahan frontend/UI, `npm run verify` lulus dan pemeriksaan manual device/viewport relevan sudah dilakukan; tidak ada automated browser gate.
- [ ] Migration/schema impact direview bila relevan.
- [ ] Backup/rollback tersedia bila data terdampak.
- [ ] Environment change tervalidasi tanpa menampilkan secret.
- [ ] Jika auth mobile berubah, Firebase Google provider dan Authorized Domains (`localhost`, `saldo-bersama.vercel.app`) sudah diverifikasi tanpa mengubah allowlist/role backend; OAuth Web Client memuat `https://saldo-bersama.vercel.app/__/auth/handler`, Vercel memproxy `/__/auth/*`, dan Service Worker melewatkan `/__/auth/*` tanpa cache/interception.
- [ ] Security/privacy/accessibility/performance review relevan selesai.

## Deploy

- [ ] Production env scope benar.
- [ ] Migration hanya dijalankan bila disetujui.
- [ ] Smoke test Administrator/Member sesuai scope.
- [ ] Login desktop GIS dan login mobile diuji terpisah: production real-device harus berpindah full-page melalui Firebase redirect lalu kembali membentuk server session tanpa freeze/double-submit; localhost/device emulation boleh memakai popup fallback. Pada perangkat yang pernah membuka versi lama, pastikan waiting Service Worker dapat diaktifkan dari `/login` tanpa reload paksa dan sesudah login Vercel mencatat `POST /api/session` sukses.
- [ ] Saldo/data integrity diverifikasi bila transaksi/data terdampak.

## Close

- [ ] Commit/tag release dicatat bila digunakan.
- [ ] Known issue/rollback window dicatat.
- [ ] Known issue, follow-up, atau pekerjaan tersisa dicatat bila ada.
- [ ] `PROJECT_STATUS.md` mencerminkan kondisi aktual.

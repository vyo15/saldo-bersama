# QA Checklist

- [ ] Source terbaru dan migration version diverifikasi.
- [ ] Node/npm sesuai engines.
- [ ] `npm run clean:dry-run` ditinjau; tidak ada secret, dump, `.env`, backup, token, dependency, atau generated output dalam clean ZIP.
- [ ] Build, build budget, lint, frontend test, backend test, dan browser smoke lulus.
- [ ] Owner/member/unauthorized diuji.
- [ ] Seluruh nominal integer dan timezone Asia/Jakarta.
- [ ] Transfer tidak masuk income/expense.
- [ ] Soft cancel, audit, idempotency, dan row-version conflict lulus.
- [ ] Personal account tidak bocor ke member lain.
- [ ] Sheets hanya mirror satu arah dan view-only.
- [ ] Calendar hanya data shared.
- [ ] Excel netral terhadap formula injection.
- [ ] Backup checksum dan restore drill pada salinan terisolasi sementara lulus.
- [ ] Offline write ditolak.
- [ ] PWA iOS/Android, push, safe area, focus, contrast, tap target diuji.
- [ ] Monitoring health/integration queue tidak membocorkan secret.

- [ ] Action registry/policy, authorization map, dan API docs tetap sinkron.
- [ ] Full axe/visual regression dijalankan bila perubahan UI kompleks atau dependency tersedia.

## Product-control alignment

- [ ] Filter transaksi rekening/kategori/pencatat diuji untuk owner dan member.
- [ ] Tren laporan 3/6/12 bulan serta breakdown rekening/kategori/nature/pencatat tervalidasi.
- [ ] Label pencatat tidak disalahartikan sebagai kontribusi atau penanggung biaya.
- [ ] Peringatan budget, kantong, recurring, target, transaksi tanpa alokasi, dan rekonsiliasi diuji.
- [ ] Proyeksi target tidak membagi dengan nol dan menangani tanpa tanggal, lewat jatuh tempo, serta target selesai.
- [ ] Notification dedupe mencegah antrean ganda pada job retry.
- [ ] Semua `REQ-*` terlacak pada implementation matrix.
- [ ] Fitur yang membutuhkan schema hanya memiliki RFC Proposed dan belum mengubah schema v4 tanpa approval terpisah.

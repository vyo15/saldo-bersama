# QA Checklist

- [ ] Source terbaru dan migration version diverifikasi.
- [ ] Node/npm sesuai engines.
- [ ] Tidak ada secret, dump, `.env`, backup, atau token dalam source/ZIP.
- [ ] Build, lint, frontend test, backend test lulus.
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

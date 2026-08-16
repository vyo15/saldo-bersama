# Security Policy

Saldo Bersama memproses data keuangan privat. Temuan security tidak boleh dipublikasikan melalui issue yang memuat detail eksploit, token, data transaksi, atau identitas pengguna.

## Melaporkan temuan

Gunakan GitHub private security advisory pada repository atau kanal privat pemilik repository. Sertakan:

- versi/commit;
- komponen terdampak;
- langkah reproduksi dengan data dummy;
- dampak;
- bukti tanpa secret;
- rekomendasi mitigasi.

Jangan menguji pada data production dengan cara destruktif.

## Prioritas

- Critical: data bocor/rusak, auth bypass, saldo salah luas, restore/purge tidak terkendali.
- High: privilege escalation, IDOR, replay write, backup disclosure, secret exposure.
- Medium: rate-limit weakness, log leakage terbatas, missing hardening.
- Low: defense-in-depth tanpa dampak langsung.

## Respons

Temuan divalidasi, ditriage, dipatch secara terisolasi, diuji, direview sesuai risiko dan aturan repository, lalu dirilis melalui release checklist. Perubahan source masuk melalui branch/Pull Request dan required **Quality** check. Rotasi secret mengikuti `docs/SECRET_ROTATION_RUNBOOK.md`; verifikasi data wajib dilakukan bila credential atau integritas mungkin terdampak.

Rate limiter aplikasi saat ini bersifat best-effort per runtime instance. Ia tetap defense-in-depth, bukan pengganti distributed/platform rate limiting untuk endpoint publik. Aktivasi rate limit platform harus diverifikasi pada Vercel tanpa menambah storage, dependency, atau schema baru secara diam-diam.

Lihat `docs/SECURITY_MODEL.md`, `docs/THREAT_MODEL.md`, dan `docs/INCIDENT_RESPONSE.md`.

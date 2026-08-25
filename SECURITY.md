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

Rate limiter aplikasi memakai dua lapisan: limiter process-local sebagai fast defense-in-depth dan bucket Turso v13 sebagai counter durable lintas Vercel Function instance untuk gateway, export, login Firebase, serta callback/start OAuth valid. Bucket memakai key hash+scope dan tidak menyimpan raw IP/UID/email. Platform/WAF rate limiting tetap dapat ditambahkan sebagai lapisan tambahan untuk traffic publik dan tidak menggantikan authorization, idempotency, atau validasi backend.

Lihat `docs/SECURITY_MODEL.md`, `docs/THREAT_MODEL.md`, dan `docs/INCIDENT_RESPONSE.md`.

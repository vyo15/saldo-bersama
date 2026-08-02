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

Temuan divalidasi, ditriage, dipatch pada branch terpisah, diuji, direview oleh code owner, lalu dirilis melalui release checklist. Rotasi secret dan verifikasi data wajib dilakukan bila credential atau integritas mungkin terdampak.

Lihat `docs/SECURITY_MODEL.md`, `docs/THREAT_MODEL.md`, dan `docs/INCIDENT_RESPONSE.md`.

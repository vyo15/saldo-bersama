# UNVERIFIED Build Report

> **STATUS: FAILED / UNVERIFIED**

Archive `saldo-bersama-env-maintenance-UNVERIFIED.zip` dibuat hanya untuk diagnosis dan pertukaran source. Archive ini **bukan release/deployment artifact** dan tidak boleh dianggap lolos quality gate.

- Waktu (UTC): 2026-08-25T06:06:22.374Z
- Verification step: `preflight/unknown`
- Error code: `VERIFY_NODE_VERSION`
- Exit code: `1`
- Ringkasan: Node 24.18.1 wajib untuk quality gate. Runtime aktif: v22.16.0. Jalankan `fnm use` dari root project lalu ulangi `npm run verify`.

## Cara melanjutkan

1. Perbaiki error quality gate di source utama.
2. Jalankan kembali `npm run zip`.
3. Hanya `saldo-bersama-clean.zip` yang dihasilkan setelah verification PASS yang boleh dianggap verified.
4. File laporan ini hanya ditambahkan ke staging ZIP UNVERIFIED; source project asli tidak diubah olehnya.

## Output verification yang sudah disanitasi

```text
Node 24.18.1 wajib untuk quality gate. Runtime aktif: v22.16.0. Jalankan `fnm use` dari root project lalu ulangi `npm run verify`.
```

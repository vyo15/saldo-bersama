import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  accountCardholderName,
  accountNumberGroups,
  applyBankTemplateToName,
  detectBankTemplate,
  formatAccountNumber,
  normalizeAccountNumber,
} from "../src/features/accounts/accountPresentation.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const webpSize = async (url) => {
  const buffer = await readFile(url);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    const signature = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    assert.notEqual(signature, -1, "header VP8 tidak ditemukan");
    return {
      width: buffer.readUInt16LE(signature + 3) & 0x3fff,
      height: buffer.readUInt16LE(signature + 5) & 0x3fff,
    };
  }
  throw new Error(`Format WebP ${chunk} belum didukung test`);
};

test("template kartu bank dideteksi dari nama rekening tanpa schema presentasi tambahan", () => {
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Rekening gaji · BNI" }), "bni");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Tabungan Bank Central Asia" }), "bca");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Operasional Mandiri" }), "mandiri");
  assert.equal(detectBankTemplate({ account_type: "cash", name: "Kas BNI" }), "generic");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Bank lainnya" }), "generic");
});

test("pemilih template mempertahankan nama pengguna dan mengganti suffix bank secara deterministik", () => {
  assert.equal(accountCardholderName("Vio Yusup Iskandar · BNI"), "Vio Yusup Iskandar");
  assert.equal(accountCardholderName("Vio Yusup Iskandar - BCA"), "Vio Yusup Iskandar");
  assert.equal(applyBankTemplateToName("Rekening gaji", "bni"), "Rekening gaji · BNI");
  assert.equal(applyBankTemplateToName("Rekening gaji · BNI", "bca"), "Rekening gaji · BCA");
  assert.equal(applyBankTemplateToName("Rekening gaji - BCA", "generic"), "Rekening gaji");
  assert.equal(applyBankTemplateToName("", "permata"), "Permata");
});

test("nomor rekening dinormalisasi dan dikelompokkan empat digit untuk kartu", () => {
  assert.equal(normalizeAccountNumber("1234-5678 9012 3456"), "1234567890123456");
  assert.deepEqual(accountNumberGroups("1234567890123456"), ["1234", "5678", "9012", "3456"]);
  assert.deepEqual(accountNumberGroups(""), ["••••", "••••", "••••", "••••"]);
  assert.deepEqual(accountNumberGroups("", { placeholder: false }), []);
  assert.equal(formatAccountNumber("1234567890123456", { placeholder: false }), "1234 5678 9012 3456");
});

test("halaman rekening memakai daftar ringkas, detail terpilih, dan form nomor rekening", async () => {
  const [page, card, pageStyles, cardStyles] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/features/accounts/AccountsPage.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.module.css"),
  ]);

  assert.match(page, /aria-label="Tambah rekening atau kategori"/);
  assert.match(page, /title="Tambah data"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /create-account-form/);
  assert.match(page, /create-category-form/);
  assert.match(page, /account_number/);
  assert.match(page, /<span>No rekening \*<\/span>/);
  assert.match(page, /selectedAccountId/);
  assert.match(page, /mobileDetailOpen/);
  assert.match(page, /variant="detail"/);
  assert.match(pageStyles, /grid-template-columns: minmax\(34rem, 1fr\) minmax\(21rem, 25rem\)/);
  assert.match(pageStyles, /position: sticky/);
  assert.match(pageStyles, /var\(--topbar-height/);

  for (const asset of ["bca", "bni", "btn", "mandiri", "permata"]) assert.match(card, new RegExp(`${asset}\\.webp`));
  assert.match(card, /accountNumberGroups/);
  assert.match(card, /formatAccountNumber/);
  assert.match(card, /navigator\.clipboard\.writeText\(account\.account_number\)/);
  assert.match(card, /variant = "list"/);
  assert.match(card, /variant === "detail"/);
  assert.match(cardStyles, /aspect-ratio: 1\.586 \/ 1/);
  assert.match(cardStyles, /grid-template-columns: 15\.25rem minmax\(0, 1fr\) 1\.5rem/);
  assert.match(cardStyles, /object-fit: fill/);
  assert.match(cardStyles, /font-family: var\(--font-mono\)/);
  assert.match(cardStyles, /\.detailPanel/);
  assert.match(cardStyles, /\.accountSelect/);
  assert.doesNotMatch(cardStyles, /brightness\(0\.42\)/);
});

test("semua asset kartu bank memakai kanvas dan rasio yang sama", async () => {
  for (const name of ["bca", "bni", "btn", "mandiri", "permata"]) {
    const url = new URL(`../src/assets/bank-cards/${name}.webp`, import.meta.url);
    const file = await access(url).then(() => url);
    const [info, dimensions] = await Promise.all([stat(file), webpSize(file)]);
    assert.ok(file, `${name}.webp harus tersedia`);
    assert.ok(info.size <= 160_000, `${name}.webp terlalu besar untuk kartu responsif (${info.size} byte)`);
    assert.deepEqual(dimensions, { width: 768, height: 484 }, `${name}.webp harus memakai kanvas 768x484`);
  }
});

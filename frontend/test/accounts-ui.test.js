import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import { applyBankTemplateToName, detectBankTemplate } from "../src/features/accounts/accountPresentation.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("template kartu bank dideteksi dari nama rekening tanpa schema tambahan", () => {
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Rekening gaji · BNI" }), "bni");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Tabungan Bank Central Asia" }), "bca");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Operasional Mandiri" }), "mandiri");
  assert.equal(detectBankTemplate({ account_type: "cash", name: "Kas BNI" }), "generic");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Bank lainnya" }), "generic");
});

test("pemilih template mempertahankan nama pengguna dan mengganti suffix bank secara deterministik", () => {
  assert.equal(applyBankTemplateToName("Rekening gaji", "bni"), "Rekening gaji · BNI");
  assert.equal(applyBankTemplateToName("Rekening gaji · BNI", "bca"), "Rekening gaji · BCA");
  assert.equal(applyBankTemplateToName("Rekening gaji - BCA", "generic"), "Rekening gaji");
  assert.equal(applyBankTemplateToName("", "permata"), "Permata");
});

test("halaman rekening memakai list-first, kartu finansial, dan satu dialog tambah rekening/kategori", async () => {
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
  assert.match(page, /AccountFinancialCard/);
  assert.doesNotMatch(page, /<section className="two-column-grid">/);
  assert.match(card, /bca\.webp/);
  assert.match(card, /bni\.webp/);
  assert.match(card, /btn\.webp/);
  assert.match(card, /mandiri\.webp/);
  assert.match(card, /permata\.webp/);
  assert.match(pageStyles, /grid-template-columns: repeat\(auto-fit/);
  assert.match(cardStyles, /aspect-ratio: 1\.586 \/ 1/);
});

test("lima asset kartu bank tersedia dan tidak berukuran berlebihan", async () => {
  for (const name of ["bca", "bni", "btn", "mandiri", "permata"]) {
    const url = new URL(`../src/assets/bank-cards/${name}.webp`, import.meta.url);
    const file = await access(url).then(() => url);
    const info = await stat(file);
    assert.ok(file, `${name}.webp harus tersedia`);
    assert.ok(info.size <= 160_000, `${name}.webp terlalu besar untuk kartu responsif (${info.size} byte)`);
  }
});

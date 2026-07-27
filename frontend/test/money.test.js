import test from "node:test";
import assert from "node:assert/strict";
import { assertPositiveRupiah, formatRupiah, parseRupiah } from "../src/domain/money.js";

 test("parseRupiah mengubah format Indonesia menjadi integer", () => {
  assert.equal(parseRupiah("Rp1.250.000"), 1_250_000);
});

test("assertPositiveRupiah menolak nol dan desimal", () => {
  assert.throws(() => assertPositiveRupiah(0));
  assert.throws(() => assertPositiveRupiah(1.5));
});

test("formatRupiah menampilkan nominal tanpa desimal", () => {
  assert.match(formatRupiah(125000), /125\.000/);
});

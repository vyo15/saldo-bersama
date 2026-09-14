import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { flatLoanEstimate, inferFlatAnnualRate } from "../src/features/commitments/commitmentModel.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("bunga flat menghitung pokok, bunga, dan cicilan bulanan dari kondisi sekarang", () => {
  const estimate = flatLoanEstimate({ originalAmount: 300_000_000, totalInstallments: 120, annualRatePercent: 5 });
  assert.deepEqual(estimate, { principal: 2_500_000, interest: 1_250_000, installment: 3_750_000 });
  assert.equal(Number(inferFlatAnnualRate({ originalAmount: 300_000_000, totalInstallments: 120, installmentAmount: 3_750_000 }).toFixed(2)), 5);
});

test("form Kewajiban hanya menampilkan data penting dan tidak menghidupkan lagi UX lama", async () => {
  const page = await read("src/features/commitments/CommitmentsPage.jsx");
  assert.match(page, /Cicilan &amp; Kewajiban/);
  assert.match(page, /Bunga flat \/ tahun/);
  assert.match(page, /Dana sudah cocok dengan Alokasi Dana/);
  assert.match(page, /Hapus kewajiban\?/);
  assert.doesNotMatch(page, /Detail tambahan/);
  assert.doesNotMatch(page, /PlanningNeedField/);
  assert.doesNotMatch(page, /Sudah dibayar berapa kali/);
  assert.doesNotMatch(page, /Arsipkan/);
  assert.doesNotMatch(page, /Autodebet/i);
});

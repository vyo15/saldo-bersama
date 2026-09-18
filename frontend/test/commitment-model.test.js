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
  const [page, api] = await Promise.all([read("src/features/commitments/CommitmentsPage.jsx"), read("src/features/commitments/commitments.api.js")]);
  assert.match(page, /Cicilan &amp; Kewajiban/);
  assert.match(page, /debt && !mortgage \? <FlatInterestField/);
  assert.match(page, /KPR memakai nominal cicilan aktual dari bank/);
  assert.match(page, /installments_paid: form.commitment_type === "mortgage"/);
  assert.match(page, /Pembayaran otomatis aktif/);
  assert.match(page, /Dana akan dibayar dari Alokasi saat jatuh tempo jika mencukupi/);
  assert.match(page, /Hentikan kewajiban\?/);
  assert.match(page, /Hentikan kewajiban/);
  assert.match(page, /Otomatis dari Alokasi/);
  assert.match(api, /archiveCommitment[\s\S]*commitments\.archive/);
  assert.doesNotMatch(api, /deleteCommitment/);
  assert.doesNotMatch(page, /Detail tambahan/);
  assert.doesNotMatch(page, /PlanningNeedField/);
  assert.match(page, /Cicilan berikutnya/);
  assert.match(page, /selesai · .*tersisa/);
  assert.doesNotMatch(page, /Hapus kewajiban|>Hapus<|Dihapus dari daftar Kewajiban/);
  assert.doesNotMatch(page, /Autodebet/i);
  assert.doesNotMatch(page, /auto_debit/);
  assert.match(page, /Pembayaran berikutnya/);
  assert.match(page, /start_date/);
  assert.match(page, /Selesai sesuai kontrak/);
});

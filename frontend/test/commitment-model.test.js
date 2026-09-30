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
  const [page, dialog, createFlow, api] = await Promise.all([read("src/features/commitments/CommitmentsPage.jsx"), read("src/features/commitments/CommitmentDialogLayer.jsx"), read("src/features/commitments/useCommitmentCreateFlow.js"), read("src/features/commitments/commitments.api.js")]);
  const ui = `${page}\n${dialog}`;
  assert.match(page, /<h2>Kewajiban<\/h2>/);
  assert.match(ui, /debt && !mortgage \? <FlatInterestField/);
  assert.match(ui, /KPR memakai nominal cicilan aktual dari bank/);
  assert.match(createFlow, /installments_paid: mortgage \?/);
  assert.match(ui, /Pencatatan otomatis siap/);
  assert.match(ui, /Pembayaran ke bank atau penyedia tetap dilakukan di luar aplikasi/);
  assert.match(ui, /Hentikan kewajiban\?/);
  assert.match(ui, /Hentikan kewajiban/);
  assert.match(page, /Terhubung ke Kebutuhan/);
  assert.match(page, />Bayar<\/ButtonLink>/);
  assert.match(page, /workflowAction: "pay-recurring"/);
  assert.match(api, /archiveCommitment[\s\S]*commitments\.archive/);
  assert.doesNotMatch(api, /deleteCommitment/);
  assert.doesNotMatch(ui, /Detail tambahan/);
  assert.doesNotMatch(ui, /PlanningNeedField/);
  assert.match(ui, /Cicilan berikutnya/);
  assert.match(ui, /selesai · .*tersisa/);
  assert.doesNotMatch(ui, /Hapus kewajiban|>Hapus<|Dihapus dari daftar Kewajiban/);
  assert.doesNotMatch(ui, /Autodebet/i);
  assert.doesNotMatch(ui, /auto_debit/);
  assert.match(ui, /Pembayaran berikutnya/);
  assert.match(ui, /start_date/);
  assert.match(ui, /Selesai sesuai kontrak/);
  assert.match(ui, /Apa yang ingin kamu catat\?/);
  assert.match(ui, /Data utama · Langkah 1 dari 2/);
  assert.match(ui, /Pembayaran · Langkah 2 dari 2/);
  assert.match(ui, /CommitmentTypeChooser/);
  assert.match(createFlow, /workflowAction !== "create-commitment"/);
  assert.match(createFlow, /commitmentType/);
  assert.match(createFlow, /navigate\("\/perencanaan\/kantong"/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { transactionFieldErrorsFromApiError, transactionSubmitFeedback } from "../src/features/transactions/transactionErrorPresentation.js";

test("hanya error server yang benar-benar dimiliki field dipetakan menjadi field error", () => {
  assert.deepEqual(transactionFieldErrorsFromApiError({ code: "CATEGORY_REQUIRED", message: "Kategori wajib dipilih." }), { category_id: "Kategori wajib dipilih." });
  assert.deepEqual(transactionFieldErrorsFromApiError({ code: "SAME_TRANSFER_ACCOUNT", message: "Rekening harus berbeda." }), { destination_account_id: "Rekening harus berbeda." });
  for (const code of ["MUTATION_INTENT_LOCKED", "INSUFFICIENT_BALANCE", "PERIOD_CLOSED", "CONFLICT"]) {
    assert.deepEqual(transactionFieldErrorsFromApiError({ code, message: "diagnostic" }), {});
  }
});

test("mutation safety dan domain error memakai copy manusia tanpa jargon action/request id", () => {
  const locked = transactionSubmitFeedback({ code: "MUTATION_INTENT_LOCKED", message: "raw", details: { action: "transactions.create", requestId: "req-1" } });
  assert.equal(locked.tone, "warning");
  assert.equal(locked.reviewRecommended, true);
  assert.match(`${locked.title} ${locked.message}`, /belum terkonfirmasi/i);
  assert.doesNotMatch(`${locked.title} ${locked.message}`, /transactions\.create|requestId|req-1/i);

  const period = transactionSubmitFeedback({ code: "PERIOD_CLOSED", message: "raw" });
  assert.match(period.title, /Periode sudah ditutup/i);
  assert.doesNotMatch(period.message, /raw/);
});

test("outcome unknown menegaskan retry data yang sama untuk mencegah transaksi ganda", () => {
  const feedback = transactionSubmitFeedback({ code: "OUTCOME_UNKNOWN", message: "raw network error" });
  assert.equal(feedback.tone, "warning");
  assert.match(feedback.message, /data yang sama/i);
  assert.match(feedback.message, /transaksi ganda/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import { requiresPostSaveDecision } from "../src/features/transactions/transactionPostSavePolicy.js";

test("hanya pemasukan dan transfer membuka keputusan lanjutan setelah server mengonfirmasi transaksi", () => {
  assert.equal(requiresPostSaveDecision(TRANSACTION_TYPES.INCOME), true);
  assert.equal(requiresPostSaveDecision(TRANSACTION_TYPES.TRANSFER), true);
  assert.equal(requiresPostSaveDecision(TRANSACTION_TYPES.EXPENSE), false);
  assert.equal(requiresPostSaveDecision(TRANSACTION_TYPES.REFUND), false);
  assert.equal(requiresPostSaveDecision("unknown"), false);
});

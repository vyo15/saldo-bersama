import assert from "node:assert/strict";
import test from "node:test";
import {
  investmentContinuationState,
  investmentRdnAccountSetupState,
  readInvestmentContinuation,
} from "../src/shared/workflows/investmentContinuation.js";

test("continuation Investasi mempertahankan payload draft dan return path internal", () => {
  const draft = { instrument_id: "bbca", lots: "20", trade_date: "2026-09-02", notes: "draft" };
  const state = investmentContinuationState({ action: "buy", returnTo: "/investasi", payload: { portfolioId: "p1", draft } });
  const parsed = readInvestmentContinuation(state);

  assert.equal(parsed.action, "buy");
  assert.equal(parsed.returnTo, "/investasi");
  assert.deepEqual(parsed.payload.draft, draft);
  assert.equal(state.workflowAction, "continue-after-rdn-funding");
});

test("continuation Investasi membaca kontrak legacy account setup tanpa merusak accountPrefill", () => {
  const setup = investmentRdnAccountSetupState();
  assert.deepEqual(setup.accountPrefill, { account_type: "investment" });
  assert.equal(readInvestmentContinuation(setup).action, "create-rdn");

  const legacy = readInvestmentContinuation({ workflowSource: "accounts", workflowAction: "setup-portfolio", rdnAccountId: "rdn-1" });
  assert.equal(legacy.action, "setup-portfolio");
  assert.equal(legacy.payload.rdnAccountId, "rdn-1");
});

test("continuation Investasi tidak menerima returnTo eksternal atau protocol-relative", () => {
  const external = readInvestmentContinuation({ source: "investment", action: "buy", returnTo: "https://example.com", payload: {} });
  const protocolRelative = readInvestmentContinuation({ source: "investment", action: "buy", returnTo: "//example.com", payload: {} });
  assert.equal(external.returnTo, "/investasi");
  assert.equal(protocolRelative.returnTo, "/investasi");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("initial state, read dedupe, dan cache tetap privat per sesi", async () => {
  const [client, finance, gateway] = await Promise.all([
    source("frontend/src/services/api/client.js"),
    source("frontend/src/app/FinanceContext.jsx"),
    source("api/gateway.js"),
  ]);
  assert.match(client, /const readCache = new Map\(\)/);
  assert.match(client, /const inFlightReads = new Map\(\)/);
  assert.match(client, /setSessionScope\(nextScope\)/);
  assert.match(client, /clearReadState\(\)/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|caches\.open/);
  assert.match(finance, /apiClient\.request\("app\.initialState"/);
  assert.doesNotMatch(finance, /await apiClient\.request\("bootstrap\.get"[\s\S]*await apiClient\.request\("dashboard\.overview"/);
  assert.match(gateway, /session\.uid, session\.role, action/);
  assert.match(gateway, /gateway\.request\.coalesced/);
});

test("schema cache hanya positif dan write tetap melalui mutating guard", async () => {
  const [schema, code] = await Promise.all([
    source("apps-script/Schema.gs"),
    source("apps-script/Code.gs"),
  ]);
  assert.match(schema, /SB_SCHEMA_VALIDATION_CACHE_SECONDS = 30/);
  assert.match(schema, /if \(!issues\.length && cache\)[\s\S]*cache\.put/);
  assert.match(schema, /invalidateSchemaValidationCache_/);
  assert.match(code, /canUseCachedSchemaValidation_\(action\) \? validateSchemaCached_\(\) : validateSchema_\(\)/);
  assert.match(code, /const mutating = isMutatingAction_\(signed\.action\)/);
  assert.match(code, /stageTimings/);
});

test("theme memakai surface hierarchy dan kontrol aksesibel", async () => {
  const [tokens, components, transactionForm] = await Promise.all([
    source("frontend/src/styles/tokens.css"),
    source("frontend/src/styles/components.css"),
    source("frontend/src/features/transactions/TransactionForm.jsx"),
  ]);
  for (const token of ["--surface-elevated", "--input", "--border-strong", "--focus-ring"]) assert.match(tokens, new RegExp(token));
  assert.match(components, /min-height:\s*44px/);
  assert.match(components, /:focus-visible/);
  assert.match(components, /prefers-reduced-motion/);
  assert.match(transactionForm, /aria-expanded=\{detailsOpen\}/);
  assert.match(transactionForm, /formatDateLongIndonesia/);
});

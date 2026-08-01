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
  assert.match(finance, /initialError\.code === "IDENTITY_BIND_REQUIRED"[\s\S]*apiClient\.request\("bootstrap\.get"[\s\S]*apiClient\.request\("app\.initialState"/);
  assert.match(finance, /apiClient\.seed\("dashboard\.overview"/);
  assert.doesNotMatch(finance, /Promise\.all\(\[[\s\S]*apiClient\.request\("bootstrap\.get"[\s\S]*apiClient\.request\("dashboard\.overview"/);
  assert.doesNotMatch(gateway, /COALESCED_READ_ACTIONS[\s\S]{0,500}"bootstrap\.get"/);
  assert.match(gateway, /"reconciliations\.list"/);
  assert.match(gateway, /session\.uid, session\.role, action/);
  assert.match(gateway, /gateway\.request\.coalesced/);
});

test("schema cache hanya positif dan write tetap melalui mutating guard", async () => {
  const [schema, code] = await Promise.all([
    source("apps-script/Schema.gs"),
    source("apps-script/Code.gs"),
  ]);
  assert.match(schema, /SB_SCHEMA_VALIDATION_CACHE_SECONDS = 300;/);
  assert.match(schema, /"reconciliations\.list"/);
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

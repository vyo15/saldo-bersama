import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const requiredFiles = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/INDEX.md",
  "docs/PROJECT_STATUS.md",
  "docs/PROJECT_HANDOFF.md",
  "docs/product/PRODUCT_REQUIREMENTS.md",
  "docs/product/GLOSSARY.md",
  "docs/API_CONTRACT.md",
  "docs/AUTHORIZATION_MATRIX.md",
  "docs/DATA_DICTIONARY.md",
  "docs/DATABASE_MIGRATION_POLICY.md",
  "docs/SECURITY_MODEL.md",
  "docs/THREAT_MODEL.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/INCIDENT_RESPONSE.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/ROLLBACK_RUNBOOK.md",
  "docs/LOG_EVENT_CATALOG.md",
  "docs/adr/README.md",
  "docs/rfc/README.md",
  "docs/rfc/RFC_TEMPLATE.md",
  "docs/templates/TASK_HANDOFF_TEMPLATE.md",
];

const quotedStrings = (source) => [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

test("governance foundation files exist", () => {
  requiredFiles.forEach((relative) => {
    assert.equal(existsSync(path.join(root, relative)), true, `Missing governance file: ${relative}`);
  });
});

test("README and agent instructions point to canonical handoff", () => {
  const readme = read("README.md");
  const agents = read("AGENTS.md");
  ["AGENTS.md", "docs/PROJECT_STATUS.md", "docs/PROJECT_HANDOFF.md", "docs/INDEX.md"]
    .forEach((reference) => assert.match(readme, new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  ["docs/PROJECT_STATUS.md", "docs/PROJECT_HANDOFF.md", "CHANGELOG.md"]
    .forEach((reference) => assert.match(agents, new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("every canonical action is documented in API and authorization contracts", () => {
  const security = read("api/_lib/security.js");
  const permissionsBlock = security.match(/export const ACTION_PERMISSIONS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(permissionsBlock, "ACTION_PERMISSIONS block not found");
  const actions = [...new Set(quotedStrings(permissionsBlock[1]).filter((value) => value.includes(".")))].sort();
  assert.ok(actions.length > 0, "No canonical actions extracted");

  const apiContract = read("docs/API_CONTRACT.md");
  const authorization = read("docs/AUTHORIZATION_MATRIX.md");
  actions.forEach((action) => {
    assert.ok(apiContract.includes(`\`${action}\``), `Action missing from API contract: ${action}`);
    assert.ok(authorization.includes(`\`${action}\``), `Action missing from authorization matrix: ${action}`);
  });
});

test("every migration table is documented in the data dictionary", () => {
  const migration = read("database/migrations/001_initial_schema.sql");
  const tables = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
  const dictionary = read("docs/DATA_DICTIONARY.md");
  assert.ok(tables.length > 0, "No migration tables extracted");
  tables.forEach((table) => {
    assert.ok(dictionary.includes(`\`${table}\``), `Table missing from data dictionary: ${table}`);
  });
});

test("every canonical environment key is documented", () => {
  const example = read(".env.example");
  const keys = example
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean);
  const environmentDocs = read("docs/ENVIRONMENT_VARIABLES.md");
  keys.forEach((key) => {
    assert.ok(environmentDocs.includes(`\`${key}\``), `Environment key missing from docs: ${key}`);
  });
});

test("environment policy uses Vercel Production only and local env never pulls cloud secrets", () => {
  const example = read(".env.example");
  const environmentDocs = read("docs/ENVIRONMENT_VARIABLES.md");
  const bootstrap = read("scripts/bootstrap-development-env.mjs");
  const setup = read("docs/SETUP.md");

  for (const source of [example, environmentDocs, setup]) {
    assert.match(source, /Production/);
    assert.doesNotMatch(source, /Development \+ Production|Production \+ Development|Vercel Development Environment/);
  }
  assert.match(environmentDocs, /Preview dan Development/);
  assert.doesNotMatch(bootstrap, /vercel|env.*pull|VERCEL_OIDC_TOKEN/i);
  assert.match(bootstrap, /\.env\.local/);
});

test("project status records active schema version and guarded shared database decision", () => {
  const status = read("docs/PROJECT_STATUS.md");
  assert.match(status, /Schema:\*\* version 3/);
  assert.match(status, /Runtime lokal dan Vercel Production memakai satu database Turso/);
});

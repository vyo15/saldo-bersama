import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CORE_RUNTIME_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
} from "../../scripts/runtime-environment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => existsSync(path.join(root, relative));

const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/INDEX.md",
  "docs/DOCUMENT_LIFECYCLE.md",
  "docs/PROJECT_STATUS.md",
  "docs/PROJECT_HANDOFF.md",
  "docs/ARCHITECTURE.md",
  "docs/ENVIRONMENT_VARIABLES.md",
  "docs/TURSO_SCHEMA.md",
  "docs/SETUP.md",
  "docs/GIT_WORKFLOW.md",
  "docs/DEFINITION_OF_READY.md",
  "docs/DEFINITION_OF_DONE.md",
  "docs/product/PRODUCT_REQUIREMENTS.md",
  "docs/product/GLOSSARY.md",
  "docs/product/OUT_OF_SCOPE.md",
  "docs/product/ROADMAP.md",
  "docs/API_CONTRACT.md",
  "docs/AUTHORIZATION_MATRIX.md",
  "docs/DATA_DICTIONARY.md",
  "docs/DATABASE_MIGRATION_POLICY.md",
  "docs/LEGACY_SHEETS_TO_TURSO_CUTOVER.md",
  "docs/SECURITY_MODEL.md",
  "docs/THREAT_MODEL.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/INCIDENT_RESPONSE.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/ROLLBACK_RUNBOOK.md",
  "docs/LOG_EVENT_CATALOG.md",
  "docs/UI_DESIGN_SYSTEM.md",
  "docs/adr/README.md",
  "docs/rfc/README.md",
  "docs/rfc/RFC_TEMPLATE.md",
  "docs/rfc/0011-transaction-lifecycle-receipts-and-usage.md",
  "docs/rfc/0012-debt-receivable-ledger.md",
  "docs/rfc/0013-contribution-and-cost-sharing.md",
  "docs/rfc/0014-category-hierarchy-and-goal-stages.md",
  "docs/rfc/0015-granular-personal-privacy.md",
  "docs/rfc/0016-partner-planning-permissions.md",
  "docs/templates/TASK_HANDOFF_TEMPLATE.md",
];

const quotedStrings = (source) => [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const referencedMarkdownFiles = (relative) => {
  const source = read(relative);
  const references = new Set();
  for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) references.add(match[1]);
  for (const match of source.matchAll(/`([^`]+\.md)`/g)) references.add(match[1]);
  return [...references]
    .filter((reference) => !/^(?:https?:|mailto:)/i.test(reference))
    .map((reference) => path.normalize(path.join(path.dirname(relative), reference)).replaceAll("\\", "/"));
};

test("governance foundation and required-reading files exist", () => {
  requiredFiles.forEach((relative) => {
    assert.equal(exists(relative), true, `Missing governance file: ${relative}`);
  });
});

test("README, AGENTS, and documentation index contain no broken local Markdown references", () => {
  for (const source of ["README.md", "AGENTS.md", "docs/INDEX.md"]) {
    for (const target of referencedMarkdownFiles(source)) {
      assert.equal(exists(target), true, `Broken Markdown reference in ${source}: ${target}`);
    }
  }
});

test("README and agent instructions point to canonical handoff", () => {
  const readme = read("README.md");
  const agents = read("AGENTS.md");
  ["AGENTS.md", "docs/PROJECT_STATUS.md", "docs/PROJECT_HANDOFF.md", "docs/INDEX.md"]
    .forEach((reference) => assert.match(readme, new RegExp(escapeRegExp(reference))));
  ["docs/PROJECT_STATUS.md", "docs/PROJECT_HANDOFF.md", "CHANGELOG.md"]
    .forEach((reference) => assert.match(agents, new RegExp(escapeRegExp(reference))));
});

test("documentation index exposes product boundaries, roadmap, and task handoff template", () => {
  const index = read("docs/INDEX.md");
  for (const reference of [
    "product/OUT_OF_SCOPE.md",
    "product/ROADMAP.md",
    "templates/TASK_HANDOFF_TEMPLATE.md",
    "UI_DESIGN_SYSTEM.md",
  ]) assert.match(index, new RegExp(escapeRegExp(reference)));
});

test("contribution policy and Git workflow cross-reference each other", () => {
  assert.match(read("CONTRIBUTING.md"), /docs\/GIT_WORKFLOW\.md/);
  assert.match(read("docs/GIT_WORKFLOW.md"), /\.\.\/CONTRIBUTING\.md/);
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

test("every migration table is documented in both schema overview and data dictionary", () => {
  const migration = read("database/migrations/001_initial_schema.sql");
  const tables = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
  const dictionary = read("docs/DATA_DICTIONARY.md");
  const schemaOverview = read("docs/TURSO_SCHEMA.md");
  assert.ok(tables.length > 0, "No migration tables extracted");
  tables.forEach((table) => {
    assert.ok(dictionary.includes(`\`${table}\``), `Table missing from data dictionary: ${table}`);
    assert.ok(schemaOverview.includes(`\`${table}\``), `Table missing from Turso schema overview: ${table}`);
  });
});

test("every canonical environment key is documented and classifications use one source", () => {
  const example = read(".env.example");
  const keys = example
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean);
  const environmentDocs = read("docs/ENVIRONMENT_VARIABLES.md");
  keys.forEach((key) => {
    assert.ok(environmentDocs.includes(`\`${key}\``), `Environment key missing from docs: ${key}`);
  });
  assert.equal(CORE_RUNTIME_ENV_KEYS.length, 8);
  assert.deepEqual(OPTIONAL_LOGGING_ENV_KEYS, ["LOG_LEVEL"]);
  assert.deepEqual(PRODUCTION_SYNC_ENV_KEYS, [...CORE_RUNTIME_ENV_KEYS, ...OPTIONAL_LOGGING_ENV_KEYS]);
  assert.match(environmentDocs, /delapan key core wajib dan satu key logging opsional/);
  assert.doesNotMatch(environmentDocs, /sembilan key core/i);
});

test("environment policy uses Vercel Development as guarded local bootstrap", () => {
  const environmentDocs = read("docs/ENVIRONMENT_VARIABLES.md");
  const bootstrap = read("scripts/bootstrap-development-env.mjs");
  const setup = read("docs/SETUP.md");
  const packageJson = read("package.json");

  for (const source of [environmentDocs, setup]) {
    assert.match(source, /Vercel Development/);
    assert.match(source, /npm run dev/);
  }
  assert.match(environmentDocs, /Production dan Development/);
  assert.match(environmentDocs, /VERCEL_OIDC_TOKEN/);
  assert.match(bootstrap, /env", "pull"/);
  assert.match(bootstrap, /cleanEnvironmentText/);
  assert.match(bootstrap, /VERCEL_DEVELOPMENT_ENV_INCOMPLETE/);
  assert.match(packageJson, /env:push:development/);
  assert.doesNotMatch(bootstrap, /args:\s*\[[^\]]*"env"[^\]]*"pull"[^\]]*"production"/is);
});

test("project status records active schema version and guarded shared database decision", () => {
  const status = read("docs/PROJECT_STATUS.md");
  assert.match(status, /Schema:\*\* version 3/);
  assert.match(status, /Runtime lokal dan Vercel Production memakai satu database Turso/);
});


test("every canonical product requirement is tracked in the implementation matrix", () => {
  const requirements = read("docs/product/PRODUCT_REQUIREMENTS.md");
  const implementationMatrix = read("docs/IMPLEMENTATION_MATRIX.md");
  const requirementIds = [...new Set(requirements.match(/\bREQ-[A-Z]+-\d{2,3}\b/g) ?? [])].sort();

  assert.ok(requirementIds.length >= 17, "Canonical product requirement IDs were not found");
  requirementIds.forEach((requirementId) => {
    assert.ok(
      implementationMatrix.includes(`\`${requirementId}\``),
      `Requirement missing from implementation matrix: ${requirementId}`,
    );
  });
});

test("planned schema-changing product gaps are represented by proposed RFCs", () => {
  const roadmap = read("docs/product/ROADMAP.md");
  const rfcIndex = read("docs/rfc/README.md");
  const rfcFiles = [
    "0011-transaction-lifecycle-receipts-and-usage.md",
    "0012-debt-receivable-ledger.md",
    "0013-contribution-and-cost-sharing.md",
    "0014-category-hierarchy-and-goal-stages.md",
    "0015-granular-personal-privacy.md",
    "0016-partner-planning-permissions.md",
  ];

  rfcFiles.forEach((relative) => {
    const rfcId = `RFC-${relative.slice(0, 4)}`;
    const rfcSource = read(`docs/rfc/${relative}`);
    assert.match(rfcIndex, new RegExp(escapeRegExp(relative)));
    assert.match(roadmap, new RegExp(escapeRegExp(rfcId)));
    assert.match(rfcSource, new RegExp(`^# ${escapeRegExp(rfcId)}\\b`, "m"));
    assert.match(rfcSource, /Status:\*{0,2}\s*Proposed/i);
  });
});

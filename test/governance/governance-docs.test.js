import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACTION_POLICIES } from "../../api/_lib/actions/policy.js";
import { DATABASE_SCHEMA_VERSION } from "../../api/_lib/db/schema.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";
import {
  CORE_RUNTIME_ENV_KEYS,
  GOOGLE_BRIDGE_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_AUTH_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
  WEB_PUSH_ENV_KEYS,
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
  "docs/WORKFLOW.md",
  "docs/GIT_WORKFLOW.md",
  "docs/GITHUB_RULESET.md",
  "docs/SECRET_ROTATION_RUNBOOK.md",
  "docs/ARCHITECTURE.md",
  "docs/ENVIRONMENT_VARIABLES.md",
  "docs/TURSO_SCHEMA.md",
  "docs/SETUP.md",
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
];

const retiredTaskFiles = [
  "docs/tasks/README.md",
  "docs/templates/TASK_TEMPLATE.md",
  "scripts/validate-task.mjs",
  "scripts/list-tasks.mjs",
  "scripts/finish-task.mjs",
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
  requiredFiles.forEach((relative) => assert.equal(exists(relative), true, `Missing governance file: ${relative}`));
});

test("README, AGENTS, and documentation index contain no broken local Markdown references", () => {
  for (const source of ["README.md", "AGENTS.md", "docs/INDEX.md"]) {
    for (const target of referencedMarkdownFiles(source)) {
      assert.equal(exists(target), true, `Broken Markdown reference in ${source}: ${target}`);
    }
  }
});

test("direct main workflow memakai pre-push fail-closed dan retired task automation tetap absent", () => {
  const packageJson = JSON.parse(read("package.json"));
  const combined = [read("README.md"), read("AGENTS.md"), read("docs/WORKFLOW.md"), read("docs/GIT_WORKFLOW.md"), read("docs/GITHUB_RULESET.md"), read("docs/DEFINITION_OF_DONE.md")].join("\n");
  assert.match(combined, /git add \.?/);
  assert.match(combined, /git push origin main/);
  assert.match(combined, /pre-push/i);
  assert.match(combined, /Quality/);
  assert.doesNotMatch(read("docs/GIT_WORKFLOW.md"), /git push -u origin HEAD/);
  assert.doesNotMatch(read("docs/GIT_WORKFLOW.md"), /Pull Request.*canonical/is);
  assert.equal(packageJson.scripts["task:check"], undefined);
  assert.equal(packageJson.scripts["task:list"], undefined);
  assert.equal(packageJson.scripts["task:finish"], undefined);
  assert.equal(packageJson.scripts.check, undefined);
  retiredTaskFiles.forEach((relative) => assert.equal(exists(relative), false, `Retired task file returned: ${relative}`));
});

test("PR template tetap tersedia untuk review opsional tanpa mengganti direct main workflow", () => {
  const template = read(".github/PULL_REQUEST_TEMPLATE.md");
  assert.match(template, /Quality \/ check/);
  assert.match(template, /PR bersifat opsional/);
  assert.match(template, /git push origin main/);
});

test("documentation index exposes product boundaries and guarded delivery workflow", () => {
  const index = read("docs/INDEX.md");
  assert.match(index, /docs\/tasks\/archive\//);
  assert.doesNotMatch(index, /`tasks\/archive\/`/);
  for (const reference of ["product/OUT_OF_SCOPE.md", "product/ROADMAP.md", "WORKFLOW.md", "GIT_WORKFLOW.md", "GITHUB_RULESET.md", "SECRET_ROTATION_RUNBOOK.md", "UI_DESIGN_SYSTEM.md", "../database/README.md", "../apps-script/README.md"]) {
    assert.match(index, new RegExp(escapeRegExp(reference)));
  }
  assert.doesNotMatch(index, /tasks\/README|TASK_TEMPLATE/);
});

test("contribution policy and Git workflow cross-reference each other", () => {
  assert.match(read("CONTRIBUTING.md"), /docs\/GIT_WORKFLOW\.md/);
  assert.match(read("docs/GIT_WORKFLOW.md"), /\.\.\/CONTRIBUTING\.md/);
});

test("legacy global handoff files remain retired and task archives are historical only", () => {
  assert.equal(exists("docs/PROJECT_HANDOFF.md"), false);
  assert.equal(exists("docs/TEAM_OWNERSHIP.md"), false);
  assert.equal(exists("docs/templates/TASK_HANDOFF_TEMPLATE.md"), false);
  assert.match(read("docs/DOCUMENT_LIFECYCLE.md"), /docs\/tasks\/archive\/.*workflow lama/i);
});


test("active workflow docs do not require retired task-card lifecycle", () => {
  const activeDocs = [
    read("SECURITY.md"),
    read("docs/DEFINITION_OF_READY.md"),
    read("docs/RELEASE_CHECKLIST.md"),
  ];
  for (const source of activeDocs) {
    assert.doesNotMatch(source, /Task ID dan branch jelas/i);
    assert.doesNotMatch(source, /task menjadi `APPROVED` atau `IN_PROGRESS`/i);
    assert.doesNotMatch(source, /Task terkait sudah di-archive/i);
    assert.doesNotMatch(source, /dipatch pada branch terpisah/i);
  }
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



test("API contract mode dan idempotency mengikuti canonical action policy", () => {
  const apiContract = read("docs/API_CONTRACT.md");
  const rows = new Map();
  for (const line of apiContract.split(/\r?\n/)) {
    const match = line.match(/^\| `([^`]+)` \| (Ya|Tidak) \| (Ya|Tidak) \| ([^|]+?) \| (Wajib|Tidak) \|/);
    if (match) rows.set(match[1], { mode: match[4].trim(), idempotency: match[5] });
  }
  const modeLabel = { read: "Read", write: "Write/operation", external: "External/operation" };
  for (const [action, policy] of Object.entries(ACTION_POLICIES)) {
    const row = rows.get(action);
    assert.ok(row, `API contract row missing for ${action}`);
    assert.equal(row.mode, modeLabel[policy.mode], `API mode drift for ${action}`);
    assert.equal(row.idempotency, policy.idempotencyRequired ? "Wajib" : "Tidak", `API idempotency drift for ${action}`);
  }
});

test("API dan authorization docs mengikuti canonical Administrator/Member permissions", () => {
  const parseRows = (source) => {
    const rows = new Map();
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\| `([^`]+)` \| (Ya|Tidak) \| (Ya|Tidak) \|/);
      if (match) rows.set(match[1], { owner: match[2], member: match[3] });
    }
    return rows;
  };
  const apiRows = parseRows(read("docs/API_CONTRACT.md"));
  const authorizationRows = parseRows(read("docs/AUTHORIZATION_MATRIX.md"));
  for (const action of Object.keys(ACTION_POLICIES)) {
    const expected = {
      owner: ACTION_PERMISSIONS.owner.has(action) ? "Ya" : "Tidak",
      member: ACTION_PERMISSIONS.member.has(action) ? "Ya" : "Tidak",
    };
    assert.deepEqual(apiRows.get(action), expected, `API permission drift for ${action}`);
    assert.deepEqual(authorizationRows.get(action), expected, `Authorization matrix drift for ${action}`);
  }
});


test("every migration table is documented in both schema overview and data dictionary", () => {
  const migrationFiles = readdirSync(path.join(root, "database/migrations"))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  const migrations = migrationFiles.map((name) => read(`database/migrations/${name}`)).join("\n");
  const tables = [...new Set([...migrations.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g)].map((match) => match[1]))];
  const dictionary = read("docs/DATA_DICTIONARY.md");
  const schemaOverview = read("docs/TURSO_SCHEMA.md");
  assert.ok(tables.length > 0, "No migration tables extracted");
  tables.forEach((table) => {
    assert.ok(dictionary.includes(`\`${table}\``), `Table missing from data dictionary: ${table}`);
    assert.ok(schemaOverview.includes(`\`${table}\``), `Table missing from Turso schema overview: ${table}`);
  });
});


test("schema docs track runtime version and latest migration", () => {
  const migrationFiles = readdirSync(path.join(root, "database/migrations"))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  const latestMigration = migrationFiles.at(-1);
  assert.ok(latestMigration, "Latest migration not found");

  const schemaOverview = read("docs/TURSO_SCHEMA.md");
  const dictionary = read("docs/DATA_DICTIONARY.md");
  const testPlan = read("docs/TEST_PLAN.md");
  const projectStatus = read("docs/PROJECT_STATUS.md");

  assert.ok(schemaOverview.includes(`\`${latestMigration}\``), `Latest migration missing from TURSO_SCHEMA: ${latestMigration}`);
  assert.ok(dictionary.includes(`\`${latestMigration}\``), `Latest migration missing from DATA_DICTIONARY: ${latestMigration}`);
  assert.ok(schemaOverview.includes(`Versi aktif: \`${DATABASE_SCHEMA_VERSION}\``));
  assert.ok(testPlan.includes(`Schema Production harus versi ${DATABASE_SCHEMA_VERSION}`));
  assert.ok(projectStatus.includes(`**Active schema contract:** v${DATABASE_SCHEMA_VERSION}`));
});

test("canonical transaction and balance parity contracts are documented", () => {
  const apiContract = read("docs/API_CONTRACT.md");
  const architecture = read("docs/ARCHITECTURE.md");
  const securityModel = read("docs/SECURITY_MODEL.md");
  const testPlan = read("docs/TEST_PLAN.md");

  for (const source of [apiContract, architecture, securityModel]) {
    assert.ok(source.includes("api/_lib/transactionContract.js"));
  }
  assert.match(securityModel, /identityRateLimitKey/);
  assert.match(securityModel, /process-local/);
  assert.match(testPlan, /visibleAccounts\(\)/);
  assert.match(testPlan, /accountBalanceAsOf\(\)/);
  assert.match(testPlan, /parity/i);
});

test("API action source mappings document registry-owned wrappers", () => {
  const lines = read("docs/API_CONTRACT.md").split(/\r?\n/);
  const actionRow = (action) => lines.find((line) => line.startsWith(`| \`${action}\` |`)) || "";

  assert.ok(actionRow("system.health").includes("`api/_lib/actions/registry.js`"));
  for (const action of ["calendar.sync", "mirror.sync", "mirror.rebuild"]) {
    const row = actionRow(action);
    assert.ok(row.includes("`api/_lib/actions/registry.js`"), `Registry source missing for ${action}`);
    assert.ok(row.includes("`api/_lib/services/integrations.js`"), `Integration service source missing for ${action}`);
  }
  const integrationStatusRow = actionRow("integrations.status");
  assert.ok(integrationStatusRow.includes("`api/_lib/services/integrations.js`"));
  assert.doesNotMatch(integrationStatusRow, /dispatcher|actions\/registry/);
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
  assert.equal(CORE_RUNTIME_ENV_KEYS.length, 10);
  assert.deepEqual(OPTIONAL_LOGGING_ENV_KEYS, ["LOG_LEVEL"]);
  assert.deepEqual(PRODUCTION_SYNC_ENV_KEYS, [
    ...CORE_RUNTIME_ENV_KEYS,
    ...PRODUCTION_AUTH_ENV_KEYS,
    ...OPTIONAL_LOGGING_ENV_KEYS,
    ...GOOGLE_BRIDGE_ENV_KEYS,
    ...WEB_PUSH_ENV_KEYS,
  ]);
  assert.match(environmentDocs, /sepuluh key core wajib dan satu key logging opsional/);
  assert.match(environmentDocs, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(environmentDocs, /Production Sensitive|Sensitive/);
  assert.match(environmentDocs, /Web Push wajib lengkap dan valid/i);
  assert.doesNotMatch(environmentDocs, /delapan key core/i);
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
  assert.match(packageJson, /env:pull:development/);
  assert.match(packageJson, /env:status/);
  assert.doesNotMatch(packageJson, /env:push:development:settings/);
  assert.match(environmentDocs, /npm run env:push:development -- --settings-only/);
  assert.match(environmentDocs, /Matriks nilai yang sama vs berbeda/);
  assert.match(environmentDocs, /VAPID[\s\S]*berbeda per environment/i);
  assert.match(bootstrap, /Memperbarui environment canonical dari Vercel Development/);
  assert.match(bootstrap, /satu Turso database dipakai bersamaan oleh Development dan Production/);
  assert.match(setup, /npm run db:bind-environment -- development/);
  assert.match(setup, /jangan melakukan rebind silang/i);
  assert.doesNotMatch(bootstrap, /args:\s*\[[^\]]*"env"[^\]]*"pull"[^\]]*"production"/is);
});

test("project status is a current-state snapshot with runtime schema and environment isolation guard", () => {
  const status = read("docs/PROJECT_STATUS.md");
  const packageJson = JSON.parse(read("package.json"));
  const productionSync = read("scripts/push-vercel-production-env.mjs");
  const developmentSync = read("scripts/push-vercel-development-env.mjs");
  const singleDbAdr = read("docs/adr/0007-single-turso-database-current-constraint.md");

  assert.ok(status.includes(`**Active schema contract:** v${DATABASE_SCHEMA_VERSION}`));
  assert.match(status, /DATABASE_ENVIRONMENT/);
  assert.match(status, /ADR-0007.*historis|ADR-0007.*Superseded/i);
  assert.match(status, /bukan jurnal perubahan/i);
  assert.match(singleDbAdr, /Status:\*\* Superseded/);
  assert.match(singleDbAdr, /tidak lagi menjadi runtime yang didukung/);
  assert.match(singleDbAdr, /Development dan Production.*terpisah/i);
  assert.match(productionSync, /envPath = path\.join\(cwd, "\.env\.production\.local"\)/);
  assert.match(developmentSync, /envPath = path\.join\(cwd, "\.env\.local"\)/);
  assert.equal(packageJson.scripts["db:bind-environment"], "node scripts/db-bind-environment.mjs");
  assert.equal(exists("scripts/db-bind-environment.mjs"), true);
  assert.equal(exists("docs/adr/0011-separated-development-production-turso.md"), false);
});


test("current docs track branded desktop/mobile server OAuth production, runtime schema, dan manual accessibility QA", () => {
  const matrix = read("docs/IMPLEMENTATION_MATRIX.md");
  const deployment = read("docs/DEPLOYMENT.md");
  const status = read("docs/PROJECT_STATUS.md");
  const testPlan = read("docs/TEST_PLAN.md");
  const release = read("docs/RELEASE_CHECKLIST.md");

  assert.doesNotMatch(matrix, /Chromium smoke/);
  assert.match(matrix, /semantic\/static regression/);
  assert.match(matrix, /real-device coverage pending/);
  assert.doesNotMatch(deployment, /runtime v8 menerima traffic/);
  assert.ok(deployment.includes(`runtime v${DATABASE_SCHEMA_VERSION} menerima traffic`));
  assert.match(status, /Auth desktop dan mobile:.*tombol Google branded Saldo Bersama/);
  assert.match(status, /Authorization Code flow.*Firebase Identity Toolkit/);
  assert.match(testPlan, /production canonical.*`\/api\/auth\/google\/start`/);
  assert.match(testPlan, /[Ll]ocalhost\/device emulation.*`signInWithPopup`/);
  assert.match(testPlan, /Desktop dan halaman login mobile tidak merender tombol\/iframe Google Identity Services/);
  assert.match(testPlan, /Google ID token.*Firebase ID token.*Identity Toolkit/);
  assert.match(release, /https:\/\/saldo-bersama\.vercel\.app\/api\/auth\/google\/callback/);
  assert.match(release, /GOOGLE_OAUTH_CLIENT_SECRET/);
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

test("planned participant and transaction-line terminology follows hardened RFC vocabulary", () => {
  const requirements = read("docs/product/PRODUCT_REQUIREMENTS.md");
  const matrix = read("docs/IMPLEMENTATION_MATRIX.md");
  const dictionary = read("docs/DATA_DICTIONARY.md");
  assert.match(requirements, /payer.*beneficiary.*liable_party/s);
  assert.match(requirements, /REQ-PROD-19/);
  assert.match(requirements, /REQ-PROD-18/);
  assert.match(matrix, /REQ-PROD-19/);
  assert.match(matrix, /REQ-PROD-18/);
  assert.match(dictionary, /RFC-0019/);
  assert.doesNotMatch(matrix, /`used_by`/);
  assert.doesNotMatch(dictionary, /`used_by`/);
});

test("schema-changing roadmap gaps have RFC status that matches implementation state", () => {
  const roadmap = read("docs/product/ROADMAP.md");
  const rfcIndex = read("docs/rfc/README.md");
  const proposedRfcFiles = [
    "0011-transaction-lifecycle-receipts-and-usage.md",
    "0012-debt-receivable-ledger.md",
    "0014-category-hierarchy-and-goal-stages.md",
    "0015-granular-personal-privacy.md",
    "0019-transaction-line-items.md",
  ];

  proposedRfcFiles.forEach((relative) => {
    const rfcId = `RFC-${relative.slice(0, 4)}`;
    const rfcSource = read(`docs/rfc/${relative}`);
    assert.match(rfcIndex, new RegExp(escapeRegExp(relative)));
    assert.match(roadmap, new RegExp(escapeRegExp(rfcId)));
    assert.match(rfcSource, new RegExp(`^# ${escapeRegExp(rfcId)}\\b`, "m"));
    assert.match(rfcSource, /Status:\*{0,2}\s*Proposed/i);
  });

  const acceptedRfcFiles = [
    "0013-contribution-and-cost-sharing.md",
    "0016-partner-planning-permissions.md",
  ];
  acceptedRfcFiles.forEach((relative) => {
    const rfcId = `RFC-${relative.slice(0, 4)}`;
    const rfcSource = read(`docs/rfc/${relative}`);
    assert.match(rfcIndex, new RegExp(escapeRegExp(relative)));
    assert.match(roadmap, new RegExp(escapeRegExp(rfcId)));
    assert.match(rfcSource, new RegExp(`^# ${escapeRegExp(rfcId)}\\b`, "m"));
    assert.match(rfcSource, /Status:\*{0,2}\s*Accepted/i);
  });

  const implementedManualReminder = read("docs/rfc/0017-manual-reminders.md");
  assert.match(rfcIndex, /0017-manual-reminders\.md/);
  assert.match(roadmap, /RFC-0017/);
  assert.match(implementedManualReminder, /^# RFC-0017\b/m);
  assert.match(implementedManualReminder, /Status:\*{0,2}\s*Accepted and implemented/i);

  const implementedSessionRegistry = read("docs/rfc/0018-session-device-management.md");
  assert.match(rfcIndex, /0018-session-device-management\.md/);
  assert.match(roadmap, /RFC-0018/);
  assert.match(implementedSessionRegistry, /^# RFC-0018\b/m);
  assert.match(implementedSessionRegistry, /Status:\*{0,2}\s*Accepted and implemented/i);
  const proposedSection = rfcIndex.match(/## Proposed RFC([\s\S]*?)## Accepted dan implemented/)?.[1] || "";
  assert.doesNotMatch(proposedSection, /0018-session-device-management\.md/);
  assert.doesNotMatch(implementedSessionRegistry, /RFC tetap Proposed/);
  assert.match(implementedSessionRegistry, /RFC \*\*Accepted and implemented\*\*/);
});

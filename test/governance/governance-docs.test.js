import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACTION_POLICIES } from "../../api/_lib/actions/policy.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";
import {
  CORE_RUNTIME_ENV_KEYS,
  GOOGLE_BRIDGE_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
  WEB_PUSH_ENV_KEYS,
} from "../../scripts/runtime-environment.mjs";
import { TEAM_CODES, TASK_STATUSES, validateTaskRelationships, validateTaskRepository } from "../../scripts/validate-task.mjs";

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
  "docs/tasks/README.md",
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

test("README and agent instructions point to canonical workflow and task registry", () => {
  const readme = read("README.md");
  const agents = read("AGENTS.md");
  ["AGENTS.md", "docs/WORKFLOW.md", "docs/PROJECT_STATUS.md", "docs/tasks/README.md", "docs/INDEX.md"]
    .forEach((reference) => assert.match(readme, new RegExp(escapeRegExp(reference))));
  ["docs/WORKFLOW.md", "docs/PROJECT_STATUS.md", "docs/tasks/README.md", "npm run task:check", "npm run task:list"]
    .forEach((reference) => assert.match(agents, new RegExp(escapeRegExp(reference))));
});

test("legacy global handoff and team ownership files are retired", () => {
  assert.equal(exists("docs/PROJECT_HANDOFF.md"), false);
  assert.equal(exists("docs/TEAM_OWNERSHIP.md"), false);
  assert.equal(exists("docs/templates/TASK_HANDOFF_TEMPLATE.md"), false);
});

test("documentation index exposes product boundaries, roadmap, and task workflow", () => {
  const index = read("docs/INDEX.md");
  for (const reference of [
    "product/OUT_OF_SCOPE.md",
    "product/ROADMAP.md",
    "WORKFLOW.md",
    "tasks/README.md",
    "templates/TASK_TEMPLATE.md",
    "UI_DESIGN_SYSTEM.md",
  ]) assert.match(index, new RegExp(escapeRegExp(reference)));
});

test("contribution policy and Git workflow cross-reference each other", () => {
  assert.match(read("CONTRIBUTING.md"), /docs\/GIT_WORKFLOW\.md/);
  assert.match(read("docs/GIT_WORKFLOW.md"), /\.\.\/CONTRIBUTING\.md/);
});

test("solo multi-tab workflow and task registry use one canonical vocabulary", () => {
  assert.deepEqual(TEAM_CODES, ["COORD", "FE", "BE"]);
  assert.deepEqual(TASK_STATUSES, ["DRAFT", "APPROVED", "IN_PROGRESS", "ON_HOLD", "DONE"]);
  const workflow = read("docs/WORKFLOW.md");
  const template = read("docs/templates/TASK_TEMPLATE.md");
  TEAM_CODES.forEach((team) => assert.match(workflow, new RegExp(`\`${team}\``)));
  TASK_STATUSES.forEach((status) => assert.match(workflow, new RegExp(status)));
  assert.match(template, /\| Status \| `DRAFT` \|/);
  assert.match(template, /\| Team \| `COORD` \|/);
  for (const field of ["Task ID", "Team", "Depends On", "Write Scope", "Resume From", "Guard Approval"]) {
    assert.match(template, new RegExp(escapeRegExp(field)));
  }
  const { errors } = validateTaskRepository();
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("task relationship guard allows parallel same-team work but rejects dependency and scope conflicts", () => {
  const makeTask = (overrides) => ({
    id: "SB-901",
    relative: "docs/tasks/active/SB-901.md",
    status: "IN_PROGRESS",
    team: "FE",
    dependsOn: [],
    writeScope: ["frontend/src/features/login/**"],
    ...overrides,
  });
  const buildRegistry = (tasks) => ({
    active: tasks,
    archive: [],
    all: tasks,
    byId: new Map(tasks.map((task) => [task.id, task])),
  });

  const unresolved = [
    makeTask({ id: "SB-901", status: "DRAFT", team: "BE", writeScope: ["api/**"] }),
    makeTask({ id: "SB-902", status: "APPROVED", dependsOn: ["SB-901"] }),
  ];
  assert.match(validateTaskRelationships(buildRegistry(unresolved)).join("\n"), /dependency unresolved/);

  const cycle = [
    makeTask({ id: "SB-903", status: "ON_HOLD", dependsOn: ["SB-904"] }),
    makeTask({ id: "SB-904", status: "ON_HOLD", team: "BE", writeScope: ["api/**"], dependsOn: ["SB-903"] }),
  ];
  assert.match(validateTaskRelationships(buildRegistry(cycle)).join("\n"), /Dependency cycle/);

  const parallelSameTeam = [
    makeTask({ id: "SB-905", writeScope: ["frontend/src/features/login/**"] }),
    makeTask({ id: "SB-906", writeScope: ["frontend/src/features/accounts/**"] }),
  ];
  assert.deepEqual(validateTaskRelationships(buildRegistry(parallelSameTeam)), []);

  const overlap = [
    makeTask({ id: "SB-907", team: "FE", writeScope: ["frontend/src/features/login/**"] }),
    makeTask({ id: "SB-908", team: "FE", writeScope: ["frontend/src/features/login/LoginPage.jsx"] }),
  ];
  assert.match(validateTaskRelationships(buildRegistry(overlap)).join("\n"), /Write Scope overlap/);
});

test("task tooling fails closed for an unregistered branch and renders the simplified queue", () => {
  const sandbox = mkdtempSync(path.join(os.tmpdir(), "saldo-bersama-task-guard-"));
  try {
    mkdirSync(path.join(sandbox, "scripts"), { recursive: true });
    mkdirSync(path.join(sandbox, "docs/tasks/active"), { recursive: true });
    mkdirSync(path.join(sandbox, "docs/tasks/archive"), { recursive: true });
    copyFileSync(path.join(root, "scripts/validate-task.mjs"), path.join(sandbox, "scripts/validate-task.mjs"));
    writeFileSync(path.join(sandbox, "README.md"), "task guard fixture\n");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Task Guard Test"],
      ["config", "user.email", "task-guard@example.test"],
      ["add", "-A"],
      ["commit", "-qm", "fixture"],
      ["branch", "-M", "main"],
    ]) {
      const git = spawnSync("git", args, { cwd: sandbox, encoding: "utf8" });
      assert.equal(git.status, 0, git.stderr);
    }
    const invalid = spawnSync(process.execPath, ["scripts/validate-task.mjs"], {
      cwd: sandbox,
      encoding: "utf8",
      env: { ...process.env, TASK_BRANCH: "fix/SB-999-unregistered", TASK_BASE_REF: "main" },
    });
    assert.notEqual(invalid.status, 0);
    assert.match(`${invalid.stdout}\n${invalid.stderr}`, /tidak memiliki task card aktif SB-999/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  const list = spawnSync(process.execPath, ["scripts/list-tasks.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /SALDO BERSAMA TASK QUEUE/);
  assert.match(list.stdout, /IN PROGRESS/);
  assert.match(list.stdout, /READY TO START/);
  assert.match(list.stdout, /BLOCKED \/ HOLD/);
  assert.match(list.stdout, /COORD RECOMMENDED NEXT/);
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

test("API dan authorization docs mengikuti canonical owner/member permissions", () => {
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
  assert.deepEqual(PRODUCTION_SYNC_ENV_KEYS, [
    ...CORE_RUNTIME_ENV_KEYS,
    ...OPTIONAL_LOGGING_ENV_KEYS,
    ...GOOGLE_BRIDGE_ENV_KEYS,
    ...WEB_PUSH_ENV_KEYS,
  ]);
  assert.match(environmentDocs, /delapan key core wajib dan satu key logging opsional/);
  assert.match(environmentDocs, /Web Push wajib lengkap dan valid/i);
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
  assert.match(packageJson, /env:push:development:settings/);
  assert.match(bootstrap, /Memperbarui environment canonical dari Vercel Development/);
  assert.doesNotMatch(bootstrap, /args:\s*\[[^\]]*"env"[^\]]*"pull"[^\]]*"production"/is);
});

test("project status is a current-state snapshot with schema v7 and shared database guard", () => {
  const status = read("docs/PROJECT_STATUS.md");
  assert.match(status, /Active schema contract:\*\* v7/);
  assert.match(status, /Runtime lokal dan Vercel Production dirancang memakai database Turso bersama/);
  assert.match(status, /tidak lagi menjadi jurnal task/i);
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

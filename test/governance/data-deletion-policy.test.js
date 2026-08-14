import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { getActionPolicy } from "../../api/_lib/actions/policy.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const walk = async (relative, extension) => {
  const base = path.join(root, relative);
  const entries = await readdir(base, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await walk(child, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) output.push(child.replaceAll("\\", "/"));
  }
  return output;
};

const APPROVED_SQL_DELETES = new Map([
  ["api/jobs.js", new Set(["request_nonces"])],
  ["api/_lib/services/maintenance/housekeeping.js", new Set(["idempotency_keys", "import_previews", "restore_previews"])],
  ["api/_lib/idempotency.js", new Set(["idempotency_keys"])],
  ["api/_lib/services/masterData.js", new Set(["accounts", "categories"])],
  ["api/_lib/services/planning/envelopes.js", new Set(["envelope_periods", "envelope_rules"])],
  ["api/_lib/services/planning/recurring.js", new Set(["recurring_occurrences", "recurring_rules"])],
  ["api/_lib/services/planning/goals.js", new Set(["savings_goals"])],
  ["api/_lib/services/planning/budgets.js", new Set(["budgets"])],
  ["api/_lib/services/maintenance/import.js", new Set(["import_previews"])],
  ["api/_lib/services/maintenance/restore.js", new Set(["restore_previews", "__RESTORE_DELETE_ORDER__"])],
  ["api/_lib/services/maintenance/reset.js", new Set(["__RESTORE_DELETE_ORDER__", "integration_outbox"])],
  ["api/_lib/services/maintenance/fullReset.js", new Set(["__RESTORE_DELETE_ORDER__", "integration_outbox"])],
]);

const destructiveSqlTargets = (source) => {
  const targets = [];
  for (const match of source.matchAll(/DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*|\$\{quoted\(table\)\})/gi)) {
    targets.push(match[1] === "${quoted(table)}" ? "__RESTORE_DELETE_ORDER__" : match[1].toLowerCase());
  }
  return targets;
};


const DELETE_UNUSED_ACTIONS = [
  "accounts.deleteUnused",
  "categories.deleteUnused",
  "envelopes.deleteUnusedRule",
  "recurring.deleteUnusedRule",
  "goals.deleteUnused",
  "budgets.deleteUnused",
];

const LIFECYCLE_PREVIEW_ACTIONS = [
  "accounts.previewLifecycle",
  "categories.previewArchive",
  "envelopes.previewRuleLifecycle",
  "recurring.previewRuleLifecycle",
  "goals.previewLifecycle",
  "budgets.previewLifecycle",
];

test("delete-unused selalu owner-only, idempotent write, dan preview lifecycle tetap read-only", () => {
  for (const action of DELETE_UNUSED_ACTIONS) {
    const policy = getActionPolicy(action);
    assert.equal(policy?.mode, "write", `${action} harus write`);
    assert.equal(policy?.idempotencyRequired, true, `${action} wajib idempotency`);
    assert.equal(ACTION_PERMISSIONS.owner.has(action), true, `${action} wajib tersedia untuk owner`);
    assert.equal(ACTION_PERMISSIONS.member.has(action), false, `${action} tidak boleh tersedia untuk member`);
  }
  for (const action of LIFECYCLE_PREVIEW_ACTIONS) {
    const policy = getActionPolicy(action);
    assert.equal(policy?.mode, "read", `${action} harus read`);
    assert.equal(policy?.idempotencyRequired, false, `${action} tidak memerlukan idempotency`);
    assert.equal(ACTION_PERMISSIONS.owner.has(action), true, `${action} wajib tersedia untuk owner`);
    assert.equal(ACTION_PERMISSIONS.member.has(action), false, `${action} tidak boleh tersedia untuk member`);
  }
});

test("semua hard DELETE production wajib berada pada allowlist deletion policy", async () => {
  const files = await walk("api", ".js");
  const observed = new Map();
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    const targets = destructiveSqlTargets(source);
    if (!targets.length) continue;
    observed.set(file, new Set(targets));
    const approved = APPROVED_SQL_DELETES.get(file);
    assert.ok(approved, `Hard DELETE tidak disetujui di ${file}: ${targets.join(", ")}`);
    for (const target of targets) {
      assert.ok(approved.has(target), `Hard DELETE ${target} tidak disetujui di ${file}`);
    }
    const suspiciousDynamicDelete = /DELETE\s+FROM\s+\$\{(?!quoted\(table\)\})/i.test(source)
      || /DELETE\s+FROM\s*["'`]\s*\+/i.test(source);
    assert.equal(suspiciousDynamicDelete, false, `Dynamic hard DELETE tidak disetujui di ${file}`);
  }

  assert.deepEqual(
    [...observed.entries()].map(([file, values]) => [file, [...values].sort()]).sort(),
    [...APPROVED_SQL_DELETES.entries()].map(([file, values]) => [file, [...values].sort()]).sort(),
    "Allowlist harus sama persis dengan DELETE production yang benar-benar ada",
  );
});

test("ledger dan audit tidak boleh di-hard-delete oleh business service", async () => {
  const files = await walk("api", ".js");
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    if (["api/_lib/services/maintenance/restore.js", "api/_lib/services/maintenance/fullReset.js"].includes(file)) continue;
    assert.doesNotMatch(source, /DELETE\s+FROM\s+transactions\b/i, `${file} tidak boleh hard-delete transaksi`);
    assert.doesNotMatch(source, /DELETE\s+FROM\s+audit_log\b/i, `${file} tidak boleh hard-delete audit`);
    assert.doesNotMatch(source, /DELETE\s+FROM\s+(goal_movements|envelope_movements|reconciliations|period_closures)\b/i, `${file} tidak boleh hard-delete histori finansial`);
  }
});

test("bersihkan data testing hanya tersedia melalui maintenance guard owner, preview, backup, dan audit", async () => {
  const reset = await readFile(path.join(root, "api/_lib/services/maintenance/reset.js"), "utf8");
  assert.match(reset, /assertOwner\(context\.actor\)/);
  assert.match(reset, /previewFingerprint/);
  assert.match(reset, /createTechnicalBackup/);
  assert.match(reset, /maintenance_mode/);
  assert.match(reset, /integrityIssues/);
  assert.match(reset, /appendAudit/);
  assert.match(reset, /BERSIHKAN DATA TESTING/);
  assert.doesNotMatch(reset, /"audit_log"/);
  assert.doesNotMatch(reset, /"accounts"\s*,\s*key/);
  assert.doesNotMatch(reset, /"categories"\s*,\s*key/);
});


test("reset semua data hanya melalui maintenance owner, backup, fingerprint, integrity, audit, dan preservation backbone", async () => {
  const fullReset = await readFile(path.join(root, "api/_lib/services/maintenance/fullReset.js"), "utf8");
  assert.match(fullReset, /assertOwner\(context\.actor\)/);
  assert.match(fullReset, /previewFingerprint/);
  assert.match(fullReset, /createTechnicalBackup/);
  assert.match(fullReset, /maintenance_mode/);
  assert.match(fullReset, /integrityIssues/);
  assert.match(fullReset, /appendAudit/);
  assert.match(fullReset, /RESET SEMUA DATA SALDO BERSAMA/);
  assert.match(fullReset, /"accounts"/);
  assert.match(fullReset, /"categories"/);
  assert.match(fullReset, /"transactions"/);
  assert.doesNotMatch(fullReset, /"audit_log"/);
  assert.doesNotMatch(fullReset, /"users"/);
  assert.doesNotMatch(fullReset, /"backup_runs"/);
  assert.doesNotMatch(fullReset, /"integrity_runs"/);
  assert.doesNotMatch(fullReset, /"idempotency_keys"/);
});

test("controlled restore reset memakai daftar tabel statis dan tidak menghapus audit_log", async () => {
  const [restore, shared] = await Promise.all([
    readFile(path.join(root, "api/_lib/services/maintenance/restore.js"), "utf8"),
    readFile(path.join(root, "api/_lib/services/maintenance/shared.js"), "utf8"),
  ]);
  assert.match(restore, /RESTORE_DELETE_ORDER\.map\(\(table\) => \(\{ sql: `DELETE FROM \$\{quoted\(table\)\}` \}\)\)/);
  const order = shared.match(/RESTORE_DELETE_ORDER\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
  assert.match(order, /"transactions"/);
  assert.doesNotMatch(order, /"audit_log"/);
});

const APPROVED_APPS_SCRIPT_DESTRUCTIVE = new Map([
  ["apps-script/CalendarService.gs", new Set(["deleteEvent"])],
  ["apps-script/MirrorService.gs", new Set(["clearContents"])],
  ["apps-script/Scheduler.gs", new Set(["deleteTrigger"])],
]);

test("destructive Apps Script hanya boleh membersihkan projection/infrastructure yang disetujui", async () => {
  const files = await walk("apps-script", ".gs");
  const observed = new Map();
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    const operations = [...source.matchAll(/\.(deleteEvent|deleteTrigger|clearContents|setTrashed|removeFile)\s*\(/g)].map((match) => match[1]);
    if (!operations.length) continue;
    const unique = new Set(operations);
    observed.set(file, unique);
    const approved = APPROVED_APPS_SCRIPT_DESTRUCTIVE.get(file);
    assert.ok(approved, `Operasi Apps Script destructive tidak disetujui di ${file}`);
    for (const operation of unique) assert.ok(approved.has(operation), `${operation} tidak disetujui di ${file}`);
  }
  assert.deepEqual(
    [...observed.entries()].map(([file, values]) => [file, [...values].sort()]).sort(),
    [...APPROVED_APPS_SCRIPT_DESTRUCTIVE.entries()].map(([file, values]) => [file, [...values].sort()]).sort(),
  );
});

test("migration dan operational script tidak boleh menjadi jalur hard-delete data produksi", async () => {
  const migrationFiles = await walk("database/migrations", ".sql");
  const scriptFiles = await walk("scripts", ".mjs");
  for (const file of [...migrationFiles, ...scriptFiles]) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /DELETE\s+FROM\b/i, `${file} tidak boleh hard-delete data produksi`);
    assert.doesNotMatch(source, /\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i, `${file} tidak boleh memakai destructive DDL tanpa maintenance workflow guarded`);
  }
});

import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARCHIVE_IGNORED_SEGMENTS,
  DEPENDENCY_CLEAN_TARGETS,
  GENERATED_CLEAN_TARGETS,
  LOCAL_ONLY_FILE_PATTERNS,
  MAX_SOURCE_ARCHIVE_BYTES,
  isCleanSourceArchiveFilename,
} from "../../scripts/artifact-policy.mjs";
import { cleanupLegacyCleanArchives, replaceArchiveAtomically } from "../../scripts/create-clean-archive.mjs";
import { cleanGeneratedArtifacts } from "../../scripts/clean-generated-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const exists = async (candidate) => access(candidate).then(() => true, () => false);

const runNode = (script, args = []) => spawnSync(process.execPath, [path.join(root, script), ...args], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});

test("cleanup generated tidak boleh menyentuh dependency, repository, env, atau link Vercel", () => {
  const generated = new Set(GENERATED_CLEAN_TARGETS);
  for (const protectedPath of [".git", ".vercel", ".env.local", "node_modules", "frontend/node_modules"]) {
    assert.equal(generated.has(protectedPath), false, protectedPath);
  }
  assert.equal(generated.has("frontend/node_modules/.vite"), true);
  assert.equal(generated.has("frontend/node_modules/.vite-temp"), true);
  assert.deepEqual(DEPENDENCY_CLEAN_TARGETS, ["node_modules", "frontend/node_modules"]);
  for (const ignored of [".git", ".vercel", "node_modules", "dist", "coverage"]) assert.equal(ARCHIVE_IGNORED_SEGMENTS.has(ignored), true, ignored);
});

test("cleanup generated reusable hanya menghapus target generated dan mempertahankan local runtime", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-generated-clean-"));
  try {
    await mkdir(path.join(temp, "frontend", "dist"), { recursive: true });
    await mkdir(path.join(temp, "coverage"), { recursive: true });
    await mkdir(path.join(temp, "node_modules"), { recursive: true });
    await mkdir(path.join(temp, "frontend", "node_modules", ".vite"), { recursive: true });
    await mkdir(path.join(temp, "frontend", "node_modules", ".vite-temp"), { recursive: true });
    await writeFile(path.join(temp, "frontend", "node_modules", "keep.txt"), "dependency tetap ada\n");
    await writeFile(path.join(temp, ".env.local"), "LOCAL_ONLY=1\n");
    const logs = [];
    const removed = await cleanGeneratedArtifacts({ projectRoot: temp, logger: { log: (message) => logs.push(message) } });
    assert.ok(removed.includes("frontend/dist"));
    assert.ok(removed.includes("coverage"));
    assert.equal(await exists(path.join(temp, "frontend", "dist")), false);
    assert.equal(await exists(path.join(temp, "coverage")), false);
    assert.equal(await exists(path.join(temp, "node_modules")), true);
    assert.equal(await exists(path.join(temp, "frontend", "node_modules", ".vite")), false);
    assert.equal(await exists(path.join(temp, "frontend", "node_modules", ".vite-temp")), false);
    assert.equal(await exists(path.join(temp, "frontend", "node_modules", "keep.txt")), true);
    assert.equal(await exists(path.join(temp, ".env.local")), true);
    assert.match(logs.join("\n"), /Artefak generated dihapus/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("cleanup dependency fail closed tanpa flag force", () => {
  const result = runNode("scripts/clean-development-dependencies.mjs");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--force/);
});

test("cleanup dependency memberi recovery Windows untuk native module yang terkunci", async () => {
  const source = await readFile(path.join(root, "scripts/clean-development-dependencies.mjs"), "utf8");
  assert.match(source, /EPERM/);
  assert.match(source, /EBUSY/);
  assert.match(source, /DEPENDENCY_LOCKED/);
  assert.match(source, /Hentikan npm run dev\/Vite\/Node/);
  assert.match(source, /npm run clean:dependencies -- --force/);
  assert.match(source, /npm ci/);
});

test("source validator membedakan jumlah Vercel Function aktif dari batas maksimum", () => {
  const result = runNode("scripts/validate-source-tree.mjs");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Source canonical valid: .*5 Vercel Functions canonical \(batas maksimum: 12\)\./);
  assert.doesNotMatch(result.stdout, /5\/12 Vercel Functions canonical/);
});

test("policy archive clean hanya menerima nama canonical dan menolak patch atau ZIP lain", () => {
  for (const name of [
    "saldo-bersama-clean.zip",
    "saldo-bersama-clean(1).zip",
    "saldo-bersama-clean(20260806-091735).zip",
    "saldo-bersama-clean-20260806-091735.zip",
  ]) assert.equal(isCleanSourceArchiveFilename(name), true, name);

  for (const name of [
    "saldo-bersama-patch-ui.zip",
    "backup-saldo-bersama-clean.zip",
    "saldo-bersama-clean-final.zip",
    "laporan.zip",
  ]) assert.equal(isCleanSourceArchiveFilename(name), false, name);
});

test("replacement archive atomic mempertahankan file lama saat temporary belum valid", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-archive-atomic-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  try {
    await writeFile(output, "archive-lama");
    await assert.rejects(() => replaceArchiveAtomically(path.join(temp, "missing.tmp"), output));
    assert.equal(await readFile(output, "utf8"), "archive-lama");

    const replacement = path.join(temp, "replacement.tmp");
    await writeFile(replacement, "archive-baru");
    await replaceArchiveAtomically(replacement, output);
    assert.equal(await readFile(output, "utf8"), "archive-baru");
    assert.equal((await readdir(temp)).some((name) => name.includes(".previous-")), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("cleanup archive lama hanya menghapus variasi clean canonical", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-archive-cleanup-"));
  const keep = path.join(temp, "saldo-bersama-clean.zip");
  const removable = [
    "saldo-bersama-clean(1).zip",
    "saldo-bersama-clean(20260806-091735).zip",
    "saldo-bersama-clean-20260806-091735.zip",
  ];
  const protectedFiles = ["saldo-bersama-patch-ui.zip", "backup.zip", "laporan.zip"];
  try {
    await writeFile(keep, "keep");
    await Promise.all([...removable, ...protectedFiles].map((name) => writeFile(path.join(temp, name), name)));
    const removed = await cleanupLegacyCleanArchives(temp, keep);
    assert.deepEqual(removed.map((item) => path.basename(item)).sort(), removable.sort());
    assert.equal(await exists(keep), true);
    for (const name of removable) assert.equal(await exists(path.join(temp, name)), false, name);
    for (const name of protectedFiles) assert.equal(await exists(path.join(temp, name)), true, name);

    const invalid = path.join(temp, "saldo-bersama-clean(2).zip");
    await mkdir(invalid);
    await assert.rejects(() => cleanupLegacyCleanArchives(temp, keep), /non-file atau symlink/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});



test("source validator mengabaikan metadata Git baik file maupun directory pada linked worktree", async () => {
  const validator = await readFile(path.join(root, "scripts/validate-source-tree.mjs"), "utf8");
  assert.match(validator, /entry\.isSymbolicLink\(\) \|\| ignoredSegments\.has\(entry\.name\)/);
});

test("browser test membangun fixture public sendiri dan tidak bergantung pada env lokal", async () => {
  const [packageJson, prepare] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "scripts/prepare-browser-test-build.mjs"), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(scripts["test:browser"], /prepare-browser-test-build\.mjs/);
  assert.match(prepare, /VITE_GOOGLE_CLIENT_ID/);
  assert.match(prepare, /VITE_FIREBASE_API_KEY/);
  assert.match(prepare, /npm_execpath/);
  assert.match(prepare, /process\.execPath/);
  assert.doesNotMatch(prepare, /spawnSync\(\s*["\']npm\.cmd["\']/);
  assert.doesNotMatch(prepare, /SESSION_SECRET|TURSO_AUTH_TOKEN|VAPID_PRIVATE_KEY|GOOGLE_BRIDGE_SHARED_SECRET/);
});



test("local Git hooks tetap di luar clean source policy", async () => {
  const policy = await import("../../scripts/artifact-policy.mjs");
  assert.equal(policy.ARCHIVE_IGNORED_SEGMENTS.has(".git"), true);
  assert.equal(policy.isCanonicalSourceFile(".git/hooks/pre-push"), false);
});

test("gitignore dan pin Node menjaga line ending canonical tanpa duplikasi CLI", async () => {
  const [gitignore, nodeVersion] = await Promise.all([
    readFile(path.join(root, ".gitignore"), "utf8"),
    readFile(path.join(root, ".node-version"), "utf8"),
  ]);
  assert.equal(gitignore.includes("\r"), false);
  assert.equal(nodeVersion, "24.18.1\n");
  assert.equal((gitignore.match(/^\.vercel\/$/gm) || []).length, 1);
  assert.equal((gitignore.match(/^\.env$/gm) || []).length, 1);
  assert.equal((gitignore.match(/^\.env\.\*$/gm) || []).length, 1);
  assert.equal((gitignore.match(/^!\.env\.example$/gm) || []).length, 1);
  assert.equal((gitignore.match(/^\.vercel$/gm) || []).length, 0);
  assert.equal((gitignore.match(/^\.env\*$/gm) || []).length, 0);
});

test("laporan npm audit lokal diabaikan validator dan tidak pernah masuk clean ZIP", async () => {
  const auditName = "npm-audit-20991231.json";
  const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /^npm-audit-\*\.json$/m);
  const auditPath = path.join(root, auditName);
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-audit-local-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  try {
    assert.equal(LOCAL_ONLY_FILE_PATTERNS.some((pattern) => pattern.test(auditName)), true);
    await writeFile(auditPath, JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }));
    const validation = runNode("scripts/validate-source-tree.mjs");
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);
    const archive = runNode("scripts/create-clean-archive.mjs", [output]);
    assert.equal(archive.status, 0, `${archive.stdout}\n${archive.stderr}`);
    const binary = await readFile(output);
    assert.equal(binary.includes(Buffer.from(auditName)), false, "Laporan npm audit lokal tidak boleh masuk clean ZIP");
  } finally {
    await rm(auditPath, { force: true });
    await rm(temp, { recursive: true, force: true });
  }
});


test("root file non-canonical ditolak dan tidak dapat masuk clean ZIP", async () => {
  const diagnosticName = "chatgpt-review-artifact.patch";
  const diagnosticPath = path.join(root, diagnosticName);
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-diagnostic-root-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  try {
    await writeFile(diagnosticPath, "diagnostic patch marker");

    const validation = runNode("scripts/validate-source-tree.mjs");
    assert.notEqual(validation.status, 0);
    assert.match(`${validation.stdout}\n${validation.stderr}`, /Root entry non-canonical tidak diizinkan/i);

    const archive = runNode("scripts/create-clean-archive.mjs", [output]);
    assert.notEqual(archive.status, 0);
    assert.equal(await exists(output), false, "Archive tidak boleh dibuat dari source non-canonical");
  } finally {
    await rm(diagnosticPath, { force: true });
    await rm(temp, { recursive: true, force: true });
  }
});

test("unknown root directory ditolak fail-closed", async () => {
  const unknownDirectory = path.join(root, "chatgpt-review-folder");
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-diagnostic-folder-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  try {
    await mkdir(unknownDirectory);
    await writeFile(path.join(unknownDirectory, "note.txt"), "diagnostic folder marker");

    const validation = runNode("scripts/validate-source-tree.mjs");
    assert.notEqual(validation.status, 0);
    assert.match(`${validation.stdout}\n${validation.stderr}`, /Root entry non-canonical tidak diizinkan/i);

    const archive = runNode("scripts/create-clean-archive.mjs", [output]);
    assert.notEqual(archive.status, 0);
    assert.equal(await exists(output), false);
  } finally {
    await rm(unknownDirectory, { recursive: true, force: true });
    await rm(temp, { recursive: true, force: true });
  }
});

test("data finansial/export arbitrer di path canonical tetap ditolak clean source", async () => {
  const privateData = path.join(root, "docs", "transactions-export.csv");
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-private-export-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  try {
    await writeFile(privateData, "date,description,amount\n2026-08-09,fixture,100000\n");
    const validation = runNode("scripts/validate-source-tree.mjs");
    assert.notEqual(validation.status, 0);
    assert.match(`${validation.stdout}\n${validation.stderr}`, /File source non-canonical tidak diizinkan: docs\/transactions-export\.csv/i);

    const archive = runNode("scripts/create-clean-archive.mjs", [output]);
    assert.notEqual(archive.status, 0);
    assert.equal(await exists(output), false);
  } finally {
    await rm(privateData, { force: true });
    await rm(temp, { recursive: true, force: true });
  }
});

test("clean source archive tervalidasi, kecil, dan tidak memuat env lokal", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-archive-test-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  const sibling = path.join(temp, "saldo-bersama-clean(1).zip");
  try {
    await writeFile(sibling, "custom-output-must-not-clean-siblings");
    const result = runNode("scripts/create-clean-archive.mjs", [output]);
    const outputLog = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, outputLog);
    assert.doesNotMatch(outputLog, /will be replaced by (?:CRLF|LF)/, "Packager tidak boleh memenuhi output dengan warning line-ending staging.");
    const info = await stat(output);
    assert.ok(info.size > 0);
    assert.ok(info.size <= MAX_SOURCE_ARCHIVE_BYTES, `${info.size} > ${MAX_SOURCE_ARCHIVE_BYTES}`);
    const binary = await readFile(output);
    assert.equal(binary.includes(Buffer.from(".env.local")), false);
    assert.equal(binary.includes(Buffer.from("node_modules")), false);
    assert.equal(binary.includes(Buffer.from("frontend/dist")), false);
    assert.equal(await readFile(sibling, "utf8"), "custom-output-must-not-clean-siblings");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

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
  MAX_SOURCE_ARCHIVE_BYTES,
  isCleanSourceArchiveFilename,
} from "../../scripts/artifact-policy.mjs";
import { cleanupLegacyCleanArchives, replaceArchiveAtomically } from "../../scripts/create-clean-archive.mjs";

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
  assert.deepEqual(DEPENDENCY_CLEAN_TARGETS, ["node_modules", "frontend/node_modules"]);
  for (const ignored of [".git", ".vercel", "node_modules", "dist", "coverage"]) assert.equal(ARCHIVE_IGNORED_SEGMENTS.has(ignored), true, ignored);
});

test("cleanup dependency fail closed tanpa flag force", () => {
  const result = runNode("scripts/clean-development-dependencies.mjs");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--force/);
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

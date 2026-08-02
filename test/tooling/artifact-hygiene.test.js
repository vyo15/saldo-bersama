import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
} from "../../scripts/artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

test("clean source archive tervalidasi, kecil, dan tidak memuat env lokal", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "saldo-archive-test-"));
  const output = path.join(temp, "saldo-bersama-clean.zip");
  try {
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
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

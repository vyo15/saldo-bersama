import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (/\.(?:jsx|js)$/.test(entry.name)) files.push(target);
  }
  return files;
};

test("app-owned interaction does not fall back to native select browser UI", async () => {
  const files = await walk(srcRoot);
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/<select\b/.test(source)) offenders.push(path.relative(srcRoot, file));
  }
  assert.deepEqual(offenders, []);
});

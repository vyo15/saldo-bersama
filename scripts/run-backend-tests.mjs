import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, "test");

const collect = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(target));
    else if (entry.isFile() && entry.name.endsWith(".test.js")) files.push(target);
  }
  return files;
};

const files = (await collect(testRoot)).sort();
if (!files.length) throw new Error("Tidak ada backend test yang ditemukan.");
const coverage = process.argv.includes("--coverage");
const coverageArgs = coverage
  ? [
      "--experimental-test-coverage",
      "--test-coverage-lines=80",
      "--test-coverage-branches=55",
      "--test-coverage-functions=78",
    ]
  : [];
const result = spawnSync(process.execPath, [...coverageArgs, "--test", ...files], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

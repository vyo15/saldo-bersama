import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureDevelopmentEnvironment } from "./bootstrap-development-env.mjs";
import { printEnvironmentProfiles } from "./environment-status.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  await ensureDevelopmentEnvironment({ projectRoot, interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  await printEnvironmentProfiles({ cwd: projectRoot });
} catch (error) {
  console.error(error?.message || "Pull Vercel Development gagal.");
  process.exitCode = 1;
}

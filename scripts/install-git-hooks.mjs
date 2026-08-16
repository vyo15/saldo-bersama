import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANAGED_PRE_PUSH_MARKER = "saldo-bersama-managed-pre-push";

const gitOutput = (args, cwd) => execFileSync("git", args, {
  cwd,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim();

const managedHookContent = () => `#!/bin/sh\n# ${MANAGED_PRE_PUSH_MARKER}\nset -eu\nrepo_root="$(git rev-parse --show-toplevel)"\ncd "$repo_root"\nexec node scripts/pre-push-verify.mjs\n`;

export const installGitHooks = async ({ projectRoot = defaultRoot, logger = console } = {}) => {
  let hooksDirectory;
  try {
    if (gitOutput(["rev-parse", "--is-inside-work-tree"], projectRoot) !== "true") return { installed: false, reason: "not-git" };
    hooksDirectory = gitOutput(["rev-parse", "--git-path", "hooks"], projectRoot);
  } catch {
    return { installed: false, reason: "not-git" };
  }

  const resolvedHooksDirectory = path.resolve(projectRoot, hooksDirectory);
  const hookPath = path.join(resolvedHooksDirectory, "pre-push");
  await mkdir(resolvedHooksDirectory, { recursive: true });

  try {
    const existing = await readFile(hookPath, "utf8");
    if (!existing.includes(MANAGED_PRE_PUSH_MARKER)) {
      logger.warn?.("Pre-push hook custom sudah ada. Auto Quality Guard tidak menimpanya; jalankan `npm run verify` sebelum push.");
      return { installed: false, reason: "custom-hook", hookPath };
    }
    if (existing === managedHookContent()) return { installed: false, reason: "already-current", hookPath };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await writeFile(hookPath, managedHookContent(), { encoding: "utf8", mode: 0o755 });
  try { await chmod(hookPath, 0o755); } catch { /* Windows Git tidak membutuhkan chmod filesystem. */ }
  logger.log?.("Auto Quality Guard pre-push siap.");
  return { installed: true, reason: "updated", hookPath };
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    await installGitHooks();
  } catch (error) {
    console.error(`Gagal menyiapkan pre-push guard: ${error?.message || "unknown error"}`);
    process.exitCode = 1;
  }
}

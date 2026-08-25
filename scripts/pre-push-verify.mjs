import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runVerificationWithCleanup } from "./verify-project.mjs";

const ZERO_SHA = /^0+$/;

export const parsePrePushUpdates = (source = "") => String(source)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [localRef, localSha, remoteRef, remoteSha, ...extra] = line.split(/\s+/);
    if (!localRef || !localSha || !remoteRef || !remoteSha || extra.length) {
      throw Object.assign(new Error("Payload pre-push Git tidak valid."), { code: "PRE_PUSH_INPUT_INVALID" });
    }
    return { localRef, localSha, remoteRef, remoteSha };
  });

export const assertCanonicalMainPush = ({ updates, currentBranch, headSha, workingTree = "", isFastForward = true } = {}) => {
  if (!Array.isArray(updates) || updates.length !== 1) {
    throw Object.assign(new Error("Push harus mengubah tepat satu ref: main."), { code: "PRE_PUSH_REF_COUNT_INVALID" });
  }
  const [update] = updates;
  if (update.localRef !== "refs/heads/main" || update.remoteRef !== "refs/heads/main") {
    throw Object.assign(new Error("Workflow canonical hanya `git push origin main` dari branch main."), { code: "PRE_PUSH_MAIN_REQUIRED" });
  }
  if (ZERO_SHA.test(update.localSha)) {
    throw Object.assign(new Error("Penghapusan branch main ditolak."), { code: "PRE_PUSH_MAIN_DELETE_DENIED" });
  }
  if (currentBranch !== "main") {
    throw Object.assign(new Error(`Branch aktif adalah ${currentBranch || "detached"}. Pindah ke main sebelum push agar ref yang diverifikasi sama dengan ref yang dikirim.`), { code: "PRE_PUSH_BRANCH_MISMATCH" });
  }
  if (String(headSha || "").trim() !== update.localSha) {
    throw Object.assign(new Error("SHA yang akan dipush berbeda dari HEAD yang sedang diverifikasi. Push dibatalkan."), { code: "PRE_PUSH_SHA_MISMATCH" });
  }
  if (String(workingTree || "").trim()) {
    throw Object.assign(new Error("Working tree belum bersih. Commit semua perubahan yang memang ingin dikirim sebelum push."), { code: "PRE_PUSH_DIRTY_WORKTREE" });
  }
  if (!ZERO_SHA.test(update.remoteSha) && !isFastForward) {
    throw Object.assign(new Error("Non-fast-forward/force push ke main ditolak."), { code: "PRE_PUSH_NON_FAST_FORWARD" });
  }
  return update;
};

const gitOutput = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export const inspectGitPush = ({ updates } = {}) => {
  const currentBranch = gitOutput(["branch", "--show-current"]);
  const headSha = gitOutput(["rev-parse", "HEAD"]);
  const workingTree = gitOutput(["status", "--porcelain"]);
  const [update] = updates || [];
  let isFastForward = true;
  if (update && !ZERO_SHA.test(update.remoteSha)) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", update.remoteSha, update.localSha], { stdio: "ignore" });
    } catch {
      isFastForward = false;
    }
  }
  return { currentBranch, headSha, workingTree, isFastForward };
};

const readStdin = async () => {
  let source = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) source += chunk;
  return source;
};

export const runPrePushGuard = async ({ stdinSource, verify = runVerificationWithCleanup } = {}) => {
  const source = stdinSource ?? await readStdin();
  const updates = parsePrePushUpdates(source);
  const gitState = inspectGitPush({ updates });
  const update = assertCanonicalMainPush({ updates, ...gitState });

  console.log("\nSaldo Bersama pre-push Auto Quality Guard...");
  console.log(`Ref terverifikasi: main @ ${update.localSha.slice(0, 7)}`);
  await verify();
  console.log("\nPre-push PASS. `git push origin main` dilanjutkan.");
  return update;
};

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  runPrePushGuard().catch((error) => {
    console.error(`\nPUSH DIBATALKAN: ${error?.message || "Quality gate gagal."}`);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}

import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRANCH_PATTERN, validateTaskRepository } from "./validate-task.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const run = (command, args, options = {}) => {
  const output = execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...(options.env || {}) },
  });
  return typeof output === "string" ? output.trim() : "";
};

const git = (args, options = {}) => run("git", args, options);
const npmRun = (script, options = {}) => {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return run(process.execPath, [npmCli, "run", script], options);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npmCommand, ["run", script], options);
};

const currentBranch = () => git(["branch", "--show-current"], { capture: true });
const currentMainSha = () => git(["rev-parse", "origin/main"], { capture: true });
const hasWorkingChanges = () => Boolean(git(["status", "--porcelain"], { capture: true }));
const gitSucceeds = (args) => {
  try {
    git(args, { capture: true });
    return true;
  } catch {
    return false;
  }
};

const taskIdFromMessage = (message) => message.match(/\b(SB-\d{3,4})\b/)?.[1] || "";

const branchExists = (branch) => (
  gitSucceeds(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])
  || gitSucceeds(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`])
  || gitSucceeds(["ls-remote", "--exit-code", "--heads", "origin", branch])
);

const availableTaskBranch = (requested) => {
  if (!branchExists(requested)) return requested;
  for (let revision = 2; revision <= 99; revision += 1) {
    const candidate = `${requested}-r${revision}`;
    if (!branchExists(candidate)) return candidate;
  }
  throw new Error(`Tidak dapat menemukan branch revision kosong untuk ${requested}.`);
};

const taskBranchBase = (branch) => branch.replace(/-r\d+$/, "");

const cleanupTaskBranchFamily = (branch) => {
  const base = taskBranchBase(branch);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const family = new RegExp(`^${escaped}(?:-r\\d+)?$`);
  const localBranches = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], { capture: true })
    .split(/\r?\n/)
    .filter((candidate) => candidate && family.test(candidate));
  const remoteBranches = git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/"], { capture: true })
    .split(/\r?\n/)
    .map((candidate) => candidate.replace(/^origin\//, ""))
    .filter((candidate) => candidate && candidate !== "HEAD" && family.test(candidate));

  for (const candidate of localBranches) {
    try {
      git(["branch", "-D", candidate]);
    } catch {
      console.warn(`Warning: branch lokal lama ${candidate} belum dapat dibersihkan otomatis.`);
    }
  }
  for (const candidate of [...new Set(remoteBranches)]) {
    try {
      git(["push", "origin", "--delete", candidate]);
    } catch {
      console.warn(`Warning: branch remote lama ${candidate} belum dapat dibersihkan otomatis.`);
    }
  }
};

const todayJakarta = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const updateTableField = (source, field, value) => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\| ${escaped} \\| .* \\|$`, "m");
  if (!pattern.test(source)) throw new Error(`Field task '${field}' tidak ditemukan.`);
  return source.replace(pattern, `| ${field} | \`${value}\` |`);
};

const updateActiveTaskBranch = (taskId, branch) => {
  const active = path.join(root, "docs", "tasks", "active", `${taskId}.md`);
  let source = readFileSync(active, "utf8");
  source = updateTableField(source, "Branch", branch);
  writeFileSync(active, source, "utf8");
};

const closeTaskOnMain = (taskId) => {
  const active = path.join(root, "docs", "tasks", "active", `${taskId}.md`);
  const archive = path.join(root, "docs", "tasks", "archive", `${taskId}.md`);
  let source = readFileSync(active, "utf8");
  source = updateTableField(source, "Status", "DONE");
  source = updateTableField(source, "Updated", todayJakarta());
  writeFileSync(active, source, "utf8");
  renameSync(active, archive);
  git(["add", "-A"]);
  git(["commit", "-m", `chore(${taskId}): close task`]);
};

const prepareTaskBranchFromMain = (message) => {
  if (!hasWorkingChanges()) {
    throw new Error("Tidak ada file hasil replace/perubahan di main untuk diselesaikan.");
  }

  const taskId = taskIdFromMessage(message);
  if (!taskId) {
    throw new Error("Commit message harus memuat Task ID, contoh: fix(SB-123): deskripsi perubahan.");
  }

  const { registry, errors } = validateTaskRepository();
  if (errors.length > 0) {
    throw new Error(`Task governance invalid sebelum membuat branch:
- ${errors.join("\n- ")}`);
  }
  const task = registry.active.find((item) => item.id === taskId);
  if (!task) throw new Error(`Task card aktif ${taskId} tidak ditemukan.`);
  if (!["APPROVED", "IN_PROGRESS"].includes(task.status)) {
    throw new Error(`${task.id}: status ${task.status} belum boleh diselesaikan.`);
  }

  git(["fetch", "origin", "main"]);
  const requestedBranch = task.branch;
  const branch = availableTaskBranch(requestedBranch);
  if (branch !== requestedBranch) {
    updateActiveTaskBranch(task.id, branch);
    console.log(`Branch ${requestedBranch} sudah ada. Menggunakan revision aman ${branch}.`);
  }
  git(["switch", "-c", branch]);
  return branch;
};

const ensureCleanTaskPolicy = (branch) => {
  const { registry, errors, scope } = validateTaskRepository();
  if (errors.length > 0) {
    throw new Error(`Task governance invalid:\n- ${errors.join("\n- ")}`);
  }
  const match = branch.match(BRANCH_PATTERN);
  if (!match) throw new Error(`Branch '${branch}' bukan branch task canonical.`);
  const task = registry.active.find((item) => item.id === match[1]);
  if (!task) throw new Error(`Task card aktif ${match[1]} tidak ditemukan.`);
  if (!["APPROVED", "IN_PROGRESS"].includes(task.status)) {
    throw new Error(`${task.id}: status ${task.status} belum boleh diselesaikan.`);
  }
  return { task, scope };
};

const main = () => {
  const message = process.argv.slice(2).join(" ").trim();
  if (!message) {
    console.error('Gunakan: npm run task:finish -- "fix(SB-123): deskripsi perubahan"');
    process.exit(2);
  }

  let branch = currentBranch();
  if (!branch) {
    console.error("Branch Git aktif tidak dapat dideteksi.");
    process.exit(2);
  }

  if (branch === "main" || branch === "master") {
    try {
      branch = prepareTaskBranchFromMain(message);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  } else {
    git(["fetch", "origin", "main"]);
  }

  const { task } = ensureCleanTaskPolicy(branch);

  const hasCommittedTaskWork = Number(git(["rev-list", "--count", "origin/main..HEAD"], { capture: true })) > 0;
  if (!hasWorkingChanges() && !hasCommittedTaskWork) {
    console.error("Tidak ada perubahan task untuk diselesaikan.");
    process.exit(2);
  }

  // Simpan patch baru bila ada. Jika task sudah pernah di-commit, helper tetap bisa dilanjutkan/retry.
  if (hasWorkingChanges()) {
    git(["add", "-A"]);
    git(["commit", "-m", message]);
  }

  // Satukan main terbaru lalu validasi. Bila tab lain mengubah main saat check berjalan, ulangi.
  let stableMain = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    git(["fetch", "origin", "main"]);
    const baseSha = currentMainSha();
    try {
      git(["merge", "--no-edit", "origin/main"]);
    } catch {
      console.error("Merge main terbaru ke branch task mengalami konflik. Main belum berubah.");
      process.exit(1);
    }

    run(process.execPath, [path.join(root, "scripts", "validate-task.mjs")], {
      env: { TASK_BRANCH: branch, TASK_BASE_REF: "origin/main" },
    });
    npmRun("check", {
      env: { TASK_BRANCH: branch, TASK_BASE_REF: "origin/main" },
    });
    npmRun("test:guard", {
      env: { TASK_BRANCH: branch, TASK_BASE_REF: "origin/main" },
    });
    if (task.team === "FE") {
      npmRun("test:browser", {
        env: { TASK_BRANCH: branch, TASK_BASE_REF: "origin/main" },
      });
    }

    git(["fetch", "origin", "main"]);
    if (currentMainSha() === baseSha) {
      stableMain = true;
      break;
    }
    console.log(`Main berubah saat validation (attempt ${attempt}). Mengintegrasikan versi terbaru dan mengulang check.`);
  }
  if (!stableMain) {
    throw new Error("Main terus berubah selama validation. Task branch tetap aman; coba task:finish lagi setelah task lain selesai merge.");
  }

  git(["push", "-u", "origin", "HEAD"]);

  // Semua task yang sudah approved, termasuk guarded, selesai lokal setelah seluruh check PASS.
  // Guarded/high-risk tetap membutuhkan Guard Approval=APPROVED pada task card sebelum helper boleh berjalan.
  git(["switch", "main"]);
  git(["pull", "--ff-only", "origin", "main"]);
  const mainBeforeMerge = git(["rev-parse", "HEAD"], { capture: true });
  const remoteBeforeMerge = currentMainSha();
  if (mainBeforeMerge !== remoteBeforeMerge || hasWorkingChanges()) {
    git(["switch", branch]);
    throw new Error("Main lokal tidak identik/bersih terhadap origin/main. Direct merge dibatalkan; branch task tetap aman.");
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", "main", branch])) {
    git(["switch", branch]);
    throw new Error("Main berubah setelah validation. Task branch tetap aman; jalankan task:finish lagi agar check diulang terhadap main terbaru.");
  }

  git(["merge", "--no-ff", branch, "-m", `merge(${task.id}): integrate task`]);
  // Tutup task pada main lokal sebelum satu-satunya push final, sehingga merge + archive task atomik dari sisi remote.
  closeTaskOnMain(task.id);
  try {
    git(["push", "origin", "main"]);
  } catch {
    console.warn("Push main ditolak atau origin/main berubah. Main remote tidak disentuh; branch task tetap aman.");
    git(["fetch", "origin", "main"]);
    git(["reset", "--hard", "origin/main"]);
    git(["switch", branch]);
    throw new Error("Jalankan task:finish lagi untuk merge + recheck terhadap main terbaru. Jika repository rules memang melarang direct push main, gunakan PR hanya sebagai pengecualian.");
  }

  // Setelah task DONE, bersihkan seluruh branch percobaan task yang sama (-r2/-r3) agar tidak membingungkan user.
  cleanupTaskBranchFamily(branch);

  // Archive source terbaru otomatis agar user tinggal upload hasil clean ZIP pada review berikutnya.
  try {
    npmRun("zip");
  } catch {
    console.warn("Warning: task dan push main sudah selesai, tetapi clean ZIP otomatis gagal dibuat. Main tetap aman dan sudah tersinkron.");
  }

  console.log(`${task.id} selesai: validation PASS, merge ke main berhasil, main sudah dipush, task di-archive, clean ZIP diperbarui.`);
};

main();

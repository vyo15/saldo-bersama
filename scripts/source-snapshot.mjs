import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaultRunGit = (args, { projectRoot = defaultRoot } = {}) => execFileSync("git", args, {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim();

export const summarizeWorkingTree = (source = "") => {
  const lines = String(source || "").split(/\r?\n/).filter(Boolean);
  const summary = {
    changed: lines.length,
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflicted: 0,
  };

  for (const line of lines) {
    const status = line.slice(0, 2);
    if (status === "??") {
      summary.untracked += 1;
      continue;
    }
    if (/U|AA|DD/.test(status)) {
      summary.conflicted += 1;
      continue;
    }
    if (status.includes("R")) {
      summary.renamed += 1;
      continue;
    }
    if (status.includes("D")) {
      summary.deleted += 1;
      continue;
    }
    if (status.includes("A")) {
      summary.added += 1;
      continue;
    }
    summary.modified += 1;
  }

  return summary;
};

const readRemoteMainState = ({ runGit, projectRoot, headSha }) => {
  try {
    const remoteMainSha = runGit(["rev-parse", "--verify", "refs/remotes/origin/main"], { projectRoot });
    const counts = runGit(["rev-list", "--left-right", "--count", `refs/remotes/origin/main...${headSha}`], { projectRoot })
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10));
    const [behind = 0, ahead = 0] = counts;
    return {
      available: true,
      commit: remoteMainSha,
      shortCommit: remoteMainSha.slice(0, 8),
      ahead: Number.isInteger(ahead) ? ahead : 0,
      behind: Number.isInteger(behind) ? behind : 0,
    };
  } catch {
    return { available: false, commit: null, shortCommit: null, ahead: null, behind: null };
  }
};

export const inspectSourceSnapshot = ({ projectRoot = defaultRoot, runGit = defaultRunGit } = {}) => {
  try {
    if (runGit(["rev-parse", "--is-inside-work-tree"], { projectRoot }) !== "true") {
      return { available: false, reason: "not-git" };
    }

    const branch = runGit(["branch", "--show-current"], { projectRoot }) || "detached";
    const commit = runGit(["rev-parse", "HEAD"], { projectRoot });
    const shortCommit = runGit(["rev-parse", "--short=8", "HEAD"], { projectRoot });
    const commitMessage = runGit(["log", "-1", "--pretty=%s"], { projectRoot });
    const workingTree = runGit(["status", "--short", "--untracked-files=normal"], { projectRoot });
    const changes = summarizeWorkingTree(workingTree);
    const remoteMain = readRemoteMainState({ runGit, projectRoot, headSha: commit });

    return {
      available: true,
      branch,
      commit,
      shortCommit,
      commitMessage,
      workingTreeClean: changes.changed === 0,
      changes,
      remoteMain,
    };
  } catch {
    return { available: false, reason: "git-unavailable" };
  }
};

const changeSummary = (changes = {}) => [
  ["modified", changes.modified],
  ["added", changes.added],
  ["deleted", changes.deleted],
  ["renamed", changes.renamed],
  ["untracked", changes.untracked],
  ["conflicted", changes.conflicted],
]
  .filter(([, value]) => Number(value) > 0)
  .map(([label, value]) => `${label} ${value}`)
  .join(", ");

export const sourceSnapshotLines = (snapshot = {}) => {
  if (!snapshot.available) {
    return [
      "Git metadata  : tidak tersedia (source bukan Git working tree)",
      "Working tree  : tidak dapat diperiksa",
    ];
  }

  const lines = [
    `Branch        : ${snapshot.branch}`,
    `Commit        : ${snapshot.shortCommit}  ${snapshot.commitMessage}`,
    `Working tree  : ${snapshot.workingTreeClean ? "CLEAN" : `DIRTY (${snapshot.changes?.changed || 0} perubahan)`}`,
  ];

  if (!snapshot.workingTreeClean) {
    const details = changeSummary(snapshot.changes);
    if (details) lines.push(`Changes       : ${details}`);
  }

  if (snapshot.remoteMain?.available) {
    lines.push(
      `origin/main   : ${snapshot.remoteMain.shortCommit}  ahead ${snapshot.remoteMain.ahead} / behind ${snapshot.remoteMain.behind}`,
    );
  }

  return lines;
};

export const printSourceSnapshot = (snapshot, { logger = console } = {}) => {
  logger.log("\n==================================================");
  logger.log("SOURCE SNAPSHOT");
  logger.log("==================================================");
  sourceSnapshotLines(snapshot).forEach((line) => logger.log(line));
  if (snapshot.available && snapshot.branch !== "main") {
    logger.warn?.(`PERINGATAN: branch aktif \`${snapshot.branch}\`, sedangkan source canonical project menggunakan \`main\`.`);
  }
  if (snapshot.available && !snapshot.workingTreeClean) {
    logger.warn?.("Perubahan lokal ikut diverifikasi dan dipaketkan. Commit tetap diwajibkan sebelum push ke main.");
  }
  logger.log("==================================================");
};

export const formatSourceSnapshotFile = (snapshot = {}, { verified = false } = {}) => {
  const lines = [
    "SALDO BERSAMA SOURCE SNAPSHOT",
    "Generated by: npm run zip",
    "Purpose: provenance only; bukan authority behavior/project status.",
    "",
    ...sourceSnapshotLines(snapshot),
  ];

  if (snapshot.available) {
    lines.push(`Full commit   : ${snapshot.commit}`);
  }
  lines.push(
    "",
    verified
      ? "Archive telah melewati full verification sebelum dibuat."
      : "Verification status tidak direkam oleh helper ini; gunakan npm run zip untuk verified archive.",
    "",
  );
  return lines.join("\n");
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const snapshot = inspectSourceSnapshot();
  printSourceSnapshot(snapshot);
}

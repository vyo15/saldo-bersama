import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TEAM_CODES = Object.freeze(["COORD", "FE", "BE"]);
export const TASK_STATUSES = Object.freeze(["DRAFT", "APPROVED", "IN_PROGRESS", "ON_HOLD", "DONE"]);
export const TASK_PRIORITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
export const TASK_RISKS = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const ACTIVE_CODING_STATUSES = new Set(["APPROVED", "IN_PROGRESS"]);

export const GUARDED_PATH_PATTERNS = Object.freeze([
  "AGENTS.md",
  "package.json",
  "package-lock.json",
  "frontend/package.json",
  "frontend/vite.config.js",
  "frontend/eslint.config.js",
  "vercel.json",
  ".env.example",
  ".node-version",
  ".npmrc",
  ".jscpd.json",
  "eslint.backend.config.js",
  ".github/**",
  "docs/WORKFLOW.md",
  "docs/ENVIRONMENT_VARIABLES.md",
  "docs/DEPLOYMENT.md",
  "docs/DATABASE_MIGRATION_POLICY.md",
  "docs/RECOVERY_RUNBOOK.md",
  "docs/ROLLBACK_RUNBOOK.md",
  "docs/adr/**",
  "docs/rfc/**",
  "database/**",
  "api/**",
  "apps-script/**",
  "frontend/src/features/auth/**",
  "frontend/src/services/auth/**",
  "frontend/src/services/api/**",
  "frontend/src/domain/**",
  "frontend/src/app/FinanceContext.jsx",
  "scripts/**",
]);

const TASK_FILE_PATTERN = /^SB-\d{3,4}\.md$/;
const TASK_ID_PATTERN = /^SB-\d{3,4}$/;
export const BRANCH_PATTERN = /^(?:feat|fix|security|perf|docs|test|chore)\/(SB-\d{3,4})-[a-z0-9][a-z0-9-]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizePath = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");
const stripTicks = (value) => value.trim().replace(/^`|`$/g, "");
const splitIds = (value) => {
  const normalized = stripTicks(value || "NONE");
  if (!normalized || normalized === "NONE") return [];
  return normalized.split(",").map((item) => item.trim()).filter(Boolean);
};

const globToRegex = (pattern) => {
  const normalized = normalizePath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  source += "$";
  return new RegExp(source);
};

export const matchesPathPattern = (file, pattern) => globToRegex(pattern).test(normalizePath(file));

const parseTable = (source) => {
  const fields = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/);
    if (!match) continue;
    const key = match[1].trim();
    if (["Field", "---"].includes(key)) continue;
    fields.set(key, stripTicks(match[2]));
  }
  return fields;
};

const parseListSection = (source, heading) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = new RegExp(`^## ${escaped}\\s*$`, "m").exec(source);
  if (!headingMatch) return [];
  const remainder = source.slice(headingMatch.index + headingMatch[0].length);
  const nextHeading = /^## /m.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  return [...section.matchAll(/^\s*-\s+`([^`]+)`\s*$/gm)].map((item) => normalizePath(item[1]));
};

const extractHeadingBody = (source, heading) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^${escaped}\\s*$`, "m");
  const match = headingPattern.exec(source);
  if (!match) return "";

  const contentStart = match.index + match[0].length;
  const level = heading.match(/^#+/)?.[0].length || 1;
  const nextHeading = new RegExp(`^#{1,${level}}\\s+`, "m").exec(source.slice(contentStart));
  const contentEnd = nextHeading ? contentStart + nextHeading.index : source.length;
  return source.slice(contentStart, contentEnd).trim();
};

const validateArchivedClosure = (task, errors) => {
  if (task.location !== "archive") return;

  const acceptance = extractHeadingBody(task.source, "## Acceptance Criteria");
  if (acceptance && /^- \[ \]/m.test(acceptance)) {
    errors.push(`${task.relative}: task archive masih memiliki Acceptance Criteria yang belum ditutup.`);
  }

  const remaining = extractHeadingBody(task.source, "### Remaining");
  if (remaining && !/(tidak ada|none|selesai)/i.test(remaining)) {
    errors.push(`${task.relative}: task archive masih memiliki Remaining work yang aktif.`);
  }

  const resumeFrom = extractHeadingBody(task.source, "### Resume From");
  if (resumeFrom && !/(task selesai|tidak ada|none)/i.test(resumeFrom)) {
    errors.push(`${task.relative}: task archive masih memiliki Resume From yang aktif.`);
  }

  const validation = extractHeadingBody(task.source, "### Validation Actually Run");
  if (validation && /\bNOT[ _-]?RUN\b/i.test(validation)) {
    errors.push(`${task.relative}: task archive masih mencatat validation NOT RUN.`);
  }
};

const parseTaskFile = (relative, location) => {
  const absolute = path.join(root, relative);
  const source = readFileSync(absolute, "utf8");
  const fields = parseTable(source);
  return {
    relative,
    location,
    source,
    fields,
    id: fields.get("Task ID") || "",
    status: fields.get("Status") || "",
    priority: fields.get("Priority") || "",
    team: fields.get("Team") || "",
    dependsOn: splitIds(fields.get("Depends On")),
    risk: fields.get("Risk") || "",
    guarded: fields.get("Guarded") || "",
    guardApproval: fields.get("Guard Approval") || "",
    branch: fields.get("Branch") || "",
    base: fields.get("Base") || "",
    updated: fields.get("Updated") || "",
    holdReason: fields.get("Hold Reason") || "NONE",
    resumeCondition: fields.get("Resume Condition") || "NONE",
    writeScope: parseListSection(source, "Write Scope"),
    readOnly: parseListSection(source, "Read Only"),
    forbidden: parseListSection(source, "Forbidden"),
  };
};

const loadDirectory = (relative, location) => {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((name) => TASK_FILE_PATTERN.test(name))
    .sort()
    .map((name) => parseTaskFile(`${relative}/${name}`, location));
};

export const loadTaskRegistry = () => {
  const active = loadDirectory("docs/tasks/active", "active");
  const archive = loadDirectory("docs/tasks/archive", "archive");
  const all = [...active, ...archive];
  const byId = new Map(all.map((task) => [task.id, task]));
  return { active, archive, all, byId };
};

const validateTaskShape = (task, errors) => {
  const expectedId = path.basename(task.relative, ".md");
  const requiredFields = [
    "Task ID",
    "Status",
    "Priority",
    "Team",
    "Depends On",
    "Risk",
    "Guarded",
    "Guard Approval",
    "Branch",
    "Base",
    "Updated",
  ];

  for (const field of requiredFields) {
    if (!task.fields.has(field) || !task.fields.get(field)) errors.push(`${task.relative}: field '${field}' wajib diisi.`);
  }

  if (task.id !== expectedId) errors.push(`${task.relative}: Task ID harus ${expectedId}, ditemukan ${task.id || "kosong"}.`);
  if (!TASK_ID_PATTERN.test(task.id)) errors.push(`${task.relative}: Task ID invalid: ${task.id}.`);
  if (!TASK_STATUSES.includes(task.status)) errors.push(`${task.relative}: status invalid: ${task.status}.`);
  if (!TASK_PRIORITIES.includes(task.priority)) errors.push(`${task.relative}: priority invalid: ${task.priority}.`);
  if (!TEAM_CODES.includes(task.team)) errors.push(`${task.relative}: Team invalid: ${task.team}.`);
  if (!TASK_RISKS.includes(task.risk)) errors.push(`${task.relative}: Risk invalid: ${task.risk}.`);
  if (!["YES", "NO"].includes(task.guarded)) errors.push(`${task.relative}: Guarded harus YES atau NO.`);
  if (task.guarded === "YES" && task.guardApproval !== "APPROVED") {
    errors.push(`${task.relative}: guarded task membutuhkan Guard Approval APPROVED.`);
  }
  if (task.guarded === "NO" && !["NOT_REQUIRED", "APPROVED"].includes(task.guardApproval)) {
    errors.push(`${task.relative}: Guard Approval harus NOT_REQUIRED atau APPROVED.`);
  }
  if (["HIGH", "CRITICAL"].includes(task.risk) && task.guarded !== "YES") {
    errors.push(`${task.relative}: Risk ${task.risk} wajib Guarded YES.`);
  }
  if (!BRANCH_PATTERN.test(task.branch) || !task.branch.includes(task.id)) {
    errors.push(`${task.relative}: branch invalid atau tidak memuat Task ID: ${task.branch}.`);
  }
  if (!task.base) errors.push(`${task.relative}: Base wajib diisi.`);
  if (!DATE_PATTERN.test(task.updated) || Number.isNaN(Date.parse(`${task.updated}T00:00:00Z`))) {
    errors.push(`${task.relative}: Updated harus YYYY-MM-DD valid.`);
  }
  if (task.writeScope.length === 0) errors.push(`${task.relative}: Write Scope tidak boleh kosong.`);
  if (task.status === "ON_HOLD") {
    if (!task.holdReason || task.holdReason === "NONE") errors.push(`${task.relative}: ON_HOLD membutuhkan Hold Reason.`);
    if (!task.resumeCondition || task.resumeCondition === "NONE") errors.push(`${task.relative}: ON_HOLD membutuhkan Resume Condition.`);
  }
  if (task.location === "active" && task.status === "DONE") errors.push(`${task.relative}: task DONE harus dipindah ke archive.`);
  if (task.location === "archive" && task.status !== "DONE") errors.push(`${task.relative}: task archive harus berstatus DONE.`);
  for (const id of task.dependsOn) {
    if (!TASK_ID_PATTERN.test(id)) errors.push(`${task.relative}: dependency task invalid: ${id}.`);
  }
  if (task.dependsOn.includes(task.id)) errors.push(`${task.relative}: task tidak boleh bergantung pada dirinya sendiri.`);
  validateArchivedClosure(task, errors);
};

const staticPrefix = (pattern) => normalizePath(pattern).split("*")[0].replace(/\/$/, "");
const patternsMayOverlap = (left, right) => {
  if (left === right) return true;
  const leftPrefix = staticPrefix(left);
  const rightPrefix = staticPrefix(right);
  if (!leftPrefix || !rightPrefix) return true;
  return leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix);
};

const validateRegistryLinks = (registry, errors) => {
  const idCounts = new Map();
  for (const task of registry.all) idCounts.set(task.id, (idCounts.get(task.id) || 0) + 1);
  for (const [id, count] of idCounts) if (id && count > 1) errors.push(`Task ID duplikat: ${id}.`);

  for (const task of registry.all) {
    for (const id of task.dependsOn) {
      if (!registry.byId.has(id)) errors.push(`${task.relative}: dependency ${id} tidak ditemukan di active/archive.`);
    }

    const unresolved = task.dependsOn.filter((id) => registry.byId.get(id)?.status !== "DONE");
    if (ACTIVE_CODING_STATUSES.has(task.status) && unresolved.length > 0) {
      errors.push(`${task.relative}: status ${task.status} tidak boleh memiliki dependency unresolved: ${unresolved.join(", ")}.`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (id, trail = []) => {
    if (visiting.has(id)) {
      errors.push(`Dependency cycle: ${[...trail, id].join(" -> ")}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const task = registry.byId.get(id);
    for (const dependency of task?.dependsOn || []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of registry.all) visit(task.id);

  // Banyak tab/task boleh aktif bersamaan, termasuk dari team yang sama.
  // Yang dilarang hanya dua task coding aktif menulis area yang berpotensi sama.
  const actionable = registry.active.filter((task) => ACTIVE_CODING_STATUSES.has(task.status));
  for (let leftIndex = 0; leftIndex < actionable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < actionable.length; rightIndex += 1) {
      const left = actionable[leftIndex];
      const right = actionable[rightIndex];
      const overlap = left.writeScope.some((leftPattern) =>
        right.writeScope.some((rightPattern) => patternsMayOverlap(leftPattern, rightPattern)));
      if (overlap) {
        errors.push(
          `Write Scope overlap antara ${left.id} (${left.team}) dan ${right.id} (${right.team}). `
          + "Task paralel boleh banyak, tetapi path yang sama harus diselesaikan bergantian.",
        );
      }
    }
  }
};

export const validateTaskRelationships = (registry) => {
  const errors = [];
  validateRegistryLinks(registry, errors);
  return errors;
};

const git = (args, options = {}) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  ...options,
}).trim();

const resolveBranch = () => {
  if (process.env.TASK_BRANCH) return process.env.TASK_BRANCH.trim();
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF.trim();
  try {
    return git(["branch", "--show-current"]);
  } catch {
    return "";
  }
};

const refExists = (ref) => {
  try {
    git(["rev-parse", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
};

const resolveBaseRef = () => {
  const candidates = [
    process.env.TASK_BASE_REF,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "",
    process.env.GITHUB_BASE_REF,
    "origin/main",
    "main",
  ].filter(Boolean);
  return candidates.find(refExists) || "";
};

const changedFilesFromGit = (baseRef) => {
  if (!baseRef) return [];
  const mergeBase = git(["merge-base", "HEAD", baseRef]);
  const tracked = git(["diff", "--name-only", "--diff-filter=ACMRDTUXB", mergeBase])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath);
  const working = git(["diff", "--name-only", "--diff-filter=ACMRDTUXB"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath);
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMRDTUXB"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath);
  return [...new Set([...tracked, ...working, ...staged, ...untracked])].sort();
};

const validateBranchScope = (registry, errors) => {
  let insideGit = false;
  try {
    insideGit = git(["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return { branch: "", baseRef: "", changedFiles: [] };
  }
  if (!insideGit) return { branch: "", baseRef: "", changedFiles: [] };

  const branch = resolveBranch();
  if (!branch || branch === "main" || branch === "master") return { branch, baseRef: "", changedFiles: [] };

  const match = branch.match(BRANCH_PATTERN);
  if (!match) {
    errors.push(`Branch '${branch}' harus mengikuti <type>/SB-xxx-description.`);
    return { branch, baseRef: "", changedFiles: [] };
  }

  const taskId = match[1];
  const task = registry.active.find((item) => item.id === taskId);
  if (!task) {
    errors.push(`Branch ${branch} tidak memiliki task card aktif ${taskId}.`);
    return { branch, baseRef: "", changedFiles: [] };
  }
  if (task.branch !== branch) errors.push(`${task.relative}: branch task '${task.branch}' tidak cocok dengan branch aktif '${branch}'.`);
  if (!ACTIVE_CODING_STATUSES.has(task.status)) {
    errors.push(`${task.relative}: status ${task.status} belum mengizinkan perubahan pada branch task.`);
  }

  const baseRef = resolveBaseRef();
  if (!baseRef) {
    errors.push(`Base Git untuk scope diff tidak dapat ditemukan pada branch ${branch}.`);
    return { branch, baseRef: "", changedFiles: [] };
  }

  const changedFiles = changedFilesFromGit(baseRef);
  for (const file of changedFiles) {
    const isOwnTaskCard = file === task.relative;
    const allowed = isOwnTaskCard || task.writeScope.some((pattern) => matchesPathPattern(file, pattern));
    if (!allowed) errors.push(`${task.id}: modified path di luar Write Scope: ${file}.`);
  }

  const guardedChanged = changedFiles.filter((file) =>
    GUARDED_PATH_PATTERNS.some((pattern) => matchesPathPattern(file, pattern)));
  if (guardedChanged.length > 0 && task.guarded !== "YES") {
    errors.push(`${task.id}: guarded path berubah tetapi Guarded bukan YES: ${guardedChanged.join(", ")}.`);
  }
  if (guardedChanged.length > 0 && task.guardApproval !== "APPROVED") {
    errors.push(`${task.id}: guarded path berubah tanpa Guard Approval APPROVED.`);
  }

  return { branch, baseRef, changedFiles, task, guardedChanged };
};

export const validateTaskRepository = () => {
  const registry = loadTaskRegistry();
  const errors = [];
  for (const task of registry.all) validateTaskShape(task, errors);
  validateRegistryLinks(registry, errors);
  const scope = validateBranchScope(registry, errors);
  return { registry, errors, scope };
};

const run = () => {
  const { registry, errors, scope } = validateTaskRepository();
  if (errors.length > 0) {
    console.error("Task governance check FAILED.");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const branchLabel = scope.branch || "non-git/main";
  const scopeLabel = scope.changedFiles?.length ? `${scope.changedFiles.length} changed path tervalidasi` : "registry-only";
  console.log(`Task governance bersih: ${registry.active.length} active, ${registry.archive.length} archived; branch ${branchLabel}; ${scopeLabel}.`);
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) run();

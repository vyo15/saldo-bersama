import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TEAM_CODES = Object.freeze(["COORD", "UIUX", "FE", "BE", "DB", "QA"]);
export const TASK_STATUSES = Object.freeze([
  "DRAFT",
  "READY",
  "APPROVED",
  "IN_PROGRESS",
  "ON_HOLD",
  "READY_FOR_QA",
  "READY_FOR_MERGE",
  "DONE",
]);
export const TASK_PRIORITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
export const TASK_RISKS = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const TASK_RESULTS = Object.freeze(["NOT_RUN", "PENDING", "PASS", "FAIL"]);
export const ACTIVE_CODING_STATUSES = new Set(["APPROVED", "IN_PROGRESS"]);

const GUARDED_PATH_PATTERNS = Object.freeze([
  "AGENTS.md",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".env.example",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/**",
  "docs/WORKFLOW.md",
  "docs/ENVIRONMENT_VARIABLES.md",
  "docs/DEPLOYMENT.md",
  "docs/DATABASE_MIGRATION_POLICY.md",
  "docs/RECOVERY_RUNBOOK.md",
  "docs/ROLLBACK_RUNBOOK.md",
  "database/migrations/**",
  "api/_lib/security.js",
  "api/_lib/actions/**",
  "api/_lib/services/finance.js",
  "api/_lib/services/maintenance.js",
  "api/_lib/services/maintenance/**",
  "api/_lib/services/audit.js",
  "api/session.js",
  "api/gateway.js",
  "apps-script/**",
  "scripts/validate-task.mjs",
  "scripts/list-tasks.mjs",
  "scripts/db-*.mjs",
  "scripts/*vercel*.mjs",
  "scripts/runtime-environment.mjs",
  "scripts/bootstrap-development-env.mjs",
]);

const TASK_FILE_PATTERN = /^SB-\d{3,4}\.md$/;
const TASK_ID_PATTERN = /^SB-\d{3,4}$/;
const BRANCH_PATTERN = /^(?:feat|fix|security|perf|docs|test|chore)\/(SB-\d{3,4})-[a-z0-9][a-z0-9-]*$/;
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
  const match = source.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |\\Z)`, "m"));
  if (!match) return [];
  return [...match[1].matchAll(/^\s*-\s+`([^`]+)`\s*$/gm)].map((item) => normalizePath(item[1]));
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
    team: fields.get("Primary Team") || "",
    supportingTeams: splitIds((fields.get("Supporting Teams") || "").replaceAll(" ", "")),
    workPackage: fields.get("Work Package") || "",
    parent: fields.get("Parent") || "NONE",
    requiredForParent: fields.get("Required For Parent") || "",
    dependsOn: splitIds(fields.get("Depends On")),
    related: splitIds(fields.get("Related")),
    risk: fields.get("Risk") || "",
    guarded: fields.get("Guarded") || "",
    guardApproval: fields.get("Guard Approval") || "",
    branch: fields.get("Branch") || "",
    base: fields.get("Base") || "",
    updated: fields.get("Updated") || "",
    holdReason: fields.get("Hold Reason") || "",
    resumeCondition: fields.get("Resume Condition") || "",
    qaResult: fields.get("QA Result") || "",
    integrationResult: fields.get("Integration Result") || "",
    postMergeResult: fields.get("Post-Merge Result") || "",
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
    "Primary Team",
    "Supporting Teams",
    "Work Package",
    "Parent",
    "Required For Parent",
    "Depends On",
    "Related",
    "Risk",
    "Guarded",
    "Guard Approval",
    "Branch",
    "Base",
    "Updated",
    "Hold Reason",
    "Resume Condition",
    "QA Result",
    "Integration Result",
    "Post-Merge Result",
  ];
  for (const field of requiredFields) {
    if (!task.fields.has(field) || !task.fields.get(field)) errors.push(`${task.relative}: field '${field}' wajib diisi.`);
  }
  if (task.id !== expectedId) errors.push(`${task.relative}: Task ID harus ${expectedId}, ditemukan ${task.id || "kosong"}.`);
  if (!TASK_ID_PATTERN.test(task.id)) errors.push(`${task.relative}: Task ID invalid: ${task.id}.`);
  if (!TASK_STATUSES.includes(task.status)) errors.push(`${task.relative}: status invalid: ${task.status}.`);
  if (!TASK_PRIORITIES.includes(task.priority)) errors.push(`${task.relative}: priority invalid: ${task.priority}.`);
  if (!TEAM_CODES.includes(task.team)) errors.push(`${task.relative}: Primary Team invalid: ${task.team}.`);
  for (const team of task.supportingTeams) {
    if (!TEAM_CODES.includes(team)) errors.push(`${task.relative}: Supporting Team invalid: ${team}.`);
  }
  if (!task.workPackage || !/^[A-Z0-9][A-Z0-9_-]*$/.test(task.workPackage)) {
    errors.push(`${task.relative}: Work Package harus label uppercase sederhana.`);
  }
  if (!(task.parent === "NONE" || TASK_ID_PATTERN.test(task.parent))) errors.push(`${task.relative}: Parent invalid: ${task.parent}.`);
  if (!['YES', 'NO'].includes(task.requiredForParent)) errors.push(`${task.relative}: Required For Parent harus YES atau NO.`);
  if (task.requiredForParent === "YES" && task.parent === "NONE") errors.push(`${task.relative}: Required For Parent YES membutuhkan Parent.`);
  if (!TASK_RISKS.includes(task.risk)) errors.push(`${task.relative}: Risk invalid: ${task.risk}.`);
  if (!['YES', 'NO'].includes(task.guarded)) errors.push(`${task.relative}: Guarded harus YES atau NO.`);
  if (task.guarded === "YES" && task.guardApproval !== "APPROVED") errors.push(`${task.relative}: guarded task membutuhkan Guard Approval APPROVED.`);
  if (task.guarded === "NO" && !["NOT_REQUIRED", "APPROVED"].includes(task.guardApproval)) errors.push(`${task.relative}: Guard Approval harus NOT_REQUIRED atau APPROVED.`);
  if (!BRANCH_PATTERN.test(task.branch) || !task.branch.includes(task.id)) errors.push(`${task.relative}: branch invalid atau tidak memuat Task ID: ${task.branch}.`);
  if (!task.base) errors.push(`${task.relative}: Base wajib diisi.`);
  if (!DATE_PATTERN.test(task.updated) || Number.isNaN(Date.parse(`${task.updated}T00:00:00Z`))) errors.push(`${task.relative}: Updated harus YYYY-MM-DD valid.`);
  for (const [label, result] of [["QA Result", task.qaResult], ["Integration Result", task.integrationResult], ["Post-Merge Result", task.postMergeResult]]) {
    if (!TASK_RESULTS.includes(result)) errors.push(`${task.relative}: ${label} invalid: ${result}.`);
  }
  if (task.supportingTeams.includes(task.team)) errors.push(`${task.relative}: Primary Team tidak perlu diulang sebagai Supporting Team.`);
  if (task.writeScope.length === 0) errors.push(`${task.relative}: Write Scope tidak boleh kosong.`);
  if (task.status === "ON_HOLD") {
    if (!task.holdReason || task.holdReason === "NONE") errors.push(`${task.relative}: ON_HOLD membutuhkan Hold Reason.`);
    if (!task.resumeCondition || task.resumeCondition === "NONE") errors.push(`${task.relative}: ON_HOLD membutuhkan Resume Condition.`);
  }
  if (task.location === "active" && task.status === "DONE") errors.push(`${task.relative}: task DONE harus dipindah ke archive.`);
  if (task.location === "archive" && task.status !== "DONE") errors.push(`${task.relative}: task archive harus berstatus DONE.`);
  if (task.status === "READY_FOR_MERGE" && (task.qaResult !== "PASS" || task.integrationResult !== "PASS")) {
    errors.push(`${task.relative}: READY_FOR_MERGE membutuhkan QA Result PASS dan Integration Result PASS.`);
  }
  if (task.status === "DONE" && (task.qaResult !== "PASS" || task.integrationResult !== "PASS" || task.postMergeResult !== "PASS")) {
    errors.push(`${task.relative}: DONE membutuhkan QA, Integration, dan Post-Merge PASS.`);
  }
  for (const id of [...task.dependsOn, ...task.related]) {
    if (!TASK_ID_PATTERN.test(id)) errors.push(`${task.relative}: referensi task invalid: ${id}.`);
  }
  if (task.parent === task.id || task.dependsOn.includes(task.id)) errors.push(`${task.relative}: task tidak boleh mereferensikan dirinya sendiri sebagai parent/dependency.`);
};

const validateRegistryLinks = (registry, errors) => {
  const idCounts = new Map();
  for (const task of registry.all) idCounts.set(task.id, (idCounts.get(task.id) || 0) + 1);
  for (const [id, count] of idCounts) if (id && count > 1) errors.push(`Task ID duplikat: ${id}.`);

  for (const task of registry.all) {
    const refs = [
      ...(task.parent !== "NONE" ? [task.parent] : []),
      ...task.dependsOn,
      ...task.related,
    ];
    for (const id of refs) if (!registry.byId.has(id)) errors.push(`${task.relative}: referensi ${id} tidak ditemukan di active/archive.`);

    const unresolved = task.dependsOn.filter((id) => registry.byId.get(id)?.status !== "DONE");
    if (["APPROVED", "IN_PROGRESS", "READY_FOR_QA", "READY_FOR_MERGE"].includes(task.status) && unresolved.length > 0) {
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

  const actionableStatuses = new Set(["APPROVED", "IN_PROGRESS", "READY_FOR_QA", "READY_FOR_MERGE"]);
  const actionable = registry.active.filter((task) => actionableStatuses.has(task.status));
  const staticPrefix = (pattern) => normalizePath(pattern).split("*")[0].replace(/\/$/, "");
  const patternsMayOverlap = (left, right) => {
    if (left === right) return true;
    const leftPrefix = staticPrefix(left);
    const rightPrefix = staticPrefix(right);
    if (!leftPrefix || !rightPrefix) return true;
    return leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix);
  };
  for (let leftIndex = 0; leftIndex < actionable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < actionable.length; rightIndex += 1) {
      const left = actionable[leftIndex];
      const right = actionable[rightIndex];
      const overlap = left.writeScope.some((leftPattern) => right.writeScope.some((rightPattern) => patternsMayOverlap(leftPattern, rightPattern)));
      if (overlap) {
        errors.push(`Write Scope overlap antara ${left.id} (${left.team}) dan ${right.id} (${right.team}). Task paralel harus dipisah atau salah satunya ON_HOLD sampai task lain DONE.`);
      }
    }
  }

  const inProgressByTeam = new Map();
  for (const task of registry.active.filter((item) => item.status === "IN_PROGRESS")) {
    const list = inProgressByTeam.get(task.team) || [];
    list.push(task.id);
    inProgressByTeam.set(task.team, list);
  }
  for (const [team, ids] of inProgressByTeam) {
    if (ids.length > 1) errors.push(`WIP limit: ${team} memiliki lebih dari satu IN_PROGRESS: ${ids.join(", ")}.`);
  }

  for (const parent of registry.archive) {
    const requiredActiveChildren = registry.active.filter((child) => child.parent === parent.id && child.requiredForParent === "YES");
    if (requiredActiveChildren.length > 0) {
      errors.push(`${parent.relative}: parent DONE masih memiliki required child aktif: ${requiredActiveChildren.map((child) => child.id).join(", ")}.`);
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
    "main",
    "origin/main",
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
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath);
  return [...new Set([...tracked, ...untracked])].sort();
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

  const guardedChanged = changedFiles.filter((file) => GUARDED_PATH_PATTERNS.some((pattern) => matchesPathPattern(file, pattern)));
  if (guardedChanged.length > 0 && task.guarded !== "YES") {
    errors.push(`${task.id}: guarded path berubah tetapi Guarded bukan YES: ${guardedChanged.join(", ")}.`);
  }
  if (guardedChanged.length > 0 && task.guardApproval !== "APPROVED") {
    errors.push(`${task.id}: guarded path berubah tanpa Guard Approval APPROVED.`);
  }

  return { branch, baseRef, changedFiles, task };
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

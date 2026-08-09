import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relative) => readFile(path.join(root, relative), "utf8");
const exists = async (relative) => {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
};

test("quality workflow menjalankan check, guard regression, browser journey, dan verifikasi clean archive", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /Guarded mutation regression[\s\S]*npm run test:guard/);
  assert.match(workflow, /Browser smoke and human-error journey[\s\S]*timeout-minutes:\s*3/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /VITE_GOOGLE_CLIENT_ID:\s*ci-browser-smoke\.apps\.googleusercontent\.com/);
  assert.match(workflow, /VITE_FIREBASE_API_KEY:\s*ci-browser-smoke-public-key/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /Duplication report \(non-blocking\)[\s\S]*continue-on-error:\s*true[\s\S]*npm run check:duplicates/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /npm run zip --/);

  const [browserSmoke, browserRuntime] = await Promise.all([
    source("test/browser/browser-smoke.test.mjs"),
    source("test/browser/helpers/app-runtime.mjs"),
  ]);
  assert.match(browserSmoke, /startBrowserAppServer/);
  assert.match(browserSmoke, /startChromium/);
  assert.match(browserSmoke, /openBrowserPage/);
  assert.doesNotMatch(browserSmoke, /createServer\(|spawn\(|terminateChromiumTree|findFreePort/);
  assert.match(browserRuntime, /detached:\s*process\.platform !== "win32"/);
  assert.match(browserRuntime, /stdio:\s*"ignore"/);
  assert.match(browserRuntime, /terminateChromiumTree/);
  assert.match(browserRuntime, /Network\.setBlockedURLs/);
  assert.match(browserRuntime, /accounts\.google\.com\/gsi\/client/);
  assert.ok(
    browserSmoke.indexOf("await chromium?.close()") < browserSmoke.indexOf("await page?.close()"),
    "Chromium process tree harus ditutup sebelum koneksi CDP agar tidak meninggalkan handle pada runner.",
  );
});

test("tooling kualitas dan lifecycle dokumentasi terhubung dari package canonical", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  assert.equal(packageJson.scripts.clean, "node scripts/clean-generated-artifacts.mjs");
  assert.equal(packageJson.scripts["clean:dry-run"], "node scripts/clean-generated-artifacts.mjs --dry-run");
  assert.equal(packageJson.scripts["clean:dependencies"], "node scripts/clean-development-dependencies.mjs");
  assert.equal(packageJson.scripts["test:browser"], "node scripts/prepare-browser-test-build.mjs && node --test test/browser/*.test.mjs");
  assert.equal(packageJson.scripts["audit:production"], "npm audit --omit=dev --audit-level=high");
  assert.equal(packageJson.scripts["audit:all"], "npm audit --audit-level=high");
  assert.equal(packageJson.scripts["check:duplicates"], "npx --yes jscpd@4.2.5 --config .jscpd.json api frontend/src scripts test");
  assert.equal(packageJson.scripts["task:check"], "node scripts/validate-task.mjs");
  assert.equal(packageJson.scripts["task:list"], "node scripts/list-tasks.mjs");
  assert.equal(packageJson.scripts["task:finish"], "node scripts/finish-task.mjs");
  assert.match(packageJson.scripts.check, /^npm run task:check && /);
  assert.equal(packageJson.scripts["lint:backend"], "node node_modules/eslint/bin/eslint.js api scripts test --config eslint.backend.config.js");
  assert.match(packageJson.scripts.lint, /npm run lint:backend/);
  assert.match(packageJson.scripts.check, /build:budget/);
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal((await source(".node-version")).trim(), "24.18.1");
  const duplicationConfig = JSON.parse(await source(".jscpd.json"));
  assert.equal(duplicationConfig.threshold, undefined, "duplikasi masih report-only dan tidak boleh menjadi gate angka buta");
  assert.ok(duplicationConfig.ignore.includes("database/migrations/**"));
  assert.ok(duplicationConfig.ignore.includes("**/*.module.css"));

  const dependencyAudit = await source(".github/workflows/dependency-audit.yml");
  assert.match(dependencyAudit, /workflow_dispatch/);
  assert.match(dependencyAudit, /schedule:/);
  assert.match(dependencyAudit, /node-version:\s*24/);
  assert.match(dependencyAudit, /npm run audit:production/);
  assert.match(dependencyAudit, /npm run audit:all/);
  const dependabot = await source(".github/dependabot.yml");
  assert.match(dependabot, /package-ecosystem:\s*npm/);
  assert.match(dependabot, /interval:\s*weekly/);

  const backendLint = await source("eslint.backend.config.js");
  assert.match(backendLint, /"no-undef": "error"/);
  assert.match(backendLint, /"no-unused-vars"/);

  const lifecycle = await source("docs/DOCUMENT_LIFECYCLE.md");
  for (const label of ["Canonical", "Snapshot", "Runbook", "Historical", "Template"]) {
    assert.match(lifecycle, new RegExp(label, "i"));
  }
});

test("test backend terkelompok berdasarkan tanggung jawab dan namespace runtime tetap bersih", async () => {
  assert.equal(await exists("test/api"), false);
  for (const directory of [
    "test/business",
    "test/database",
    "test/governance",
    "test/integrations",
    "test/maintenance",
    "test/migration",
    "test/performance",
    "test/security",
    "test/tooling",
    "test/browser",
    "test/guards",
  ]) {
    assert.equal(await exists(directory), true, `Missing test boundary: ${directory}`);
  }
});


test("quality runs only on main and pull requests; normal task branches validate locally", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  for (const prefix of ["feat", "fix", "security", "perf", "docs", "test", "chore"]) {
    assert.doesNotMatch(workflow, new RegExp(`${prefix}/SB-\\*`));
  }
  assert.equal(await exists(".github/workflows/task-submit.yml"), false);
});

test("guarded policy fail-closed mencakup seluruh backend/data runtime dan selaras dengan CODEOWNERS", async () => {
  const [{ GUARDED_PATH_PATTERNS, matchesPathPattern }, codeowners] = await Promise.all([
    import("../../scripts/validate-task.mjs"),
    source(".github/CODEOWNERS"),
  ]);
  for (const file of [
    "api/_lib/db/schema.js",
    "api/_lib/firebase.js",
    "api/_lib/idempotency.js",
    "api/_lib/services/planning/recurring.js",
    "api/_lib/services/reporting/periods.js",
    "api/_lib/services/users.js",
    "api/jobs.js",
    "database/migrations/007_notification_preferences.sql",
    "apps-script/Code.js",
    "frontend/package.json",
    "frontend/vite.config.js",
    "frontend/eslint.config.js",
    "frontend/src/features/auth/AuthContext.jsx",
    "frontend/src/services/auth/googleFirebaseAuth.js",
    "frontend/src/services/api/client.js",
    "frontend/src/services/api/transport.js",
    "frontend/src/domain/money.js",
    "frontend/src/domain/dates.js",
    "frontend/src/app/FinanceContext.jsx",
    ".node-version",
    ".npmrc",
    ".jscpd.json",
    "eslint.backend.config.js",
    "scripts/run-backend-tests.mjs",
    "scripts/check-node-syntax.mjs",
    "scripts/check-apps-script-syntax.mjs",
    "scripts/prepare-browser-test-build.mjs",
    "scripts/check-build-budget.mjs",
  ]) {
    assert.equal(
      GUARDED_PATH_PATTERNS.some((pattern) => matchesPathPattern(file, pattern)),
      true,
      `${file} wajib guarded`,
    );
  }
  for (const ownerPath of ["api/", "database/", "apps-script/", ".github/", "frontend/src/features/auth/", "frontend/src/services/auth/", "frontend/src/services/api/", "frontend/src/domain/", "scripts/"]) {
    assert.match(codeowners, new RegExp(`^${ownerPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+@vyo15$`, "m"));
  }
});

test("task finish supports replace-first on main and one local validated merge flow after approval", async () => {
  const finish = await source("scripts/finish-task.mjs");
  assert.match(finish, /prepareTaskBranchFromMain/);
  assert.match(finish, /taskIdFromMessage/);
  assert.match(finish, /availableTaskBranch/);
  assert.match(finish, /git\(\["switch", "-c", branch\]\)/);
  assert.match(finish, /assertCanonicalNodeRuntime/);
  assert.match(finish, /\.node-version/);
  assert.match(finish, /DEPENDENCY_SENSITIVE_PATHS/);
  assert.match(finish, /npmExec\(\["ci"\]\)/);
  assert.match(finish, /npmRun\("check"/);
  assert.match(finish, /npmRun\("test:guard"/);
  assert.match(finish, /browserValidationRequired[\s\S]*scope\.changedFiles[\s\S]*npmRun\("test:browser"/);
  assert.match(finish, /git\(\["merge", "--no-edit", "origin\/main"\]\)/);
  assert.match(finish, /git\(\["push", "-u", "origin", "HEAD"\]\)/);
  assert.doesNotMatch(finish, /gh.*pr.*create/s);
  assert.match(finish, /git\(\["merge", "--no-ff", branch/);
  assert.match(finish, /closeTaskOnMain/);
  assert.match(finish, /finalizeTaskDocument/);
  assert.match(finish, /markAcceptanceCriteriaComplete/);
  assert.match(finish, /### Remaining/);
  assert.match(finish, /### Validation Actually Run/);
  assert.match(finish, /Push main ditolak atau origin\/main berubah/);
  assert.match(finish, /rev-list.*origin\/main\.\.HEAD/s);
  assert.match(finish, /npmRun\("zip"\)/);
  assert.match(finish, /cleanupTaskBranchFamily/);
});


test("task finish end-to-end accepts replace-first on main, revisions stale branch, and merges without PR", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "saldo-bersama-task-finish-"));
  const project = path.join(sandbox, "project");
  const remote = path.join(sandbox, "remote.git");
  const { TASK_BRANCH: _taskBranch, TASK_BASE_REF: _taskBaseRef, ...isolatedEnv } = process.env;
  const run = (command, args, cwd = project) => {
    const result = spawnSync(command, args, { cwd, encoding: "utf8", env: isolatedEnv });
    assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
    return result;
  };

  try {
    await mkdir(path.join(project, "scripts"), { recursive: true });
    await mkdir(path.join(project, "docs/tasks/active"), { recursive: true });
    await mkdir(path.join(project, "docs/tasks/archive"), { recursive: true });
    await writeFile(path.join(project, "scripts/finish-task.mjs"), await source("scripts/finish-task.mjs"));
    await writeFile(path.join(project, "scripts/validate-task.mjs"), await source("scripts/validate-task.mjs"));
    await writeFile(path.join(project, "package.json"), JSON.stringify({
      name: "task-finish-integration",
      version: "1.0.0",
      type: "module",
      scripts: {
        check: "node -e \"console.log('check-pass')\"",
        "test:guard": "node -e \"console.log('guard-pass')\"",
        "test:browser": "node -e \"console.log('browser-pass')\"",
        zip: "node -e \"console.log('zip-pass')\"",
      },
    }, null, 2));
    await writeFile(path.join(project, ".node-version"), `${process.versions.node}\n`);
    await writeFile(path.join(project, "README.md"), "base\n");

    run("git", ["init", "--bare", "-q", remote], sandbox);
    run("git", ["init", "-q"]);
    run("git", ["config", "user.name", "Task Finish Test"]);
    run("git", ["config", "user.email", "task-finish@example.test"]);
    run("git", ["branch", "-M", "main"]);
    run("git", ["add", "-A"]);
    run("git", ["commit", "-qm", "base"]);
    run("git", ["remote", "add", "origin", remote]);
    run("git", ["push", "-q", "-u", "origin", "main"]);

    // Simulasikan branch task lama yang sudah pernah dibuat pada percobaan sebelumnya.
    run("git", ["switch", "-q", "-c", "chore/SB-900-helper-test"]);
    run("git", ["push", "-q", "-u", "origin", "HEAD"]);
    run("git", ["switch", "-q", "main"]);

    // User tetap di main, lalu replace changed-files ZIP terlebih dahulu.
    await writeFile(path.join(project, "docs/tasks/active/SB-900.md"), `# SB-900 - helper integration test

| Field | Value |
|---|---|
| Task ID | \`SB-900\` |
| Status | \`IN_PROGRESS\` |
| Priority | \`P1\` |
| Team | \`COORD\` |
| Depends On | \`NONE\` |
| Risk | \`HIGH\` |
| Guarded | \`YES\` |
| Guard Approval | \`APPROVED\` |
| Branch | \`chore/SB-900-helper-test\` |
| Base | \`main@test\` |
| Updated | \`2026-08-09\` |
| Hold Reason | \`NONE\` |
| Resume Condition | \`NONE\` |

## Acceptance Criteria

- [ ] Helper integration selesai.
- [ ] Canonical validation evidence tercatat.

## Write Scope
- \`README.md\`

## Checkpoint

### Completed

- Fixture dibuat.

### Remaining

- Jalankan helper.

### Resume From

Lanjutkan integration test.

### Validation Actually Run

\`\`\`text
NOT_RUN
\`\`\`

### Known Risks

- Tidak ada.
`);
    await writeFile(path.join(project, "README.md"), "base\ntask change\n");

    const result = run(process.execPath, ["scripts/finish-task.mjs", "chore(SB-900): integration test"]);
    assert.match(result.stdout, /Menggunakan revision aman chore\/SB-900-helper-test-r2/);
    assert.match(result.stdout, /zip-pass/);
    assert.match(result.stdout, /SB-900 selesai/);
    assert.equal(run("git", ["branch", "--show-current"]).stdout.trim(), "main");
    await access(path.join(project, "docs/tasks/archive/SB-900.md"));
    await assert.rejects(access(path.join(project, "docs/tasks/active/SB-900.md")));
    const archivedTask = await readFile(path.join(project, "docs/tasks/archive/SB-900.md"), "utf8");
    assert.match(archivedTask, /\| Status \| `DONE` \|/);
    assert.match(archivedTask, /\| Branch \| `chore\/SB-900-helper-test-r2` \|/);
    assert.doesNotMatch(archivedTask, /- \[ \]/);
    assert.match(archivedTask, /- \[x\] Helper integration selesai\./);
    assert.match(archivedTask, /### Remaining\s+\n\n- Tidak ada\./);
    assert.match(archivedTask, /### Resume From\s+\n\nTask selesai\./);
    assert.match(archivedTask, /NOT_REQUIRED npm ci/);
    assert.match(archivedTask, /PASS npm run check/);
    assert.match(archivedTask, /PASS npm run test:guard/);
    assert.match(archivedTask, /NOT_REQUIRED npm run test:browser/);
    assert.doesNotMatch(archivedTask, /NOT_RUN/);
    assert.match(await readFile(path.join(project, "README.md"), "utf8"), /task change/);

    const remoteTask = spawnSync("git", ["--git-dir", remote, "show-ref", "--verify", "--quiet", "refs/heads/chore/SB-900-helper-test-r2"]);
    assert.notEqual(remoteTask.status, 0, "selected revision branch should be deleted after successful merge");
    const staleTask = spawnSync("git", ["--git-dir", remote, "show-ref", "--verify", "--quiet", "refs/heads/chore/SB-900-helper-test"]);
    assert.notEqual(staleTask.status, 0, "older stale task branches should be cleaned after the task is DONE");
    const remoteArchive = run("git", ["--git-dir", remote, "show", "main:docs/tasks/archive/SB-900.md"], sandbox);
    assert.match(remoteArchive.stdout, /\| Status \| `DONE` \|/);
    assert.match(remoteArchive.stdout, /- \[x\] Helper integration selesai\./);
    assert.doesNotMatch(remoteArchive.stdout, /NOT_RUN/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});


test("task validator menolak archive DONE dengan closure metadata yang masih stale", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "saldo-bersama-archive-closure-"));
  try {
    await mkdir(path.join(sandbox, "scripts"), { recursive: true });
    await mkdir(path.join(sandbox, "docs/tasks/active"), { recursive: true });
    await mkdir(path.join(sandbox, "docs/tasks/archive"), { recursive: true });
    await writeFile(path.join(sandbox, "scripts/validate-task.mjs"), await source("scripts/validate-task.mjs"));
    await writeFile(path.join(sandbox, "docs/tasks/archive/SB-901.md"), `# SB-901 - stale archive

| Field | Value |
|---|---|
| Task ID | \`SB-901\` |
| Status | \`DONE\` |
| Priority | \`P2\` |
| Team | \`COORD\` |
| Depends On | \`NONE\` |
| Risk | \`LOW\` |
| Guarded | \`NO\` |
| Guard Approval | \`NOT_REQUIRED\` |
| Branch | \`chore/SB-901-stale-archive\` |
| Base | \`main@test\` |
| Updated | \`2026-08-09\` |
| Hold Reason | \`NONE\` |
| Resume Condition | \`NONE\` |

## Acceptance Criteria

- [ ] Belum ditutup.

## Write Scope

- \`README.md\`

## Checkpoint

### Remaining

- Masih ada pekerjaan.

### Resume From

Lanjutkan task.

### Validation Actually Run

\`\`\`text
NOT_RUN
\`\`\`
`);
    await writeFile(path.join(sandbox, "README.md"), "fixture\n");

    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Archive Closure Test"],
      ["config", "user.email", "archive-closure@example.test"],
      ["add", "-A"],
      ["commit", "-qm", "fixture"],
      ["branch", "-M", "main"],
    ]) {
      const gitResult = spawnSync("git", args, { cwd: sandbox, encoding: "utf8" });
      assert.equal(gitResult.status, 0, gitResult.stderr);
    }

    const result = spawnSync(process.execPath, ["scripts/validate-task.mjs"], {
      cwd: sandbox,
      encoding: "utf8",
      env: { ...process.env, TASK_BRANCH: "main", TASK_BASE_REF: "main" },
    });
    assert.notEqual(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Acceptance Criteria yang belum ditutup/);
    assert.match(output, /Remaining work yang aktif/);
    assert.match(output, /Resume From yang aktif/);
    assert.match(output, /validation NOT RUN/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

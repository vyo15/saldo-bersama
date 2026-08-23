import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cleanGeneratedArtifacts } from "./clean-generated-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const REQUIRED_NODE_VERSION = readFileSync(path.join(root, ".node-version"), "utf8").trim();
export const REQUIRED_NODE_MAJOR = Number.parseInt(REQUIRED_NODE_VERSION.split(".")[0], 10);

// Satu full gate canonical tanpa alias npm internal. Frontend test dijalankan sekali,
// sedangkan seluruh backend test dijalankan sekali dengan coverage agar tidak diduplikasi.
export const VERIFY_STEPS = Object.freeze([
  Object.freeze({ id: "source", label: "Validasi source canonical", command: "node", args: ["scripts/validate-source-tree.mjs"] }),
  Object.freeze({ id: "lint", label: "Lint dan syntax", command: "npm", args: ["run", "lint"] }),
  Object.freeze({ id: "frontend-test", label: "Frontend regression", command: "npm", args: ["run", "test", "--workspace", "saldo-bersama-frontend"] }),
  Object.freeze({ id: "build", label: "Production build", command: "npm", args: ["run", "build"] }),
  Object.freeze({ id: "build-budget", label: "Build budget", command: "node", args: ["scripts/check-build-budget.mjs"] }),
  Object.freeze({ id: "backend-coverage", label: "Backend regression dan coverage", command: "node", args: ["scripts/run-backend-tests.mjs", "--coverage"] }),
]);

const npmInvocation = (args) => {
  const npmExecPath = String(process.env.npm_execpath || "").trim();
  if (npmExecPath) return { executable: process.execPath, args: [npmExecPath, ...args] };
  if (process.platform === "win32") {
    return {
      executable: String(process.env.ComSpec || "cmd.exe"),
      args: ["/d", "/s", "/c", `npm ${args.join(" ")}`],
    };
  }
  return { executable: "npm", args };
};

const commandInvocation = (step) => {
  if (step.command === "npm") return npmInvocation(step.args);
  if (step.command === "node") return { executable: process.execPath, args: step.args };
  throw new Error(`Verification command tidak dikenal: ${step.command}`);
};

const spawnNpm = (args, { cwd = root, stdio = "inherit" } = {}) => {
  const invocation = npmInvocation(args);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd,
    env: process.env,
    stdio,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  return result;
};

const spawnStep = (step, { cwd = root, stdio = "inherit" } = {}) => {
  const invocation = commandInvocation(step);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd,
    env: process.env,
    stdio,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  return result;
};

export const executeVerificationStep = (step, options = {}) => spawnStep(step, options);

const nodeMajor = (version) => Number.parseInt(String(version || "").replace(/^v/, "").split(".")[0], 10);

export const assertCanonicalNode = (version = process.version) => {
  const normalized = String(version || "").replace(/^v/, "");
  if (normalized === REQUIRED_NODE_VERSION) return REQUIRED_NODE_VERSION;
  throw Object.assign(
    new Error(
      `Node ${REQUIRED_NODE_VERSION} wajib untuk quality gate. Runtime aktif: ${version}. `
      + "Jalankan `fnm use` dari root project lalu ulangi `npm run verify`.",
    ),
    { code: "VERIFY_NODE_VERSION", expectedVersion: REQUIRED_NODE_VERSION, actualVersion: normalized, actualMajor: nodeMajor(version) },
  );
};

export const dependencyRecoveryMessage = () => (
  "Dependency lokal belum sinkron dengan package/lockfile. Jangan menjalankan npm ci setiap selesai patch. "
  + "Gunakan `npm ci` hanya untuk bootstrap/reinstall dependency. Jika Windows memberi EPERM/EBUSY, "
  + "hentikan proses dev/Vite yang memakai repository, jalankan `npm run clean:dependencies -- --force`, "
  + "lalu `npm ci` satu kali dan ulangi `npm run verify`."
);

export const verifyInstalledDependencies = ({ runner = spawnNpm } = {}) => {
  const result = runner(["ls", "--depth=0", "--workspaces", "--include-workspace-root"], { stdio: "pipe" });
  if (result.status === 0) return true;

  const detail = String(result.stderr || result.stdout || "").trim();
  const suffix = detail ? `\n${detail}` : "";
  throw Object.assign(
    new Error(`${dependencyRecoveryMessage()}${suffix}`),
    { code: "VERIFY_DEPENDENCIES", exitCode: result.status ?? 1 },
  );
};

const displayStepCommand = (step) => step.command === "npm"
  ? `npm ${step.args.join(" ")}`
  : `node ${step.args.join(" ")}`;

export const runVerification = ({
  nodeVersion = process.version,
  dependencyCheck = verifyInstalledDependencies,
  runStep = (step) => spawnStep(step),
  logger = console,
} = {}) => {
  assertCanonicalNode(nodeVersion);
  dependencyCheck();

  for (const [index, step] of VERIFY_STEPS.entries()) {
    logger.log(`\n[verify ${index + 1}/${VERIFY_STEPS.length}] ${step.label}: ${displayStepCommand(step)}`);
    const result = runStep(step);
    if (result?.status === 0) continue;
    throw Object.assign(
      new Error(`Verification berhenti karena step \`${step.id}\` gagal.`),
      { code: "VERIFY_STEP_FAILED", step: step.id, exitCode: result?.status ?? 1 },
    );
  }

  logger.log("\nVerification lengkap PASS. Source siap untuk review commit sesuai scope perubahan.");
  return true;
};

export const runVerificationWithCleanup = async (options = {}) => {
  try {
    return runVerification(options);
  } finally {
    await cleanGeneratedArtifacts({ logger: options.cleanupLogger || console });
  }
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    await runVerificationWithCleanup();
  } catch (error) {
    console.error(`\nVERIFY FAILED: ${error?.message || "Quality gate gagal."}`);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedOperations = new Set(["", "migrate", "integrity", "bind"]);

export const resolveVercelDatabaseOperation = (environment = process.env) => {
  const operation = String(environment.SALDO_BERSAMA_DB_OPERATION || "").trim().toLowerCase();
  if (!allowedOperations.has(operation)) {
    throw Object.assign(new Error(`SALDO_BERSAMA_DB_OPERATION tidak valid: ${operation}.`), {
      code: "VERCEL_DB_OPERATION_INVALID",
      operation,
    });
  }
  return operation;
};

export const assertRemoteDatabaseBuildContext = (environment = process.env) => {
  if (String(environment.VERCEL_ENV || "").trim().toLowerCase() !== "production") {
    throw Object.assign(new Error("Operasi database remote hanya boleh berjalan pada Vercel Production build."), {
      code: "REMOTE_PRODUCTION_CONTEXT_INVALID",
    });
  }
  if (!String(environment.TURSO_DATABASE_URL || "").trim() || !String(environment.TURSO_AUTH_TOKEN || "").trim()) {
    throw Object.assign(new Error("Credential Turso Production tidak tersedia di Vercel build environment."), {
      code: "REMOTE_PRODUCTION_DATABASE_CREDENTIALS_MISSING",
    });
  }
};

const runNodeProcess = (args, extraEnv = {}) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Object.assign(new Error(`Node subprocess gagal: ${args.join(" ")}`), { exitCode: result.status || 1 });
};

const runFrontendBuild = () => {
  const npmExecPath = String(process.env.npm_execpath || "").trim();
  const executable = npmExecPath ? process.execPath : (process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm");
  const args = npmExecPath
    ? [npmExecPath, "run", "build"]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build"]
      : ["run", "build"];
  const result = spawnSync(executable, args, { cwd: root, env: process.env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Object.assign(new Error("Frontend production build gagal."), { exitCode: result.status || 1 });
};

export const runVercelBuild = ({
  environment = process.env,
  buildRunner = runFrontendBuild,
  nodeRunner = runNodeProcess,
} = {}) => {
  const operation = resolveVercelDatabaseOperation(environment);
  if (operation) assertRemoteDatabaseBuildContext(environment);

  // Fail safe: compile source first. A schema mutation must never run when the
  // exact source being staged cannot produce a valid frontend build.
  buildRunner();

  if (!operation) return { operation: null, databaseOperationRan: false };

  const remoteEnv = {
    SALDO_BERSAMA_REMOTE_DB_CONTEXT: "1",
    DATABASE_ENVIRONMENT: "production",
    NODE_ENV: "production",
  };
  if (operation === "migrate") {
    nodeRunner(["scripts/db-migrate.mjs", "production"], remoteEnv);
    nodeRunner(["scripts/db-integrity.mjs", "production"], remoteEnv);
  } else if (operation === "integrity") {
    nodeRunner(["scripts/db-integrity.mjs", "production"], remoteEnv);
  } else if (operation === "bind") {
    nodeRunner(["scripts/db-bind-environment.mjs", "production"], remoteEnv);
    nodeRunner(["scripts/db-integrity.mjs", "production"], remoteEnv);
  }
  return { operation, databaseOperationRan: true };
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  try {
    runVercelBuild();
  } catch (error) {
    console.error(error?.message || "Vercel build gagal.");
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

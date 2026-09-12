import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_VERCEL_PROJECT,
  ensureVercelLogin,
  ensureVercelProject,
  runVercelCommand,
} from "./bootstrap-development-env.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEVELOPMENT_ENV_FILE = ".env.local";
const GITIGNORE_FILE = ".gitignore";
const SUPPORTED_OPERATIONS = new Set(["migrate", "integrity", "bind"]);

const readOptionalFile = async (filePath) => {
  try { return { exists: true, value: await readFile(filePath) }; }
  catch (error) {
    if (error?.code === "ENOENT") return { exists: false, value: null };
    throw error;
  }
};

const restoreOptionalFile = async (filePath, snapshot) => {
  if (snapshot.exists) {
    await writeFile(filePath, snapshot.value, { mode: 0o600 });
    return;
  }
  await rm(filePath, { force: true });
};

export const remoteProductionBuildArgs = (operation) => {
  const normalized = String(operation || "").trim().toLowerCase();
  if (!SUPPORTED_OPERATIONS.has(normalized)) {
    throw Object.assign(new Error(`Operasi database Production tidak dikenal: ${normalized || "missing"}.`), {
      code: "PRODUCTION_DB_OPERATION_INVALID",
      operation: normalized || null,
    });
  }
  return [
    "deploy",
    "--prod",
    "--skip-domain",
    "--yes",
    "--no-color",
    "--build-env",
    `SALDO_BERSAMA_DB_OPERATION=${normalized}`,
  ];
};

export const runRemoteProductionDatabaseOperation = async ({
  operation,
  root = projectRoot,
  projectName = DEFAULT_VERCEL_PROJECT,
  runner = runVercelCommand,
  loginEnsurer = ensureVercelLogin,
  projectEnsurer = ensureVercelProject,
  logger = console,
} = {}) => {
  const normalized = String(operation || "").trim().toLowerCase();
  const args = remoteProductionBuildArgs(normalized);
  const developmentPath = path.join(root, DEVELOPMENT_ENV_FILE);
  const gitignorePath = path.join(root, GITIGNORE_FILE);
  const developmentSnapshot = await readOptionalFile(developmentPath);
  const gitignoreSnapshot = await readOptionalFile(gitignorePath);

  logger.log?.(`Menjalankan operasi database Production \`${normalized}\` di staged Vercel Production build...`);
  logger.log?.("Credential Sensitive tetap berada di Vercel dan tidak diekspor ke workstation.");

  try {
    await loginEnsurer({ cwd: root, runner });
    await projectEnsurer({ cwd: root, projectName, runner, environment: "production" });
    const result = await runner({ cwd: root, args, stdio: "inherit" });
    if (result?.code !== 0) {
      throw Object.assign(new Error(`Operasi database Production \`${normalized}\` gagal di Vercel build.`), {
        code: "PRODUCTION_DB_REMOTE_OPERATION_FAILED",
        operation: normalized,
        exitCode: result?.code ?? 1,
      });
    }
    logger.log?.(`Operasi database Production \`${normalized}\` selesai di Vercel tanpa menyalin secret Production ke lokal.`);
    return { operation: normalized, remote: true };
  } finally {
    await restoreOptionalFile(developmentPath, developmentSnapshot).catch(() => undefined);
    await restoreOptionalFile(gitignorePath, gitignoreSnapshot).catch(() => undefined);
  }
};

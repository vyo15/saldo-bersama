import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseEnvironmentText } from "./runtime-environment.mjs";

export const PRODUCTION_OPERATOR_KEYS = Object.freeze([
  "DATABASE_ENVIRONMENT",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
]);
export const PRODUCTION_OPERATOR_DIRECTORY = ".saldo-bersama";
export const PRODUCTION_OPERATOR_FILE = "production-operator.env";
export const PRODUCTION_LOCAL_ENV_FILE = ".env.production.local";

const unavailable = (value) => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized.includes("[SENSITIVE]");
};

const safeValue = (value, key) => {
  const normalized = String(value ?? "").trim();
  if (unavailable(normalized) || /[\r\n]/.test(normalized)) {
    throw Object.assign(new Error(`Credential operator Production tidak valid: ${key}.`), {
      code: "PRODUCTION_OPERATOR_PROFILE_INVALID",
      key,
    });
  }
  return normalized;
};

const operatorValues = (environment) => {
  const marker = String(environment.DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  if (marker !== "production") {
    throw Object.assign(new Error("Profile operator wajib memakai DATABASE_ENVIRONMENT=production."), {
      code: "PRODUCTION_OPERATOR_MARKER_INVALID",
    });
  }
  return {
    DATABASE_ENVIRONMENT: "production",
    TURSO_DATABASE_URL: safeValue(environment.TURSO_DATABASE_URL, "TURSO_DATABASE_URL"),
    TURSO_AUTH_TOKEN: safeValue(environment.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN"),
  };
};

const serializeOperatorValues = (values) => [
  "# Saldo Bersama — per-device Production operator profile",
  "# Hanya credential Turso untuk preflight read-only. Jangan tambahkan SESSION_SECRET/OAuth/VAPID di file ini.",
  "DATABASE_ENVIRONMENT=production",
  `TURSO_DATABASE_URL=${values.TURSO_DATABASE_URL}`,
  `TURSO_AUTH_TOKEN=${values.TURSO_AUTH_TOKEN}`,
  "",
].join("\n");

const replaceEnvValue = (source, key, value) => {
  const lines = String(source ?? "").split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) return line;
    if (replaced) return line;
    replaced = true;
    return `${key}=${value}`;
  });
  if (!replaced) next.push(`${key}=${value}`);
  return next.join("\n").replace(/\n*$/g, "\n");
};

const atomicWrite = async (targetPath, content, { directoryMode = 0o700, fileMode = 0o600 } = {}) => {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true, mode: directoryMode });
  const existing = await readFile(targetPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing === content) return false;

  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath, content, { encoding: "utf8", mode: fileMode, flag: "wx" });
    try {
      await rename(tempPath, targetPath);
    } catch (error) {
      if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
      await rm(targetPath, { force: true });
      await rename(tempPath, targetPath);
    }
    return true;
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
};

export const productionOperatorStorePath = ({ home = os.homedir() } = {}) => path.join(
  home,
  PRODUCTION_OPERATOR_DIRECTORY,
  PRODUCTION_OPERATOR_FILE,
);

export const readProductionOperatorStore = async ({ storePath = productionOperatorStorePath() } = {}) => {
  const source = await readFile(storePath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (source === null) return null;
  return { storePath, values: operatorValues(parseEnvironmentText(source)) };
};

export const restoreProductionOperatorProfile = async ({
  projectRoot,
  storePath = productionOperatorStorePath(),
  logger = console,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");
  const stored = await readProductionOperatorStore({ storePath });
  if (!stored) return { restored: false, reason: "store-missing", storePath };

  const productionPath = path.join(projectRoot, PRODUCTION_LOCAL_ENV_FILE);
  const currentSource = await readFile(productionPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (currentSource !== null) {
    const current = parseEnvironmentText(currentSource);
    const localReady = String(current.DATABASE_ENVIRONMENT || "").trim().toLowerCase() === "production"
      && !unavailable(current.TURSO_DATABASE_URL)
      && !unavailable(current.TURSO_AUTH_TOKEN);
    if (localReady) return { restored: false, reason: "local-ready", storePath, productionPath };
  }

  let next = currentSource ?? [
    "# Saldo Bersama — Production operator profile restored for this checkout",
    "# Runtime Production secrets tetap berada di Vercel/secret store.",
    "",
  ].join("\n");
  for (const key of PRODUCTION_OPERATOR_KEYS) next = replaceEnvValue(next, key, stored.values[key]);
  await atomicWrite(productionPath, next);
  logger.log?.(`Production operator profile dipulihkan otomatis dari trusted per-device store: ${storePath}`);
  return { restored: true, storePath, productionPath };
};

export const persistProductionOperatorProfile = async ({
  projectRoot,
  storePath = productionOperatorStorePath(),
  logger = console,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");
  const productionPath = path.join(projectRoot, PRODUCTION_LOCAL_ENV_FILE);
  const source = await readFile(productionPath, "utf8");
  const values = operatorValues(parseEnvironmentText(source));
  const updated = await atomicWrite(storePath, serializeOperatorValues(values));
  if (updated) logger.log?.(`Production operator profile perangkat tersimpan aman di: ${storePath}`);
  return { storePath, productionPath, updated };
};

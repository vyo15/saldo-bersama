import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseEnvironmentText } from "./runtime-environment.mjs";

export const DATABASE_PROFILE_FILES = Object.freeze({
  development: ".env.local",
  production: ".env.production.local",
});

const PROFILE_ENV_KEYS = Object.freeze([
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "DATABASE_ENVIRONMENT",
]);

export const resolveDatabaseProfileTarget = ({
  argv = process.argv.slice(2),
  defaultEnvironment = "development",
} = {}) => {
  if (argv.length > 1) {
    throw Object.assign(new Error("Gunakan maksimal satu target database: development atau production."), {
      code: "DATABASE_PROFILE_ARGUMENT_INVALID",
    });
  }
  const target = String(argv[0] || defaultEnvironment).trim().toLowerCase();
  if (!Object.hasOwn(DATABASE_PROFILE_FILES, target)) {
    throw Object.assign(new Error("Target database harus development atau production."), {
      code: "DATABASE_PROFILE_INVALID",
      target,
    });
  }
  return target;
};

export const assertDatabaseProfileBinding = async ({ database, environment }) => {
  const target = String(environment || "").trim().toLowerCase();
  if (!Object.hasOwn(DATABASE_PROFILE_FILES, target)) {
    throw Object.assign(new Error("Target database harus development atau production."), {
      code: "DATABASE_PROFILE_INVALID",
      target,
    });
  }
  let current = null;
  try {
    current = await database.one("SELECT value FROM system_config WHERE key='database_environment'");
  } catch {
    // Database baru sebelum migration belum mempunyai system_config; kondisi ini boleh lanjut.
    return { environment: target, binding: "unbound" };
  }
  const binding = String(current?.value || "unbound").trim().toLowerCase();
  if (binding !== "unbound" && binding !== target) {
    throw Object.assign(new Error(`Database sudah terikat ke ${binding}; operasi ${target} ditolak sebelum mutation.`), {
      code: "DATABASE_ENVIRONMENT_REBIND_DENIED",
      current: binding,
      target,
    });
  }
  return { environment: target, binding };
};

export const loadDatabaseProfile = async ({ root, environment }) => {
  const target = String(environment || "").trim().toLowerCase();
  const fileName = DATABASE_PROFILE_FILES[target];
  if (!fileName) {
    throw Object.assign(new Error("Target database harus development atau production."), {
      code: "DATABASE_PROFILE_INVALID",
      target,
    });
  }
  const filePath = path.join(root, fileName);
  const source = await readFile(filePath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw Object.assign(new Error(`${fileName} belum tersedia untuk operasi database ${target}.`), {
        code: "DATABASE_PROFILE_NOT_FOUND",
        environment: target,
      });
    }
    throw error;
  });
  const values = parseEnvironmentText(source);
  const missing = PROFILE_ENV_KEYS.filter((key) => !String(values[key] ?? "").trim());
  if (missing.length) {
    throw Object.assign(new Error(`${fileName} belum lengkap untuk operasi database: ${missing.join(", ")}.`), {
      code: "DATABASE_PROFILE_INCOMPLETE",
      environment: target,
      missing,
    });
  }
  const marker = String(values.DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  if (marker !== target) {
    throw Object.assign(new Error(`${fileName} memakai DATABASE_ENVIRONMENT=${marker || "missing"}; target ${target} ditolak.`), {
      code: "DATABASE_PROFILE_ENVIRONMENT_MISMATCH",
      environment: target,
      marker: marker || null,
    });
  }

  for (const key of PROFILE_ENV_KEYS) process.env[key] = String(values[key]).trim();
  process.env.VERCEL_ENV = target;
  process.env.NODE_ENV = target === "production" ? "production" : "development";
  return { environment: target, fileName };
};

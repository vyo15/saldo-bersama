import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  environmentStatus,
  parseEnvironmentText,
} from "./runtime-environment.mjs";

export const ensureDevelopmentEnvironment = async ({ projectRoot } = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");

  const envPath = path.join(projectRoot, ".env.local");
  let source;
  try {
    source = await readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    throw Object.assign(
      new Error(".env.local belum tersedia. Salin .env.example ke .env.local, isi nilainya secara aman, lalu jalankan npm run env:check."),
      { code: "LOCAL_ENV_NOT_FOUND", envPath },
    );
  }

  const status = environmentStatus(parseEnvironmentText(source));
  if (!status.complete) {
    throw Object.assign(
      new Error(`.env.local belum lengkap: ${status.missing.join(", ")}. Lengkapi file lokal lalu jalankan npm run env:check.`),
      { code: "LOCAL_ENV_INCOMPLETE", envPath, missing: status.missing },
    );
  }

  return { source: "local", envPath, missing: [] };
};

import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(projectRoot, ".env.local");

export const LEGACY_ENV_KEYS = Object.freeze([
  "INTERNAL_SHARED_SECRET",
  "APPS_SCRIPT_WEB_APP_URL",
  "FIREBASE_WEB_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VITE_DEV_MODE",
  "VITE_DEMO_MODE",
  "SPREADSHEET_ID",
  "MIRROR_SPREADSHEET_ID",
  "GOOGLE_CALENDAR_ID",
  "BACKUP_FOLDER_ID",
  "JOBS_ENDPOINT_URL",
  "VERCEL_OIDC_TOKEN",
]);

export const OPTIONAL_ENV_GROUPS = Object.freeze([
  Object.freeze([
    "GOOGLE_BRIDGE_WEB_APP_URL",
    "GOOGLE_BRIDGE_SHARED_SECRET",
    "JOBS_SHARED_SECRET",
  ]),
  Object.freeze([
    "VITE_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
  ]),
]);

const keyFromLine = (line) => {
  const match = String(line).match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1] || null;
};

export const cleanEnvironmentText = (source = "") => {
  const lines = String(source).split(/\r?\n/);
  const lastIndexByKey = new Map();
  lines.forEach((line, index) => {
    const key = keyFromLine(line);
    if (key) lastIndexByKey.set(key, index);
  });

  const present = new Set(lastIndexByKey.keys());
  const remove = new Set(LEGACY_ENV_KEYS);
  for (const group of OPTIONAL_ENV_GROUPS) {
    const count = group.filter((key) => present.has(key)).length;
    if (count > 0 && count < group.length) group.forEach((key) => remove.add(key));
  }

  const removed = new Set();
  const duplicates = new Set();
  const kept = lines.filter((line, index) => {
    const key = keyFromLine(line);
    if (!key) return true;
    if (remove.has(key)) {
      removed.add(key);
      return false;
    }
    if (lastIndexByKey.get(key) !== index) {
      duplicates.add(key);
      return false;
    }
    return true;
  });

  const text = `${kept.join("\n").replace(/\n*$/, "")}\n`;
  return {
    text,
    removed: [...removed].sort(),
    duplicates: [...duplicates].sort(),
  };
};

export const writeEnvironmentFileAtomic = async (file, text) => {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.clean-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => undefined);
    try {
      await rename(temporary, file);
    } catch (error) {
      if (!(["EEXIST", "EPERM"].includes(error?.code))) throw error;
      await rm(file, { force: true });
      await rename(temporary, file);
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
};

export const cleanEnvironmentFile = async ({ file = envPath, allowMissing = false } = {}) => {
  const source = await readFile(file, "utf8").catch((error) => {
    if (error?.code === "ENOENT" && allowMissing) return null;
    if (error?.code === "ENOENT") throw Object.assign(new Error(`Environment lokal tidak ditemukan: ${file}`), { code: "LOCAL_ENV_NOT_FOUND" });
    throw error;
  });
  if (source === null) return { exists: false, text: "", removed: [], duplicates: [], changed: false };

  const result = cleanEnvironmentText(source);
  const changed = result.text !== source;
  if (changed) await writeEnvironmentFileAtomic(file, result.text);
  return { exists: true, changed, ...result };
};

export const cleanLocalEnvironment = async ({ file = envPath } = {}) => {
  const result = await cleanEnvironmentFile({ file });
  console.log(`Environment dibersihkan: ${file}`);
  console.log(`Dihapus: ${result.removed.length ? result.removed.join(", ") : "tidak ada"}`);
  console.log(`Duplikat dibuang: ${result.duplicates.length ? result.duplicates.join(", ") : "tidak ada"}`);
  return result;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cleanLocalEnvironment().catch((error) => {
    console.error(error?.message || "Pembersihan environment gagal.");
    process.exitCode = 1;
  });
}

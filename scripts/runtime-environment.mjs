import { readFile } from "node:fs/promises";

export const REQUIRED_RUNTIME_ENV_KEYS = Object.freeze([
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_FIREBASE_API_KEY",
  "FIREBASE_WEB_API_KEY",
  "ALLOWED_USERS_JSON",
  "ALLOWED_ORIGINS",
  "SESSION_SECRET",
  "INTERNAL_SHARED_SECRET",
  "APPS_SCRIPT_WEB_APP_URL",
]);

const unquote = (value) => {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const parseEnvironmentText = (source = "") => {
  const values = {};
  String(source).split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const separator = normalized.indexOf("=");
    if (separator <= 0) return;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
    values[key] = unquote(normalized.slice(separator + 1));
  });
  return values;
};

export const environmentStatus = (values = {}) => {
  const missing = REQUIRED_RUNTIME_ENV_KEYS.filter((key) => !String(values[key] ?? "").trim());
  return { complete: missing.length === 0, missing };
};

export const sanitizePulledEnvironment = (source = "") => {
  const lines = String(source).split(/\r?\n/).filter((line) => !/^\s*VERCEL_OIDC_TOKEN\s*=/.test(line));
  return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
};

export const loadEnvironmentFile = async (filePath) => {
  try {
    return parseEnvironmentText(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
};

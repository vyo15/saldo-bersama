import crypto from "node:crypto";
import net from "node:net";

export const CORE_RUNTIME_ENV_KEYS = Object.freeze([
  "VITE_APP_NAME",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_FIREBASE_API_KEY",
  "ALLOWED_USERS_JSON",
  "ALLOWED_ORIGINS",
  "SESSION_SECRET",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
]);

export const OPTIONAL_LOGGING_ENV_KEYS = Object.freeze([
  "LOG_LEVEL",
]);

export const GOOGLE_BRIDGE_ENV_KEYS = Object.freeze([
  "GOOGLE_BRIDGE_WEB_APP_URL",
  "GOOGLE_BRIDGE_SHARED_SECRET",
  "JOBS_SHARED_SECRET",
]);

export const WEB_PUSH_ENV_KEYS = Object.freeze([
  "VITE_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
]);

export const PRODUCTION_SYNC_ENV_KEYS = Object.freeze([
  ...CORE_RUNTIME_ENV_KEYS,
  ...OPTIONAL_LOGGING_ENV_KEYS,
  ...GOOGLE_BRIDGE_ENV_KEYS,
  ...WEB_PUSH_ENV_KEYS,
]);

// Backward-compatible alias for existing bootstrap/diagnostic imports.
export const REQUIRED_RUNTIME_ENV_KEYS = CORE_RUNTIME_ENV_KEYS;

const BLOCKED_VAPID_SUBJECT_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid", ".onion"];

const unquote = (value) => {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) return trimmed.slice(1, -1);
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

const present = (values, key) => Boolean(String(values[key] ?? "").trim());

export const optionalGroupStatus = (values, keys) => {
  const presentKeys = keys.filter((key) => present(values, key));
  const missing = keys.filter((key) => !present(values, key));
  return {
    enabled: presentKeys.length > 0,
    complete: presentKeys.length === keys.length,
    present: presentKeys,
    missing,
  };
};

const decodedBase64Url = (value) => {
  const candidate = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(candidate)) return null;
  try {
    return Buffer.from(candidate.replace(/=+$/, ""), "base64url");
  } catch {
    return null;
  }
};

export const validateWebPushEnvironment = (values = {}) => {
  const group = optionalGroupStatus(values, WEB_PUSH_ENV_KEYS);
  if (!group.enabled) return { ...group, valid: true, invalid: [] };
  if (!group.complete) return { ...group, valid: false, invalid: [] };

  const invalid = [];
  const publicKey = decodedBase64Url(values.VITE_VAPID_PUBLIC_KEY);
  const privateKey = decodedBase64Url(values.VAPID_PRIVATE_KEY);
  const subject = String(values.VAPID_SUBJECT || "").trim();

  const publicKeyValid = Boolean(publicKey && publicKey.length === 65 && publicKey[0] === 4);
  const privateKeyValid = Boolean(privateKey && privateKey.length === 32);
  if (!publicKeyValid) invalid.push("VITE_VAPID_PUBLIC_KEY");
  if (!privateKeyValid) invalid.push("VAPID_PRIVATE_KEY");
  if (publicKeyValid && privateKeyValid) {
    try {
      const ecdh = crypto.createECDH("prime256v1");
      ecdh.setPrivateKey(privateKey);
      if (!crypto.timingSafeEqual(ecdh.getPublicKey(), publicKey)) invalid.push("VAPID_KEY_PAIR");
    } catch {
      invalid.push("VAPID_KEY_PAIR");
    }
  }

  const mailtoValid = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(subject);
  let httpsValid = false;
  try {
    const url = new URL(subject);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const publicHostname = hostname
      && hostname !== "localhost"
      && hostname.includes(".")
      && net.isIP(hostname) === 0
      && !BLOCKED_VAPID_SUBJECT_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
    httpsValid = url.protocol === "https:" && publicHostname && !url.username && !url.password && !url.hash;
  } catch {
    httpsValid = false;
  }
  if (!mailtoValid && !httpsValid) invalid.push("VAPID_SUBJECT");

  return { ...group, valid: invalid.length === 0, invalid: [...new Set(invalid)] };
};

export const environmentStatus = (values = {}) => {
  const missing = CORE_RUNTIME_ENV_KEYS.filter((key) => !present(values, key));
  return { complete: missing.length === 0, missing };
};

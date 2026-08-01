import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";

const formatDate = (date, _timezone, pattern) => {
  const value = new Date(date);
  const pad = (number) => String(number).padStart(2, "0");
  const year = value.getUTCFullYear();
  const month = pad(value.getUTCMonth() + 1);
  const day = pad(value.getUTCDate());
  const hour = pad(value.getUTCHours());
  const minute = pad(value.getUTCMinutes());
  const second = pad(value.getUTCSeconds());
  if (pattern === "yyyy-MM-dd") return `${year}-${month}-${day}`;
  if (pattern === "yyyy-MM") return `${year}-${month}`;
  if (pattern === "yyyy") return String(year);
  if (pattern === "MM") return month;
  if (pattern === "dd") return day;
  if (pattern === "d") return String(value.getUTCDate());
  if (pattern === "yyyyMMdd-HHmmss") return `${year}${month}${day}-${hour}${minute}${second}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
};

export const createBaseContext = (overrides = {}) => {
  const cache = new Map();
  const properties = new Map();
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Error,
    RegExp,
    Intl,
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      DigestAlgorithm: { SHA_256: "SHA_256" },
      formatDate,
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
      computeDigest: (_algorithm, value) => [...crypto.createHash("sha256").update(String(value)).digest()].map((byte) => byte > 127 ? byte - 256 : byte),
      computeHmacSha256Signature: (value, secret) => [...crypto.createHmac("sha256", secret).update(String(value)).digest()].map((byte) => byte > 127 ? byte - 256 : byte),
      newBlob: (content, type, name) => ({
        content,
        type,
        name,
        getBytes() { return [...Buffer.from(String(content ?? ""), "utf8")]; },
        setName(next) { this.name = next; return this; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, value),
        remove: (key) => cache.delete(key),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) ?? null,
        setProperty: (key, value) => properties.set(key, String(value)),
        setProperties: (values) => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value))),
        deleteProperty: (key) => properties.delete(key),
      }),
    },
    SpreadsheetApp: { flush: () => {} },
    resetRequestCache_: () => {},
    periodKey_: (value) => String(value || "2026-07"),
    boundedInteger_: (value, fallback, minimum, maximum) => {
      const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
      return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
    },
    canAccessOwnedScope_: () => true,
    canAccessAccount_: (_context, account) => Boolean(account),
    canAccessEnvelopeRule_: (_context, rule) => Boolean(rule),
    transactionCapabilities_: () => ({ can_edit: true, can_cancel: true, managed_by: "" }),
    sanitizeText_: (value) => String(value || ""),
    publicRow_: (row) => row ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== "__row")) : null,
    sha256Hex_: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
    canonicalJson_: (value) => JSON.stringify(value),
    uuid_: () => crypto.randomUUID(),
    monthKey_: () => "2026-07",
    appendAudit_: () => {},
    isRecoveryRequired_: () => false,
    getConfig_: () => "false",
    recoveryDetails_: () => ({ recoveryRequired: false, status: "", details: {}, updatedAt: "" }),
    recordExternalCleanupRequired_: () => {},
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {}, hasLock: () => true }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@gmail.com" }) },
    ScriptApp: { getOAuthToken: () => "token", getProjectTriggers: () => [] },
    ...overrides,
  };
  context.globalThis = context;
  return vm.createContext(context);
};

export const loadAppsScript = async (context, files) => {
  for (const file of files) {
    const source = await readFile(new URL(`../../../apps-script/${file}`, import.meta.url), "utf8");
    new vm.Script(source, { filename: file }).runInContext(context);
  }
  return context;
};

export const listAppsScriptFiles = async () => {
  const root = new URL("../../../apps-script/", import.meta.url);
  return (await readdir(root)).filter((name) => name.endsWith(".gs")).sort();
};

export const loadAllAppsScript = async (context, { reverse = false } = {}) => {
  const files = await listAppsScriptFiles();
  return loadAppsScript(context, reverse ? [...files].reverse() : files);
};

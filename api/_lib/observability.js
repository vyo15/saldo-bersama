import crypto from "node:crypto";

const LEVEL_WEIGHT = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 4;
const SENSITIVE_KEY = /(authorization|cookie|token|secret|signature|firebase|password|payload|message|email|uid|name|amount|description|merchant|endpoint|p256dh|auth)/i;

const configuredLevel = () => {
  const value = String(process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")).toLowerCase();
  return Object.hasOwn(LEVEL_WEIGHT, value) ? value : "info";
};

const truncate = (value) => value.length > MAX_STRING_LENGTH
  ? `${value.slice(0, MAX_STRING_LENGTH)}…`
  : value;

const sanitize = (value, key = "", depth = 0) => {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") return truncate(value.replace(/[\r\n\t]+/g, " "));
  if (["number", "boolean"].includes(typeof value)) return value;
  if (value instanceof Error) return sanitizeError(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([entryKey, entryValue]) => [
      entryKey,
      sanitize(entryValue, entryKey, depth + 1),
    ]));
  }
  return truncate(String(value));
};

export const sanitizeError = (error) => {
  if (!error) return null;
  const summary = {
    errorType: String(error.name || "Error"),
    code: String(error.code || "UNKNOWN"),
    status: Number(error.status || 0) || undefined,
    reason: truncate(String(error.message || "Unknown error").replace(/[\r\n\t]+/g, " ")),
  };
  if (error.details) summary.details = sanitize(error.details, "details", 1);
  if (process.env.NODE_ENV !== "production" && error.stack) {
    summary.stack = String(error.stack).split("\n").slice(0, 6).join(" | ");
  }
  return summary;
};

export const logEvent = (level, event, fields = {}) => {
  const normalizedLevel = Object.hasOwn(LEVEL_WEIGHT, level) ? level : "info";
  if (LEVEL_WEIGHT[normalizedLevel] < LEVEL_WEIGHT[configuredLevel()]) return;
  const record = {
    ...sanitize(fields),
    timestamp: new Date().toISOString(),
    level: normalizedLevel,
    service: "saldo-bersama-api",
    event: String(event || "unknown"),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
  };
  const output = JSON.stringify(record);
  const writer = normalizedLevel === "error" ? console.error : normalizedLevel === "warn" ? console.warn : console.log;
  writer(output);
};

export const requestIdFrom = (request) => {
  const candidate = String(request?.headers?.["x-request-id"] || "").trim();
  return (candidate || crypto.randomUUID()).slice(0, 120);
};

export const attachRequestId = (response, requestId) => {
  if (!response.headersSent) response.setHeader("X-Request-ID", String(requestId || "").slice(0, 120));
};

export const runtimeBuildInfo = () => ({
  runtime: process.version,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
  commitSha: String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || null,
  deploymentId: String(process.env.VERCEL_DEPLOYMENT_ID || "").slice(0, 120) || null,
  region: String(process.env.VERCEL_REGION || "").slice(0, 32) || null,
});

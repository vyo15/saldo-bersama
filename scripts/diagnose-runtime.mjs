import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TursoHttpClient } from "../api/_lib/db/httpClient.js";
import { readSchemaStatus } from "../api/_lib/db/schema.js";
import { callGoogleBridge } from "../api/_lib/services/integrations.js";
import { CORE_RUNTIME_ENV_KEYS, environmentStatus, validateWebPushEnvironment } from "./runtime-environment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const { missing } = environmentStatus(process.env);
console.log("Saldo Bersama runtime diagnostic");
console.log(`Node: ${process.version}`);
for (const key of CORE_RUNTIME_ENV_KEYS) console.log(`- ${key}: ${String(process.env[key] || "").trim() ? "set" : "MISSING"}`);
const webPush = validateWebPushEnvironment(process.env);
if (!webPush.enabled) console.error("Web Push: MISSING (required for canonical local testing)");
else if (!webPush.complete) console.error(`Web Push: INCOMPLETE (${webPush.missing.join(", ")})`);
else if (!webPush.valid) console.error(`Web Push: INVALID (${webPush.invalid.join(", ")})`);
else console.log("Web Push: ready");

if (!missing.includes("TURSO_DATABASE_URL") && !missing.includes("TURSO_AUTH_TOKEN")) {
  try {
    const db = new TursoHttpClient();
    const healthy = await db.health();
    const schema = healthy ? await readSchemaStatus(db, { force: true }) : null;
    console.log(`Turso: ${healthy ? "reachable" : "UNREACHABLE"}`);
    console.log(`Schema: ${schema?.ready ? `ready v${schema.version}` : JSON.stringify(schema || {})}`);
    if (!healthy || !schema?.ready) process.exitCode = 1;
    if (healthy) {
      const latestPushTest = await db.one(`SELECT timestamp,result,new_value FROM audit_log
        WHERE action='notifications.test' ORDER BY timestamp DESC LIMIT 1`);
      if (latestPushTest) {
        let detail = {};
        try { detail = latestPushTest.new_value ? JSON.parse(latestPushTest.new_value) : {}; } catch { detail = {}; }
        const safeCode = String(detail?.errorCode || "").replace(/[^A-Z0-9_]/g, "").slice(0, 80);
        console.log(`Web Push latest verification: ${latestPushTest.result}${safeCode ? ` (${safeCode})` : ""} at ${latestPushTest.timestamp}`);
      } else console.log("Web Push latest verification: not available");
    }
  } catch (error) {
    console.error(`Turso: FAILED (${error.code || error.message})`);
    process.exitCode = 1;
  }
}

const bridge = String(process.env.GOOGLE_BRIDGE_WEB_APP_URL || "").trim();
if (bridge) {
  try {
    const url = new URL(bridge);
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !url.pathname.endsWith("/exec")) throw new Error("URL harus HTTPS script.google.com dan berakhir /exec");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    const body = await response.json().catch(() => null);
    const deployment = body?.data || body || {};
    console.log(`Google bridge liveness: HTTP ${response.status}, ${deployment?.service || "respons tidak dikenali"}${deployment?.version ? ` v${deployment.version}` : ""}`);
    try {
      const health = await callGoogleBridge("integration.health", {}, { timeoutMs: 12_000 });
      console.log(`Google bridge signed health: ready (Sheets=${Boolean(health?.mirrorConfigured)}, Calendar=${Boolean(health?.calendarConfigured)}, Drive=${Boolean(health?.backupConfigured)}, Jobs=${Boolean(health?.jobsConfigured)}, Trigger=${Boolean(health?.triggerReady)})`);
    } catch (healthError) {
      console.error(`Google bridge signed health: FAILED (${healthError.code || healthError.message})`);
    }
  } catch (error) { console.error(`Google bridge liveness: FAILED (${error.name === "AbortError" ? "timeout" : error.message})`); }
} else console.log("Google bridge: optional/not configured");

if (missing.length) console.error(`Konfigurasi inti belum lengkap: ${missing.join(", ")}`);
if (missing.length || !webPush.enabled || !webPush.complete || !webPush.valid) process.exitCode = 1;

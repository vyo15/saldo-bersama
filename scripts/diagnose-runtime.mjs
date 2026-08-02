import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TursoHttpClient } from "../api/_lib/db/httpClient.js";
import { readSchemaStatus } from "../api/_lib/db/schema.js";
import { CORE_RUNTIME_ENV_KEYS, environmentStatus } from "./runtime-environment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const { missing } = environmentStatus(process.env);
console.log("Saldo Bersama runtime diagnostic");
console.log(`Node: ${process.version}`);
for (const key of CORE_RUNTIME_ENV_KEYS) console.log(`- ${key}: ${String(process.env[key] || "").trim() ? "set" : "MISSING"}`);

if (!missing.includes("TURSO_DATABASE_URL") && !missing.includes("TURSO_AUTH_TOKEN")) {
  try {
    const db = new TursoHttpClient();
    const healthy = await db.health();
    const schema = healthy ? await readSchemaStatus(db, { force: true }) : null;
    console.log(`Turso: ${healthy ? "reachable" : "UNREACHABLE"}`);
    console.log(`Schema: ${schema?.ready ? `ready v${schema.version}` : JSON.stringify(schema || {})}`);
  } catch (error) { console.error(`Turso: FAILED (${error.code || error.message})`); }
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
    console.log(`Google bridge: HTTP ${response.status}, ${body?.data?.service || "respons tidak dikenali"}`);
  } catch (error) { console.error(`Google bridge: FAILED (${error.name === "AbortError" ? "timeout" : error.message})`); }
} else console.log("Google bridge: optional/not configured");

if (missing.length) {
  console.error(`Konfigurasi inti belum lengkap: ${missing.join(", ")}`);
  process.exitCode = 1;
}

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { environmentStatus, REQUIRED_RUNTIME_ENV_KEYS } from "./runtime-environment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
try { process.loadEnvFile(envPath); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const required = REQUIRED_RUNTIME_ENV_KEYS;
const status = Object.fromEntries(required.map((key) => [key, Boolean(String(process.env[key] || "").trim())]));
const { missing } = environmentStatus(process.env);

console.log("Saldo Bersama runtime diagnostic");
console.log(`Node: ${process.version}`);
console.log(`Environment file: ${missing.length === required.length ? "tidak ditemukan/semua kosong" : "terbaca"}`);
for (const key of required) console.log(`- ${key}: ${status[key] ? "set" : "MISSING"}`);

let url;
try {
  url = new URL(String(process.env.APPS_SCRIPT_WEB_APP_URL || ""));
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !url.pathname.endsWith("/exec")) throw new Error("URL harus HTTPS script.google.com dan berakhir /exec");
  console.log("Apps Script URL: valid");
} catch (error) {
  console.error(`Apps Script URL: INVALID (${error.message})`);
}

if (url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: controller.signal });
    const completedAt = Date.now();
    const dateHeader = response.headers.get("date");
    const remoteEpochMs = dateHeader ? Date.parse(dateHeader) : NaN;
    const midpointEpochMs = startedAt + Math.round((completedAt - startedAt) / 2);
    const skewMs = Number.isFinite(remoteEpochMs) ? remoteEpochMs - midpointEpochMs : null;
    const body = await response.json().catch(() => null);
    console.log(`Apps Script GET: HTTP ${response.status}, ${completedAt - startedAt} ms`);
    console.log(`Apps Script service: ${body?.data?.service || "respons tidak dikenali"}`);
    console.log(`Apps Script status publik: ${body?.data?.status || "unknown"}`);
    console.log("Detail schema, trigger, dan recovery hanya tersedia melalui signed action system.health.");
    if (skewMs === null) console.warn("Clock check: header Date tidak tersedia");
    else {
      const label = Math.abs(skewMs) > 120_000 ? "WARNING" : "OK";
      console.log(`Clock check: ${label}, Google - PC = ${Math.round(skewMs)} ms`);
      if (Math.abs(skewMs) > 120_000) console.warn("Connector akan mencoba kalibrasi satu kali, tetapi NTP Windows tetap harus diperbaiki.");
    }
  } catch (error) {
    console.error(`Apps Script GET: FAILED (${error.name === "AbortError" ? "timeout" : error.message})`);
  } finally {
    clearTimeout(timer);
  }
}

if (missing.length) {
  console.error(`Konfigurasi belum lengkap: ${missing.join(", ")}`);
  process.exitCode = 1;
}

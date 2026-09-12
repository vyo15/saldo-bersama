import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PRODUCTION_SYNC_ENV_KEYS } from "./runtime-environment.mjs";

const target = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!target) throw new Error("Target temporary environment wajib diisi.");

const safeLine = (key, value) => `${key}=${String(value ?? "").replace(/[\r\n]+/g, "")}`;
const source = `${PRODUCTION_SYNC_ENV_KEYS
  .map((key) => safeLine(key, process.env[key] ?? ""))
  .join("\n")}\n`;

await writeFile(target, source, { encoding: "utf8", mode: 0o600 });
console.log("Environment runtime Vercel Production diterima untuk sinkronisasi lokal (nilai secret tidak ditampilkan).");

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { readSchemaStatus } from "../api/_lib/db/schema.js";
import { integrityIssues } from "../api/_lib/services/reports.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error.code !== "ENOENT") throw error; }

const db = getDatabase();
const schema = await readSchemaStatus(db, { force: true });

if (!schema.ready) {
  console.log(JSON.stringify({
    schema,
    engine: "not_checked",
    foreignKeyIssues: [],
    businessIssues: [],
    message: "Schema database belum siap. Jalankan npm run db:migrate terlebih dahulu.",
  }, null, 2));
  process.exitCode = 1;
} else {
  const [integrity, foreignKeys, business] = await Promise.all([
    db.one("PRAGMA integrity_check"),
    db.all("PRAGMA foreign_key_check"),
    integrityIssues(db),
  ]);
  const engineOk = String(Object.values(integrity || {})[0] || "").toLowerCase() === "ok";
  console.log(JSON.stringify({ schema, engine: engineOk ? "ok" : integrity, foreignKeyIssues: foreignKeys, businessIssues: business }, null, 2));
  if (!engineOk || foreignKeys.length || business.length) process.exitCode = 1;
}

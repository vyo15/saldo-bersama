import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDatabaseProfileBinding, loadDatabaseProfile, resolveDatabaseProfileTarget } from "./database-profile.mjs";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { invalidateSchemaCache } from "../api/_lib/db/schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseEnvironment = resolveDatabaseProfileTarget();
await loadDatabaseProfile({ root, environment: databaseEnvironment });

const migrationRoot = path.join(root, "database", "migrations");
const files = (await readdir(migrationRoot)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
if (!files.length) throw new Error("Migration SQL tidak ditemukan.");
const db = getDatabase();
await assertDatabaseProfileBinding({ database: db, environment: databaseEnvironment });

for (const file of files) {
  const version = Number(file.match(/^(\d+)/)?.[1]);
  const source = await readFile(path.join(migrationRoot, file), "utf8");
  const executableSource = source.replace(/^\uFEFF?\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/i, "");
  const checksum = crypto.createHash("sha256").update(source).digest("hex");
  let applied = null;
  try { applied = await db.one("SELECT checksum FROM schema_migrations WHERE version=?", [version]); } catch { applied = null; }
  if (applied) {
    if (applied.checksum !== checksum) throw new Error(`Checksum migration ${file} berubah setelah diterapkan.`);
    console.log(`SKIP ${file} (sudah diterapkan)`);
    continue;
  }
  const statements = executableSource.split(/^\s*-- migrate:split\s*$/m).map((item) => item.trim()).filter(Boolean);
  await db.transaction(async (tx) => {
    await tx.batch(statements.map((sql) => ({ sql })));
    await tx.execute(
      "INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      [version, file, checksum],
    );
  });
  console.log(`APPLY ${file} (${statements.length} langkah)`);
}

invalidateSchemaCache();
const schema = await db.one("SELECT value FROM system_config WHERE key='schema_version'");
console.log(`Migration ${databaseEnvironment} selesai. Schema aktif: ${schema?.value || "unknown"}.`);

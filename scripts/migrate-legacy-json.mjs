import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { DATABASE_SCHEMA_VERSION, assertDatabaseReady } from "../api/_lib/db/schema.js";
import { migrationFingerprint, transformLegacyPayload } from "./legacy-migration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const input = process.argv[2];
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=MIGRATE_LEGACY_TO_TURSO");
if (!input) throw new Error("Gunakan: npm run db:import-legacy -- path/export.json [--apply --confirm=MIGRATE_LEGACY_TO_TURSO]");
const inputPath = path.resolve(input);
const file = await stat(inputPath);
if (!file.isFile() || file.size > 50 * 1024 * 1024) throw new Error("File migrasi harus JSON maksimal 50 MB.");
const payload = JSON.parse(await readFile(inputPath, "utf8"));
const transformed = transformLegacyPayload(payload);
const fingerprint = migrationFingerprint(payload);
const summary = {
  mode: apply ? "apply" : "preview",
  sourceSchemaVersion: transformed.sourceVersion,
  targetSchemaVersion: DATABASE_SCHEMA_VERSION,
  fingerprint,
  tables: Object.fromEntries(transformed.records.map((item) => [item.target, item.rows.length])),
  skippedOperationalTables: transformed.skipped,
  warnings: [
    "Firebase UID tidak tersedia pada export legacy dan akan di-bind ulang saat login.",
    "Idempotency key transaksi dibuat deterministik dari transaction_id.",
    "Snapshot period closure dan detail before/after audit tidak tersedia pada export legacy; spreadsheet lama wajib diarsipkan read-only.",
    "Calendar, notification queue, push subscription, idempotency cache, dan backup log lama tidak dimigrasikan.",
  ],
};
console.log(JSON.stringify(summary, null, 2));
if (!apply) {
  console.log("Preview selesai. Ulangi dengan --apply --confirm=MIGRATE_LEGACY_TO_TURSO hanya setelah backup dan maintenance source lama aktif.");
  process.exit(0);
}
if (!confirmed) throw new Error("Apply ditolak. Tambahkan --confirm=MIGRATE_LEGACY_TO_TURSO setelah memeriksa preview.");

const db = getDatabase();
await assertDatabaseReady(db);
const counts = await db.batch(transformed.records.map((item) => ({ sql: `SELECT COUNT(*) AS count FROM ${item.target}` })));
const nonEmpty = transformed.records.filter((item, index) => Number(counts[index]?.rows?.[0]?.count || 0) > 0);
if (nonEmpty.length) throw new Error(`Import ditolak: target bisnis tidak kosong (${nonEmpty.map((item) => item.target).join(", ")}).`);

await db.transaction(async (tx) => {
  for (const { target, columns, rows } of transformed.records) {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const statements = rows.slice(offset, offset + 100).map((row) => ({
        sql: `INSERT INTO ${target}(${columns.map((column) => `"${column}"`).join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
        args: columns.map((column) => row[column]),
      }));
      if (statements.length) await tx.batch(statements);
    }
  }
  await tx.execute("INSERT INTO system_config(key,value,updated_at) VALUES('legacy_migration_fingerprint',?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", [fingerprint]);
});
console.log("Import legacy selesai. Wajib jalankan npm run db:integrity dan parity saldo sebelum cutover.");

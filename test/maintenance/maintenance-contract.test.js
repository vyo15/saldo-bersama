import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const maintenanceSource = async () => {
  const directory = new URL("../../api/_lib/services/maintenance/", import.meta.url);
  const preferredOrder = ["shared.js", "backup.js", "restore.js", "import.js", "integrity.js", "index.js"];
  const available = new Set((await readdir(directory)).filter((name) => name.endsWith(".js")));
  return (await Promise.all(preferredOrder.filter((name) => available.has(name)).map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
};

test("backup memakai snapshot transaction, checksum, gzip limit, nama unik, dan Drive bridge", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /snapshotDatabase = async \(db\) => db\.transaction/);
  assert.match(maintenance, /MAX_BACKUP_COMPRESSED_BYTES/);
  assert.match(maintenance, /maxOutputLength: MAX_BACKUP_JSON_BYTES/);
  assert.match(maintenance, /digest\(canonicalJson\(payload\)\)/);
  assert.match(maintenance, /backupId\.slice\(-8\)/);
  assert.match(maintenance, /callGoogleBridge\("backup\.store"/);
});

test("restore melakukan preview, safety backup, maintenance fail-closed, transaction, integrity, dan rebuild integration", async () => {
  const maintenance = await maintenanceSource();
  const safetyIndex = maintenance.indexOf("pre-restore");
  const maintenanceIndex = maintenance.indexOf("maintenance_mode");
  const transactionIndex = maintenance.indexOf("await db.transaction", safetyIndex);
  assert.ok(safetyIndex >= 0 && maintenanceIndex > safetyIndex && transactionIndex > maintenanceIndex);
  assert.match(maintenance, /RESTORE SALDO BERSAMA/);
  assert.match(maintenance, /integrityIssues\(tx\)/);
  assert.match(maintenance, /Fail closed: maintenance tetap aktif/);
  assert.match(maintenance, /enqueueIntegration\(tx, "sheets", "rebuild"/);
  assert.match(maintenance, /enqueueIntegration\(tx, "calendar", "rebuild"/);
  assert.match(maintenance, /status='applied',result_json=/);
});

test("restore menghapus queue dan push credential lama, mempertahankan audit, serta mengikat identitas ke konfigurasi aktif", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /"notification_queue", "integration_links", "integration_outbox", "request_nonces"/);
  assert.match(maintenance, /"push_subscriptions"/);
  assert.doesNotMatch(maintenance, /BACKUP_TABLES[\s\S]{0,500}"push_subscriptions"/);
  assert.doesNotMatch(maintenance, /insertRows\(tx, "push_subscriptions"/);
  assert.doesNotMatch(maintenance, /RESTORE_DELETE_ORDER[\s\S]{0,400}"audit_log"/);
  assert.match(maintenance, /currentByEmail/);
  assert.match(maintenance, /allowedRoleByEmail/);
  assert.match(maintenance, /context\.signedActor\.uid/);
  assert.match(maintenance, /RESTORE_IDENTITY_CONFLICT/);
  assert.match(maintenance, /allowedRole \|\| current\?\.role \|\| user\.role/);
  assert.match(maintenance, /allowedRole\s*\?\s*(?:\()?current\?\.status\s*\|\|\s*user\.status(?:\))?\s*:\s*"inactive"/);
  assert.match(maintenance, /nextStatus = allowedRole \? current\.status : "inactive"/);
  assert.match(maintenance, /insertRows\(tx, "audit_log"[\s\S]*INSERT OR IGNORE/);
});

test("import dibatasi 50 row, preview tervalidasi, safety backup, atomic apply, dan replay-safe", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /records\.length > 50/);
  assert.match(maintenance, /pre-import/);
  assert.match(maintenance, /return db\.transaction\(async\s*(?:\(tx\)|tx)\s*=>/);
  assert.match(maintenance, /status='applying'/);
  assert.match(maintenance, /appendAudit\(tx, context/);
  assert.match(maintenance, /status === "applied"/);
  assert.match(maintenance, /IMPORT TRANSAKSI/);
});

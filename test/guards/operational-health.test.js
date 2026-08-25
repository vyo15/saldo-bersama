import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  operationalCoreBlockers,
  operationalHealthStatement,
  operationalWarningCodes,
  presentOperationalHealth,
  presentSchedulerHealth,
  readOperationalHealth,
  readSchedulerHealth,
  recordSchedulerHeartbeat,
  schedulerStageFailureCode,
  SCHEDULER_STALE_MS,
} from "../../api/_lib/services/operationalHealth.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const memoryDb = () => {
  const values = new Map();
  return {
    values,
    async execute(sql, args = []) {
      if (!/INSERT INTO system_config/i.test(sql)) throw new Error(`Unexpected execute: ${sql}`);
      values.set(String(args[0]), String(args[1]));
      return { rowsAffected: 1 };
    },
    async all() {
      return [...values.entries()].map(([key, value]) => ({ key, value }));
    },
  };
};

test("scheduler health disabled tidak memerlukan heartbeat", async () => {
  const db = { all: async () => { throw new Error("query tidak boleh dipanggil"); } };
  assert.deepEqual(await readSchedulerHealth(db, { configured: false }), {
    configured: false,
    status: "disabled",
    stale: false,
    lastRunAt: "",
    lastSuccessAt: "",
    lastFailureAt: "",
    errorCode: "",
  });
});

test("scheduler configured fail-closed ketika heartbeat belum ada atau stale", () => {
  const now = Date.parse("2026-08-23T10:00:00.000Z");
  assert.equal(presentSchedulerHealth({}, { configured: true, now }).status, "degraded");

  const stale = presentSchedulerHealth({
    scheduler_last_success_at: new Date(now - SCHEDULER_STALE_MS - 1).toISOString(),
  }, { configured: true, now });
  assert.equal(stale.status, "degraded");
  assert.equal(stale.stale, true);
});

test("heartbeat sukses membuat scheduler sehat dan failure terbaru membuatnya degraded", async () => {
  const db = memoryDb();
  await recordSchedulerHeartbeat(db, { success: true });
  const successAt = db.values.get("scheduler_last_success_at");
  const healthy = await readSchedulerHealth(db, { configured: true, now: Date.parse(successAt) + 1_000 });
  assert.equal(healthy.status, "ok");
  assert.equal(healthy.stale, false);
  assert.equal(healthy.errorCode, "");

  await new Promise((resolve) => setTimeout(resolve, 2));
  await recordSchedulerHeartbeat(db, { success: false, errorCode: "UPSTREAM_TEMPORARY_FAILURE" });
  const failureAt = db.values.get("scheduler_last_failure_at");
  const degraded = await readSchedulerHealth(db, { configured: true, now: Date.parse(failureAt) + 1_000 });
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.errorCode, "UPSTREAM_TEMPORARY_FAILURE");
});

test("scheduler menyimpan kode stage spesifik agar STAGE_FAILED generik tidak kembali", () => {
  assert.equal(schedulerStageFailureCode({ integration: { failed: true, code: "GOOGLE_BRIDGE_NOT_CONFIGURED" } }), "INTEGRATIONS:GOOGLE_BRIDGE_NOT_CONFIGURED");
  assert.equal(schedulerStageFailureCode({ integration: { failed: 2, errorCode: "upstream timeout" } }), "INTEGRATIONS:UPSTREAM_TIMEOUT");
  assert.equal(schedulerStageFailureCode({ push: { partial: 1 } }), "PUSH:PARTIAL_DELIVERY");
  assert.equal(schedulerStageFailureCode({ housekeeping: { failed: false }, integration: { failed: 0 }, push: { failed: 0, partial: 0 } }), "");
});

test("error code heartbeat disanitasi sebelum disimpan", async () => {
  const db = memoryDb();
  await recordSchedulerHeartbeat(db, { success: false, errorCode: "X".repeat(120) });
  assert.equal(db.values.get("scheduler_last_error_code").length, 80);
});

test("operational health degraded untuk dead-letter integration/notifikasi aktif, backup gagal, atau integrity gagal", () => {
  assert.deepEqual(presentOperationalHealth({}), {
    status: "ok",
    codes: [],
    integrationDeadLetters: 0,
    notificationDeadLetters: 0,
    notificationDeliveryDeadLetters: 0,
    backupStatus: "unknown",
    integrityStatus: "unknown",
  });
  assert.deepEqual(presentOperationalHealth({
    notification_dead_letter_count: 3,
    notification_delivery_dead_letter_count: 4,
    latest_backup_status: "failed",
    latest_integrity_status: "failed",
  }, [{ provider: "sheets", status: "dead_letter", count: 2 }]), {
    status: "degraded",
    codes: ["INTEGRATION_DEAD_LETTER", "NOTIFICATION_DEAD_LETTER", "NOTIFICATION_DELIVERY_DEAD_LETTER", "BACKUP_FAILED", "INTEGRITY_FAILED"],
    integrationDeadLetters: 2,
    notificationDeadLetters: 3,
    notificationDeliveryDeadLetters: 4,
    backupStatus: "failed",
    integrityStatus: "failed",
  });
  assert.equal(presentOperationalHealth({ latest_backup_status: "verified", latest_integrity_status: "passed" }).status, "ok");
});


test("public/core readiness hanya diblok integrity failure; scheduler/integration/backup/notifikasi tetap warning operasional", () => {
  const warningOnly = presentOperationalHealth({
    notification_dead_letter_count: 1,
    latest_backup_status: "failed",
    latest_integrity_status: "passed",
  }, [{ provider: "sheets", status: "dead_letter", count: 2 }]);
  assert.deepEqual(operationalCoreBlockers(warningOnly), []);
  assert.deepEqual(operationalWarningCodes(warningOnly), ["INTEGRATION_DEAD_LETTER", "NOTIFICATION_DEAD_LETTER", "BACKUP_FAILED"]);

  const integrityFailed = presentOperationalHealth({ latest_integrity_status: "failed" });
  assert.deepEqual(operationalCoreBlockers(integrityFailed), ["INTEGRITY_FAILED"]);
  assert.deepEqual(operationalWarningCodes(integrityFailed), []);
});

test("operational health memakai integration status canonical dan query payload-free untuk signal lain", () => {
  const statement = operationalHealthStatement();
  assert.match(statement.sql, /notification_queue/);
  assert.match(statement.sql, /notification_deliveries/);
  assert.match(statement.sql, /push_subscriptions/);
  assert.match(statement.sql, /status='dead_letter'/);
  assert.match(statement.sql, /NOT EXISTS/);
  assert.match(statement.sql, /backup_runs/);
  assert.match(statement.sql, /integrity_runs/);
  assert.doesNotMatch(statement.sql, /integration_outbox|payload_json|last_error_message|issues_json/);
});

test("operational health membaca status database tanpa membocorkan payload dan pulih setelah rebuild/integrity sukses", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = "2026-08-24T00:00:00.000Z";
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["u-health", "uid-health", "health@example.com", "Health", "owner", "active", 1, now, now]);
    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["out-health", "sheets", "upsert", "transaction", "tx-health", "health:event", "{\"sensitive\":true}", "dead_letter", 5, now, null, null, "UPSTREAM", "private detail", now, now, null]);
    await db.execute("INSERT INTO backup_runs(backup_id,backup_type,external_file_id,file_name,schema_version,status,checksum,created_by,created_at,verified_at,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["backup-health", "manual", null, "backup.json.gz", 13, "failed", null, "u-health", now, null, "DRIVE_FAILED"]);
    await db.execute("INSERT INTO integrity_runs(integrity_run_id,status,issues_json,created_by,created_at) VALUES(?,?,?,?,?)", ["integrity-health", "failed", "[{\"secret\":true}]", "u-health", now]);
    await db.execute("INSERT INTO push_subscriptions(subscription_id,user_id,endpoint,p256dh,auth,user_agent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["subscription-health", "u-health", "https://push.example.test/health", "p256dh-health", "auth-health", "test-agent", "active", now, now]);
    await db.execute(`INSERT INTO notification_queue(notification_id,user_id,notification_type,title,body,target_path,scheduled_at,status,attempt_count,last_attempt_at,locked_by,dedupe_key,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["notification-health", "u-health", "system", "Private title", "Private body", "/", now, "dead_letter", 5, now, null, "health:notification", now]);
    await db.execute(`INSERT INTO notification_deliveries(delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, ["delivery-health", "notification-health", "subscription-health", "dead_letter", 5, now, null, "UPSTREAM", now, now]);

    const degraded = await readOperationalHealth(db);
    assert.deepEqual(degraded.codes, ["INTEGRATION_DEAD_LETTER", "NOTIFICATION_DEAD_LETTER", "NOTIFICATION_DELIVERY_DEAD_LETTER", "BACKUP_FAILED", "INTEGRITY_FAILED"]);
    assert.equal("payload" in degraded, false);
    assert.equal("issues" in degraded, false);

    const later = "2026-08-24T00:05:00.000Z";
    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["out-rebuild", "sheets", "rebuild", "system", "mirror", "health:rebuild", "{}", "completed", 0, later, null, null, "", "", later, later, later]);
    await db.execute("INSERT INTO backup_runs(backup_id,backup_type,external_file_id,file_name,schema_version,status,checksum,created_by,created_at,verified_at,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["backup-health-ok", "manual", "file-1", "backup-ok.json.gz", 13, "verified", "checksum", "u-health", later, later, null]);
    await db.execute("INSERT INTO integrity_runs(integrity_run_id,status,issues_json,created_by,created_at) VALUES(?,?,?,?,?)", ["integrity-health-ok", "passed", "[]", "u-health", later]);
    await db.execute(`INSERT INTO notification_queue(notification_id,user_id,notification_type,title,body,target_path,scheduled_at,status,attempt_count,last_attempt_at,locked_by,dedupe_key,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["notification-health-recovered", "u-health", "system", "Recovered title", "Recovered body", "/", later, "sent", 1, later, null, "health:notification:recovered", later]);
    await db.execute(`INSERT INTO notification_deliveries(delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, ["delivery-health-recovered", "notification-health-recovered", "subscription-health", "sent", 1, later, null, null, later, later]);
    const recovered = await readOperationalHealth(db);
    assert.equal(recovered.status, "ok");
    assert.equal(recovered.notificationDeadLetters, 0);
    assert.equal(recovered.notificationDeliveryDeadLetters, 0);
  } finally { db.close(); }
});


test("scheduler menganggap partial Push delivery sebagai run degraded", async () => {
  const jobs = await readFile(new URL("../../api/jobs.js", import.meta.url), "utf8");
  assert.match(jobs, /schedulerStageFailureCode\(\{ housekeeping, integration, notificationQueue, push \}\)/);
  assert.equal(schedulerStageFailureCode({ push: { partial: 1 } }), "PUSH:PARTIAL_DELIVERY");
});

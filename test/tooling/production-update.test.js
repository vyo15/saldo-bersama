import assert from "node:assert/strict";
import test from "node:test";

import { loadMigrations, migrationTargetSchemaVersion } from "../../scripts/db-migrate.mjs";
import { runProductionUpdate, waitForProductionRuntime } from "../../scripts/production-update.mjs";


test("migration target memakai schema_version SQL dan tidak menganggap prefix 017 sebagai v17", () => {
  assert.equal(migrationTargetSchemaVersion("UPDATE system_config SET value='19' WHERE key='schema_version';", "017_budget_lifecycle_history.sql"), 19);
  assert.equal(migrationTargetSchemaVersion("UPDATE system_config\nSET value = '20'\nWHERE key = 'schema_version';", "018_envelope_decoration.sql"), 20);
  assert.equal(migrationTargetSchemaVersion("UPDATE system_config SET value='21' WHERE key='schema_version';", "019_budget_recording_mode.sql"), 21);
  assert.equal(migrationTargetSchemaVersion("UPDATE system_config SET value='23' WHERE key='schema_version';", "021_notification_attention_state.sql"), 23);
  assert.equal(migrationTargetSchemaVersion("UPDATE system_config SET value='24' WHERE key='schema_version';", "022_goal_investment_funding.sql"), 24);
  assert.equal(migrationTargetSchemaVersion("UPDATE system_config SET value='25' WHERE key='schema_version';", "023_shopping_lists.sql"), 25);
  assert.equal(migrationTargetSchemaVersion("INSERT INTO system_config(key,value) VALUES ('schema_version','3');", "001_initial_schema.sql"), 3);
});

test("seluruh migration chain memisahkan migration ID dari target schema secara monoton", async () => {
  const migrations = await loadMigrations();
  assert.deepEqual(migrations.map((item) => item.migrationId), Array.from({ length: 24 }, (_, index) => index + 1));
  assert.deepEqual(migrations.map((item) => item.targetSchemaVersion), Array.from({ length: 24 }, (_, index) => index + 3));
  const expectedTail = [
    ["017_budget_lifecycle_history.sql", 19],
    ["018_envelope_decoration.sql", 20],
    ["019_budget_recording_mode.sql", 21],
    ["020_commitments.sql", 22],
    ["021_notification_attention_state.sql", 23],
    ["022_goal_investment_funding.sql", 24],
    ["023_shopping_lists.sql", 25],
    ["024_investment_fractional_precision.sql", 26],
  ];
  assert.deepEqual(migrations.slice(-expectedTail.length).map((item) => [item.file, item.targetSchemaVersion]), expectedTail);
});


test("prod:update menjalankan staged update lalu menunggu runtime Production sehat", async () => {
  const calls = [];
  const result = await runProductionUpdate({
    root: "/tmp/project",
    remoteRunner: async ({ operation, root }) => {
      calls.push(["remote", operation, root]);
      return { operation, remote: true, promoted: true, deploymentUrl: "https://candidate.vercel.app" };
    },
    runtimeCheck: async () => {
      calls.push(["runtime"]);
      return { health: { schema: { version: 24 } } };
    },
    logger: { log() {} },
  });
  assert.deepEqual(calls, [["remote", "update", "/tmp/project"], ["runtime"]]);
  assert.equal(result.promoted, true);
  assert.equal(result.runtime.health.schema.version, 24);
});


test("runtime verifier retry sampai alias baru terlihat", async () => {
  let attempts = 0;
  const status = await waitForProductionRuntime({
    attempts: 3,
    delayMs: 0,
    runtimeCheck: async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("stale"), { code: "PRODUCTION_DEGRADED" });
      return { health: { schema: { version: 24 } } };
    },
    logger: { log() {} },
  });
  assert.equal(attempts, 3);
  assert.equal(status.health.schema.version, 24);
});

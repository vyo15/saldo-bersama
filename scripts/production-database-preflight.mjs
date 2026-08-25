import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { readSchemaStatus } from "../api/_lib/db/schema.js";
import { presentSchedulerHealth, readOperationalHealth } from "../api/_lib/services/operationalHealth.js";
import { loadDatabaseProfile } from "./database-profile.mjs";
import { GOOGLE_BRIDGE_ENV_KEYS, optionalGroupStatus, parseEnvironmentText } from "./runtime-environment.mjs";

const schedulerKeys = Object.freeze([
  "scheduler_last_run_at",
  "scheduler_last_success_at",
  "scheduler_last_failure_at",
  "scheduler_last_error_code",
]);

const hasValue = (value) => Boolean(String(value ?? "").trim());

const readProductionProfileStatus = async (root) => {
  const source = await readFile(path.join(root, ".env.production.local"), "utf8");
  const values = parseEnvironmentText(source);
  return {
    schedulerConfigured: hasValue(values.JOBS_SHARED_SECRET),
    googleBridge: optionalGroupStatus(values, GOOGLE_BRIDGE_ENV_KEYS),
  };
};

export const checkProductionDatabaseProfile = async ({
  root,
  databaseFactory = getDatabase,
  schemaReader = readSchemaStatus,
  logger = console,
} = {}) => {
  await loadDatabaseProfile({ root, environment: "production" });
  const database = databaseFactory();
  if (!await database.health()) {
    throw Object.assign(new Error("Turso Production dari .env.production.local tidak dapat dihubungi."), { code: "PRODUCTION_DATABASE_UNREACHABLE" });
  }
  const schema = await schemaReader(database, { force: true });
  if (!schema.ready) {
    throw Object.assign(new Error(`Turso Production belum siap: schema v${schema.version}/${schema.expectedVersion}; binding=${schema.databaseEnvironment}; expected=${schema.expectedEnvironment}.`), {
      code: "PRODUCTION_DATABASE_NOT_READY",
      schema,
    });
  }
  logger.log?.(`Turso Production local profile: reachable; schema v${schema.version}; binding=${schema.databaseEnvironment}`);
  return schema;
};

export const inspectProductionDatabaseHealth = async ({
  root,
  databaseFactory = getDatabase,
  schemaReader = readSchemaStatus,
  operationalReader = readOperationalHealth,
  now = Date.now(),
} = {}) => {
  const profile = await readProductionProfileStatus(root);
  await loadDatabaseProfile({ root, environment: "production" });
  const database = databaseFactory();
  const databaseStatus = await database.health() ? "ok" : "unavailable";
  if (databaseStatus !== "ok") {
    return {
      databaseStatus,
      schema: { ready: false, version: null, expectedVersion: null },
      maintenanceMode: false,
      scheduler: { configured: profile.schedulerConfigured, status: profile.schedulerConfigured ? "degraded" : "disabled", stale: profile.schedulerConfigured },
      operations: { status: "unknown", codes: [] },
      googleBridge: profile.googleBridge,
      schedulerConfigurationSource: profile.schedulerConfigured ? "local_profile" : "none",
    };
  }

  const schema = await schemaReader(database, { force: true });
  const [maintenance, schedulerRows, operations] = await Promise.all([
    database.one("SELECT value FROM system_config WHERE key='maintenance_mode'"),
    database.all(`SELECT key,value FROM system_config WHERE key IN (${schedulerKeys.map(() => "?").join(",")})`, schedulerKeys),
    operationalReader(database),
  ]);
  const schedulerConfig = Object.fromEntries((schedulerRows || []).map((row) => [row.key, String(row.value || "")]));
  const schedulerHistoryPresent = schedulerKeys.some((key) => hasValue(schedulerConfig[key]));
  const schedulerConfigured = profile.schedulerConfigured || schedulerHistoryPresent;
  const scheduler = presentSchedulerHealth(schedulerConfig, { configured: schedulerConfigured, now });

  return {
    databaseStatus,
    schema,
    maintenanceMode: maintenance?.value === "true",
    scheduler,
    operations,
    googleBridge: profile.googleBridge,
    schedulerConfigurationSource: profile.schedulerConfigured
      ? "local_profile"
      : schedulerHistoryPresent ? "database_history" : "none",
  };
};

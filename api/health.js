import { getDatabase } from "./_lib/db/httpClient.js";
import { readSchemaStatus } from "./_lib/db/schema.js";
import { ok } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, runtimeBuildInfo } from "./_lib/observability.js";

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  attachRequestId(response, requestId);
  let databaseStatus = "unavailable";
  let schema = { ready: false, version: null };
  const bridgeConfigured = Boolean(process.env.GOOGLE_BRIDGE_WEB_APP_URL && process.env.GOOGLE_BRIDGE_SHARED_SECRET);
  const integrations = { configured: { sheets: bridgeConfigured, calendar: bridgeConfigured, drive: bridgeConfigured } };
  let maintenanceMode = false;
  try {
    const db = getDatabase();
    databaseStatus = await db.health() ? "ok" : "unavailable";
    if (databaseStatus === "ok") {
      schema = await readSchemaStatus(db, { force: true });
      const maintenance = await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
      maintenanceMode = maintenance?.value === "true";
    }
  } catch {}
  const status = databaseStatus === "ok" && schema.ready && !maintenanceMode ? "ok" : maintenanceMode ? "maintenance" : "degraded";
  logEvent(status === "ok" ? "debug" : "warn", "health.request.completed", { requestId, status: 200, serviceStatus: status, databaseStatus, durationMs: Date.now() - startedAt });
  return ok(response, {
    service: "saldo-bersama-api",
    status,
    database: databaseStatus,
    schema,
    maintenanceMode,
    recoveryRequired: maintenanceMode,
    integrations,
    build: runtimeBuildInfo(),
    timestamp: new Date().toISOString(),
    requestId,
  });
}

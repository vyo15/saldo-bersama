import { getDatabase } from "./_lib/db/httpClient.js";
import { readSchemaStatus } from "./_lib/db/schema.js";
import { methodNotAllowed, ok } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom } from "./_lib/observability.js";
import { operationalCoreBlockers, readOperationalHealth } from "./_lib/services/operationalHealth.js";

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  attachRequestId(response, requestId);
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

  let databaseStatus = "unavailable";
  let schema = { ready: false, version: null };
  let maintenanceMode = false;
  let coreOperationsHealthy = true;
  try {
    const db = getDatabase();
    databaseStatus = await db.health() ? "ok" : "unavailable";
    if (databaseStatus === "ok") {
      schema = await readSchemaStatus(db, { force: true });
      const maintenance = await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
      maintenanceMode = maintenance?.value === "true";
      const operations = await readOperationalHealth(db);
      coreOperationsHealthy = operationalCoreBlockers(operations).length === 0;
    }
  } catch {}
  const status = databaseStatus === "ok" && schema.ready && !maintenanceMode && coreOperationsHealthy ? "ok" : "degraded";
  logEvent(status === "ok" ? "debug" : "warn", "health.request.completed", { requestId, status: 200, serviceStatus: status, databaseStatus, durationMs: Date.now() - startedAt });
  return ok(response, {
    status,
    timestamp: new Date().toISOString(),
    requestId,
  });
}

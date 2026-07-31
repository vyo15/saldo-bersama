import { connectorConfiguration, connectorRuntimeDiagnostics } from "./_lib/appsScript.js";
import { ok } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, runtimeBuildInfo } from "./_lib/observability.js";

export default function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  attachRequestId(response, requestId);
  const connector = connectorConfiguration();
  const status = connector.appsScriptUrlConfigured && connector.sharedSecretConfigured ? "configured" : "degraded";
  logEvent("debug", "health.request.completed", {
    requestId,
    status: 200,
    connectorStatus: status,
    durationMs: Date.now() - startedAt,
  });
  return ok(response, {
    service: "saldo-bersama-api",
    status,
    connector,
    connectorRuntime: connectorRuntimeDiagnostics(),
    build: runtimeBuildInfo(),
    timestamp: new Date().toISOString(),
    requestId,
  });
}

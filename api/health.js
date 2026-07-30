import { connectorConfiguration } from "./_lib/appsScript.js";
import { ok } from "./_lib/http.js";

export default function handler(_request, response) {
  const connector = connectorConfiguration();
  return ok(response, {
    service: "saldo-bersama-api",
    status: connector.appsScriptUrlConfigured && connector.sharedSecretConfigured ? "ok" : "degraded",
    connector,
    timestamp: new Date().toISOString(),
  });
}

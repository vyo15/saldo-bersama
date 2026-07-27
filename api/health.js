import { ok } from "./_lib/http.js";
export default function handler(_request, response) { return ok(response, { service: "saldo-bersama-api", status: "ok", timestamp: new Date().toISOString() }); }

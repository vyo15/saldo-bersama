export const json = (response, status, payload, extraHeaders = {}) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(extraHeaders)) response.setHeader(key, value);
  response.end(JSON.stringify(payload));
};

export const ok = (response, data, status = 200) => json(response, status, { ok: true, data });
export const fail = (response, status, code, message, details) => json(response, status, {
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

export const readJsonBody = async (request, maxBytes = 100_000) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Payload terlalu besar."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Payload JSON tidak valid."), { status: 400, code: "INVALID_JSON" }); }
};

export const methodNotAllowed = (response, allowed) => {
  response.setHeader("Allow", allowed.join(", "));
  return fail(response, 405, "METHOD_NOT_ALLOWED", "Metode request tidak diizinkan.");
};

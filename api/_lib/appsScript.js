const connectorError = (code, message, status, cause) => Object.assign(new Error(message), {
  code,
  status,
  cause,
});


const normalizedConnectorFailure = (error) => {
  const code = String(error?.code || "");
  if (code === "INVALID_SIGNATURE") {
    return connectorError(
      "CONNECTOR_AUTH_FAILED",
      "Autentikasi konektor Google Apps Script gagal. Sinkronkan INTERNAL_SHARED_SECRET pada API dan Script Properties.",
      502,
    );
  }
  if (code === "CONFIG_MISSING") {
    return connectorError(
      "CONNECTOR_NOT_CONFIGURED",
      "INTERNAL_SHARED_SECRET belum dikonfigurasi pada Google Apps Script.",
      503,
    );
  }
  if (code === "REQUEST_EXPIRED") {
    return connectorError(
      "CONNECTOR_REQUEST_EXPIRED",
      "Request ke Google Apps Script kedaluwarsa. Periksa waktu sistem server lalu coba lagi.",
      502,
    );
  }
  return null;
};

const appsScriptUrl = () => {
  const raw = String(process.env.APPS_SCRIPT_WEB_APP_URL || "").trim();
  if (!raw) throw connectorError("CONNECTOR_NOT_CONFIGURED", "Koneksi Google Apps Script belum dikonfigurasi.", 503);
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw connectorError("CONNECTOR_NOT_CONFIGURED", "URL Google Apps Script tidak valid.", 503);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" || !parsed.pathname.endsWith("/exec")) {
    throw connectorError("CONNECTOR_NOT_CONFIGURED", "Gunakan URL deployment Google Apps Script yang berakhir /exec.", 503);
  }
  return parsed.toString();
};

export const connectorConfiguration = () => {
  let appsScriptUrlConfigured = false;
  try {
    appsScriptUrl();
    appsScriptUrlConfigured = true;
  } catch {
    appsScriptUrlConfigured = false;
  }
  return {
    appsScriptUrlConfigured,
    sharedSecretConfigured: String(process.env.INTERNAL_SHARED_SECRET || "").length >= 32,
  };
};

export const callAppsScript = async (envelope) => {
  const url = appsScriptUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw connectorError("APPS_SCRIPT_UNREACHABLE", "Google Apps Script menolak atau tidak dapat menerima request.", 502);
    }
    if (!body || typeof body !== "object" || typeof body.ok !== "boolean") {
      throw connectorError("APPS_SCRIPT_INVALID_RESPONSE", "Google Apps Script mengembalikan respons yang tidak valid.", 502);
    }
    if (body.ok === false) {
      const connectorFailure = normalizedConnectorFailure(body.error);
      if (connectorFailure) throw connectorFailure;
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw connectorError("UPSTREAM_TIMEOUT", "Google Apps Script timeout. Jangan ulangi operasi perubahan dengan idempotency key baru.", 504, error);
    }
    if (error.code && error.status) throw error;
    throw connectorError("APPS_SCRIPT_UNREACHABLE", "Google Apps Script belum dapat dihubungi.", 502, error);
  } finally {
    clearTimeout(timer);
  }
};

import { createSecureRandomId } from "../../domain/security.js";
import { ApiError, isAbortError, outcomeUnknownError, parseResponse } from "./errors.js";

const fetchJson = async (url, options, { outcomeSensitive = false } = {}) => {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (outcomeSensitive) throw outcomeUnknownError(error);
    throw new ApiError("Tidak dapat terhubung ke server.", { code: "NETWORK_ERROR", status: 0, cause: error });
  }
  try {
    return await parseResponse(response);
  } catch (error) {
    if (outcomeSensitive && error?.code === "INVALID_RESPONSE" && response?.ok) {
      throw outcomeUnknownError(error, { requestId: error.requestId });
    }
    throw error;
  }
};

export const gatewayFetch = async (action, payload, options, signal) => fetchJson("/api/gateway", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-Request-ID": options.requestId || createSecureRandomId(),
  },
  body: JSON.stringify({
    action,
    payload,
    idempotencyKey: options.idempotencyKey,
    rowVersion: options.rowVersion,
  }),
  signal,
}, { outcomeSensitive: Boolean(options.outcomeSensitive) });

export const readSession = async () => {
  const response = await fetch("/api/session", { credentials: "include" });
  return response.status === 401 ? null : parseResponse(response);
};

export const createServerSession = async (firebaseIdToken) => fetchJson("/api/session", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "login", firebaseIdToken }),
});

export const destroyServerSession = async () => fetchJson("/api/session", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "logout" }),
});

const fileNameFromDisposition = (value, fallback) => {
  const match = String(value || "").match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/^"|"$/g, "")) : fallback;
};

export const downloadExcel = async () => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiError("Export membutuhkan koneksi internet.", { code: "OFFLINE", status: 503 });
  }
  const response = await fetch("/api/export", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Request-ID": createSecureRandomId() },
    body: "{}",
  });
  if (!response.ok) return parseResponse(response);
  const blob = await response.blob();
  const fileName = fileNameFromDisposition(response.headers.get("content-disposition"), "saldo-bersama.xlsx");
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { downloaded: true, fileName, size: blob.size };
};

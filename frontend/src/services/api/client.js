import { createSecureRandomId } from "../../domain/security.js";

export class ApiError extends Error {
  constructor(message, { code = "UNKNOWN", status = 500, details, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId || details?.requestId || "";
  }
}

export const shouldInvalidateSession = (responseStatus, errorCode) => (
  responseStatus === 401 && errorCode === "UNAUTHENTICATED"
);

export const parseResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const errorCode = body.error?.code || "UNKNOWN";
    if (shouldInvalidateSession(response.status, errorCode) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("saldo-bersama:unauthorized"));
    }
    throw new ApiError(body.error?.message || "Permintaan tidak dapat diproses.", {
      code: errorCode,
      status: body.error?.status || response.status,
      details: body.error?.details,
      requestId: response.headers?.get?.("x-request-id") || body.error?.details?.requestId,
    });
  }
  return body.data;
};

export const apiClient = {
  async session() {
    const response = await fetch("/api/session", { credentials: "include" });
    if (response.status === 401) return null;
    return parseResponse(response);
  },

  async createSession(firebaseIdToken) {
    return parseResponse(await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", firebaseIdToken }),
    }));
  },

  async logout() {
    return parseResponse(await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }));
  },

  async request(action, payload = {}, options = {}) {
    const response = await fetch("/api/gateway", {
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
    });
    return parseResponse(response);
  },
};

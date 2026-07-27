import { env } from "../../config/env.js";
import { demoRepository } from "../demo/repository.js";

export class ApiError extends Error {
  constructor(message, { code = "UNKNOWN", status = 500, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const parseResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new ApiError(body.error?.message || "Permintaan tidak dapat diproses.", {
      code: body.error?.code,
      status: response.status,
      details: body.error?.details,
    });
  }
  return body.data;
};

export const apiClient = {
  async session() {
    if (env.demoMode) return demoRepository.session();
    const response = await fetch("/api/session", { credentials: "include" });
    if (response.status === 401) return null;
    return parseResponse(response);
  },

  async createSession(firebaseIdToken) {
    if (env.demoMode) return demoRepository.session();
    return parseResponse(await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", firebaseIdToken }),
    }));
  },

  async logout() {
    if (env.demoMode) return demoRepository.logout();
    return parseResponse(await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }));
  },

  async request(action, payload = {}, options = {}) {
    if (env.demoMode) return demoRepository.request(action, payload, options);
    const response = await fetch("/api/gateway", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": options.requestId || crypto.randomUUID(),
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

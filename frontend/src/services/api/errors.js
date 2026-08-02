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

export const abortError = () => Object.assign(new Error("Permintaan dibatalkan."), {
  name: "AbortError",
  code: "ABORTED",
});

export const isAbortError = (error) => error?.name === "AbortError" || error?.code === "ABORTED";

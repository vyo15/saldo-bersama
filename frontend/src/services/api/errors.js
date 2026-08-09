export class ApiError extends Error {
  constructor(message, { code = "UNKNOWN", status = 500, details, requestId, cause } = {}) {
    super(message, cause ? { cause } : undefined);
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

const responseRequestId = (response, body = null) => {
  const headerValue = response?.headers?.get?.("x-request-id");
  if (headerValue) return headerValue;
  return body?.error?.details?.requestId || "";
};

const parseJsonBody = async (response) => {
  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError("Respons server tidak dapat dibaca.", {
      code: "INVALID_RESPONSE",
      status: Number(response?.status || 0),
      requestId: responseRequestId(response),
      cause,
    });
  }
};

const responseFailure = (response, body) => {
  if (!response.ok) return true;
  return body?.ok === false;
};

const throwResponseError = (response, body) => {
  const error = body?.error || {};
  const errorCode = error.code || "UNKNOWN";
  if (shouldInvalidateSession(response.status, errorCode) && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("saldo-bersama:unauthorized"));
  }
  throw new ApiError(error.message || "Permintaan tidak dapat diproses.", {
    code: errorCode,
    status: error.status || response.status,
    details: error.details,
    requestId: responseRequestId(response, body),
  });
};

const assertResponseEnvelope = (response, body) => {
  if (body?.ok === true && body && "data" in body) return;
  throw new ApiError("Respons server tidak sesuai kontrak aplikasi.", {
    code: "INVALID_RESPONSE",
    status: Number(response?.status || 0),
    requestId: responseRequestId(response),
  });
};

export const parseResponse = async (response) => {
  const body = await parseJsonBody(response);
  if (responseFailure(response, body)) throwResponseError(response, body);
  assertResponseEnvelope(response, body);
  return body.data;
};

export const abortError = () => Object.assign(new Error("Permintaan dibatalkan."), {
  name: "AbortError",
  code: "ABORTED",
});

export const isAbortError = (error) => error?.name === "AbortError" || error?.code === "ABORTED";

export const outcomeUnknownError = (cause, { requestId = "" } = {}) => new ApiError(
  "Koneksi terputus saat perubahan sedang diproses. Hasil penyimpanan belum dapat dipastikan; coba lagi tanpa mengubah data agar request yang sama dapat diverifikasi dengan aman.",
  { code: "OUTCOME_UNKNOWN", status: 0, requestId, cause },
);

export const isOutcomeUnknownError = (error) => [
  "OUTCOME_UNKNOWN",
  "IDEMPOTENCY_IN_PROGRESS",
  "IDEMPOTENCY_OUTCOME_UNKNOWN",
].includes(error?.code);

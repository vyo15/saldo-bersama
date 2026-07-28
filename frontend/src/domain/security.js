const FORMULA_PREFIX = /^[=+\-@]/;

export const neutralizeSpreadsheetFormula = (value) => {
  const text = String(value ?? "").trim();
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
};

export const createSecureRandomId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("Browser tidak menyediakan secure random generator.");
};

export const createIdempotencyKey = createSecureRandomId;

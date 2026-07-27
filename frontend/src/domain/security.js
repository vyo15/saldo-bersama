const FORMULA_PREFIX = /^[=+\-@]/;

export const neutralizeSpreadsheetFormula = (value) => {
  const text = String(value ?? "").trim();
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
};

export const createIdempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

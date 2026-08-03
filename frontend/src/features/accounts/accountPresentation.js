export const BANK_TEMPLATE_OPTIONS = Object.freeze([
  { value: "generic", label: "Bank lainnya" },
  { value: "bca", label: "BCA" },
  { value: "bni", label: "BNI" },
  { value: "btn", label: "BTN" },
  { value: "mandiri", label: "Mandiri" },
  { value: "permata", label: "Permata" },
]);

export const ACCOUNT_TYPE_LABELS = Object.freeze({
  bank: "Bank",
  cash: "Tunai",
  ewallet: "E-wallet",
  savings: "Tabungan",
  emergency_fund: "Dana darurat",
  sinking_fund: "Dana berkala",
  investment: "Investasi",
  other: "Lainnya",
});

export const ACCOUNT_SCOPE_LABELS = Object.freeze({
  shared: "Bersama",
  personal: "Pribadi",
});

const TEMPLATE_MATCHERS = Object.freeze([
  ["bca", /\b(?:bca|bank central asia)\b/i],
  ["bni", /\b(?:bni|bank negara indonesia)\b/i],
  ["btn", /\b(?:btn|bank tabungan negara)\b/i],
  ["mandiri", /\bmandiri\b/i],
  ["permata", /\bpermata(?:bank)?\b/i],
]);

const KNOWN_BANK_SUFFIX = /\s*(?:-|·)\s*(?:BCA|BNI|BTN|Mandiri|Permata)\s*$/i;

export const detectBankTemplate = (account = {}) => {
  if (account.account_type !== "bank") return "generic";
  const name = String(account.name || "");
  return TEMPLATE_MATCHERS.find(([, matcher]) => matcher.test(name))?.[0] || "generic";
};

export const accountCardholderName = (name) => String(name || "").replace(KNOWN_BANK_SUFFIX, "").trim();

export const applyBankTemplateToName = (name, template) => {
  const cleanName = String(name || "").replace(KNOWN_BANK_SUFFIX, "").trim();
  if (!template || template === "generic") return cleanName;
  const label = BANK_TEMPLATE_OPTIONS.find((option) => option.value === template)?.label || "";
  return cleanName ? `${cleanName} · ${label}` : label;
};

export const accountTypeLabel = (type) => ACCOUNT_TYPE_LABELS[type] || String(type || "Lainnya");
export const accountScopeLabel = (scope) => ACCOUNT_SCOPE_LABELS[scope] || String(scope || "");


export const normalizeAccountNumber = (value) => String(value || "").replace(/\D/g, "").slice(0, 34);

export const accountNumberGroups = (value, { placeholder = true } = {}) => {
  const digits = normalizeAccountNumber(value);
  if (!digits) return placeholder ? ["••••", "••••", "••••", "••••"] : [];
  return digits.match(/.{1,4}/g) || [];
};

export const formatAccountNumber = (value, options) => accountNumberGroups(value, options).join(" ");

export const BANK_TEMPLATE_OPTIONS = Object.freeze([
  { value: "generic", label: "Bank lainnya" },
  { value: "bca", label: "BCA" },
  { value: "bni", label: "BNI" },
  { value: "btn", label: "BTN" },
  { value: "mandiri", label: "Mandiri" },
  { value: "permata", label: "Permata" },
]);

export const EWALLET_PROVIDER_OPTIONS = Object.freeze([
  { value: "generic", label: "E-wallet lainnya" },
  { value: "shopeepay", label: "ShopeePay" },
  { value: "dana", label: "DANA" },
  { value: "gopay", label: "GoPay" },
  { value: "ovo", label: "OVO" },
  { value: "linkaja", label: "LinkAja" },
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

const EWALLET_MATCHERS = Object.freeze([
  ["shopeepay", /\bshopee\s*pay\b|\bshopeepay\b/i],
  ["dana", /\bDANA\b/],
  ["gopay", /\bgo\s*pay\b|\bgopay\b/i],
  ["ovo", /\bovo\b/i],
  ["linkaja", /\blink\s*aja!?\b|\blinkaja\b/i],
]);

const KNOWN_BANK_SUFFIX = /\s*(?:-|·)\s*(?:BCA|BNI|BTN|Mandiri|Permata)\s*$/i;
const BANK_LABEL_BY_TEMPLATE = new Map(BANK_TEMPLATE_OPTIONS.map((option) => [option.value, option.label]));
const EWALLET_LABEL_BY_TEMPLATE = new Map(EWALLET_PROVIDER_OPTIONS.map((option) => [option.value, option.label]));

export const detectBankTemplate = (account = {}) => {
  if (account.account_type !== "bank") return "generic";
  if (Object.hasOwn(account, "bank_template")) {
    const template = String(account.bank_template || "generic").toLowerCase();
    return BANK_TEMPLATE_OPTIONS.some((option) => option.value === template) ? template : "generic";
  }
  const name = String(account.name || "");
  return TEMPLATE_MATCHERS.find(([, matcher]) => matcher.test(name))?.[0] || "generic";
};

export const detectEwalletTemplate = (account = {}) => {
  if (account.account_type !== "ewallet") return "generic";
  if (Object.hasOwn(account, "ewallet_template")) {
    const template = String(account.ewallet_template || "generic").toLowerCase();
    return EWALLET_PROVIDER_OPTIONS.some((option) => option.value === template) ? template : "generic";
  }
  const name = String(account.account_name || account.name || "");
  return EWALLET_MATCHERS.find(([, matcher]) => matcher.test(name))?.[0] || "generic";
};

export const accountCardholderName = (name) => String(name || "").replace(KNOWN_BANK_SUFFIX, "").trim();

export const accountTypeLabel = (type) => ACCOUNT_TYPE_LABELS[type] || String(type || "Lainnya");
export const accountScopeLabel = (scope) => ACCOUNT_SCOPE_LABELS[scope] || String(scope || "");

export const accountOwnerName = (account = {}) => String(account.owner_name || "").trim();

export const accountOwnershipLabel = (account = {}) => {
  if (account.owner_scope !== "personal") return "Bersama";
  const ownerName = accountOwnerName(account);
  return ownerName ? `Pribadi · ${ownerName}` : "Pribadi";
};

export const accountProviderLabel = (account = {}) => {
  if (account.account_type === "ewallet") {
    const template = detectEwalletTemplate(account);
    return template === "generic" ? accountTypeLabel(account.account_type) : EWALLET_LABEL_BY_TEMPLATE.get(template) || "E-wallet";
  }
  if (account.account_type !== "bank") return accountTypeLabel(account.account_type);
  const configuredTemplate = detectBankTemplate(account);
  if (configuredTemplate !== "generic") return BANK_LABEL_BY_TEMPLATE.get(configuredTemplate) || "Bank lainnya";
  const inferredTemplate = TEMPLATE_MATCHERS.find(([, matcher]) => matcher.test(String(account.account_name || account.name || "")))?.[0];
  return BANK_LABEL_BY_TEMPLATE.get(inferredTemplate) || "Bank lainnya";
};

export const accountDisplayLabel = (account = {}, { includeOwner = true } = {}) => {
  const name = accountCardholderName(account.account_name || account.name) || "Rekening tanpa nama";
  const provider = accountProviderLabel(account);
  const parts = provider && provider.toLocaleLowerCase("id-ID") !== name.toLocaleLowerCase("id-ID")
    ? [provider, name]
    : [name];

  if (includeOwner && account.owner_scope === "personal") {
    parts.push(accountOwnerName(account) || "Pribadi");
  }

  return parts.filter(Boolean).join(" · ");
};

export const normalizeAccountNumber = (value) => String(value || "").replace(/\D/g, "").slice(0, 34);

export const accountNumberGroups = (value, { placeholder = true } = {}) => {
  const digits = normalizeAccountNumber(value);
  if (!digits) return placeholder ? ["••••", "••••", "••••", "••••"] : [];
  return digits.match(/.{1,4}/g) || [];
};

export const accountCardNumberGroups = (value) => {
  const groups = accountNumberGroups(value);
  return groups.length <= 4 ? groups : ["••••", ...groups.slice(-3)];
};

export const formatAccountNumber = (value, options) => accountNumberGroups(value, options).join(" ");

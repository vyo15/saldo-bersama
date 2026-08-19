import { ACCOUNT_TYPES, BANK_TEMPLATES, EWALLET_TEMPLATES } from "../../domain/constants.js";

export const BANK_TEMPLATE_OPTIONS = Object.freeze([
  { value: BANK_TEMPLATES.GENERIC, label: "Bank lainnya" },
  { value: BANK_TEMPLATES.BCA, label: "BCA" },
  { value: BANK_TEMPLATES.BNI, label: "BNI" },
  { value: BANK_TEMPLATES.BTN, label: "BTN" },
  { value: BANK_TEMPLATES.MANDIRI, label: "Mandiri" },
  { value: BANK_TEMPLATES.PERMATA, label: "Permata" },
]);

export const EWALLET_PROVIDER_OPTIONS = Object.freeze([
  { value: EWALLET_TEMPLATES.GENERIC, label: "E-wallet lainnya" },
  { value: EWALLET_TEMPLATES.SHOPEEPAY, label: "ShopeePay" },
  { value: EWALLET_TEMPLATES.DANA, label: "DANA" },
  { value: EWALLET_TEMPLATES.GOPAY, label: "GoPay" },
  { value: EWALLET_TEMPLATES.OVO, label: "OVO" },
  { value: EWALLET_TEMPLATES.LINKAJA, label: "LinkAja" },
]);

export const ACCOUNT_TYPE_LABELS = Object.freeze({
  [ACCOUNT_TYPES.BANK]: "Bank",
  [ACCOUNT_TYPES.CASH]: "Tunai",
  [ACCOUNT_TYPES.EWALLET]: "E-wallet",
  [ACCOUNT_TYPES.SAVINGS]: "Tabungan",
  [ACCOUNT_TYPES.EMERGENCY_FUND]: "Dana darurat",
  [ACCOUNT_TYPES.SINKING_FUND]: "Dana berkala",
  [ACCOUNT_TYPES.INVESTMENT]: "Investasi",
  [ACCOUNT_TYPES.OTHER]: "Lainnya",
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
export const accountTypeUsesAutomaticName = (type) => [
  ACCOUNT_TYPES.CASH,
  ACCOUNT_TYPES.EWALLET,
  ACCOUNT_TYPES.EMERGENCY_FUND,
].includes(type);

export const defaultAccountName = ({ account_type: type, ewallet_template: ewalletTemplate } = {}) => {
  if (type === ACCOUNT_TYPES.CASH) return ACCOUNT_TYPE_LABELS[ACCOUNT_TYPES.CASH];
  if (type === ACCOUNT_TYPES.EMERGENCY_FUND) return ACCOUNT_TYPE_LABELS[ACCOUNT_TYPES.EMERGENCY_FUND];
  if (type === ACCOUNT_TYPES.EWALLET) {
    const provider = EWALLET_LABEL_BY_TEMPLATE.get(String(ewalletTemplate || "generic"));
    return provider || ACCOUNT_TYPE_LABELS[ACCOUNT_TYPES.EWALLET];
  }
  return "";
};

export const accountScopeLabel = (scope) => ACCOUNT_SCOPE_LABELS[scope] || String(scope || "");

export const accountOwnerName = (account = {}) => String(account.owner_name || "").trim();

export const accountOwnershipLabel = (account = {}) => account.owner_scope === "personal" ? accountOwnerName(account) || "Pribadi" : "Bersama";

export const accountCardOwnershipLabel = (account = {}) => {
  if (account.owner_scope !== "personal") return "Bersama";
  const [firstName = ""] = accountOwnerName(account).split(/\s+/).filter(Boolean);
  return firstName || "Pribadi";
};

const normalizedIdentity = (value) => String(value || "").trim().toLocaleLowerCase("id-ID");

const accountBelongsToCurrentUser = (account = {}, currentUser = {}) => {
  const ownerUserId = String(account.owner_user_id || "");
  const currentUserId = String(currentUser.user_id || "");
  if (ownerUserId && currentUserId) return ownerUserId === currentUserId;
  const ownerName = normalizedIdentity(account.owner_name);
  const currentUserName = normalizedIdentity(currentUser.name);
  return Boolean(ownerName && currentUserName && ownerName === currentUserName);
};

export const filterAccountsByOwnership = (accounts = [], filter = "all", currentUser = {}) => {
  if (filter === "all") return accounts;
  if (filter === "shared") return accounts.filter((account) => account.owner_scope === "shared");
  if (filter === "self") return accounts.filter((account) => account.owner_scope === "personal" && accountBelongsToCurrentUser(account, currentUser));
  if (filter === "partner") return accounts.filter((account) => account.owner_scope === "personal" && !accountBelongsToCurrentUser(account, currentUser));
  return accounts;
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
  const normalizedProvider = provider.toLocaleLowerCase("id-ID");
  const normalizedName = name.toLocaleLowerCase("id-ID");
  const nameAlreadyIncludesProvider = normalizedName === normalizedProvider || normalizedName.startsWith(`${normalizedProvider} · `);
  const parts = provider && !nameAlreadyIncludesProvider
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

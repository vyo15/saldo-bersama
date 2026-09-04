const INVESTMENT_SOURCE = "investment";
const DEFAULT_RETURN_TO = "/investasi";

const normalizePayload = (payload) => payload && typeof payload === "object" ? { ...payload } : {};

const internalReturnTo = (value) => {
  const path = String(value || DEFAULT_RETURN_TO);
  return path.startsWith("/") && !path.startsWith("//") ? path : DEFAULT_RETURN_TO;
};

const legacyActionFor = (action) => ({
  "create-rdn": "create-rdn",
  "setup-portfolio": "setup-portfolio",
  buy: "continue-after-rdn-funding",
  "view-investment": "view-investment",
})[action] || action;

const compatibilityFields = (state) => {
  const fields = { workflowSource: INVESTMENT_SOURCE, workflowAction: legacyActionFor(state.action) };
  if (state.payload.rdnAccountId) fields.rdnAccountId = String(state.payload.rdnAccountId);
  if (state.payload.ensureSetup) fields.ensureSetup = true;
  if (state.action === "buy") fields.openAction = "buy";
  return fields;
};

export const investmentContinuationState = ({ action, returnTo = DEFAULT_RETURN_TO, payload = {}, includeLegacy = true } = {}) => {
  const state = { source: INVESTMENT_SOURCE, action: String(action || ""), returnTo: internalReturnTo(returnTo), payload: normalizePayload(payload) };
  return includeLegacy ? { ...state, ...compatibilityFields(state) } : state;
};

export const investmentRdnAccountSetupState = () => ({
  ...investmentContinuationState({ action: "create-rdn" }),
  // Compatibility contract: legacy account composer/tests still read this exact shape.
  accountPrefill: { account_type: "investment" },
});

const canonicalContinuation = (state) => ({
  source: INVESTMENT_SOURCE,
  action: String(state.action),
  returnTo: internalReturnTo(state.returnTo),
  payload: normalizePayload(state.payload),
});

const isLegacyInvestmentState = (state) => {
  if (state.workflowSource === INVESTMENT_SOURCE) return true;
  if (state.workflowSource === "transaction-transfer") return true;
  if (state.workflowSource === "accounts" && state.workflowAction === "setup-portfolio") return true;
  return state.accountPrefill?.account_type === "investment";
};

const legacyActionFrom = (state) => {
  const fallback = state.accountPrefill?.account_type === "investment" ? "create-rdn" : "";
  const action = String(state.workflowAction || fallback);
  return action === "continue-after-rdn-funding" ? "buy" : action;
};

const legacyPayloadFrom = (state) => {
  const payload = {};
  if (state.rdnAccountId) payload.rdnAccountId = String(state.rdnAccountId);
  if (state.ensureSetup) payload.ensureSetup = true;
  if (state.openAction) payload.openAction = String(state.openAction);
  if (state.draft && typeof state.draft === "object") payload.draft = { ...state.draft };
  return payload;
};

export const readInvestmentContinuation = (state) => {
  if (!state || typeof state !== "object") return null;
  if (state.source === INVESTMENT_SOURCE && state.action) return canonicalContinuation(state);
  if (!isLegacyInvestmentState(state)) return null;
  const action = legacyActionFrom(state);
  if (!action) return null;
  return { source: INVESTMENT_SOURCE, action, returnTo: internalReturnTo(state.returnTo), payload: legacyPayloadFrom(state) };
};

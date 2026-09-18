import { TRANSACTION_TYPES } from "../../domain/constants.js";

export const PLANNING_INTENT_MODES = Object.freeze({
  LOCKED_NEED: "locked-need",
});

const text = (value) => typeof value === "string" ? value.trim() : "";

export const normalizePlanningIntent = (value) => {
  if (!value || typeof value !== "object" || value.mode !== PLANNING_INTENT_MODES.LOCKED_NEED) return null;
  const normalized = {
    mode: PLANNING_INTENT_MODES.LOCKED_NEED,
    budget_id: text(value.budget_id),
    envelope_period_id: text(value.envelope_period_id),
    source_account_id: text(value.source_account_id),
    category_id: text(value.category_id),
  };
  return normalized.budget_id && normalized.envelope_period_id && normalized.source_account_id && normalized.category_id
    ? normalized
    : null;
};

export const isLockedPlanningIntent = (value) => Boolean(normalizePlanningIntent(value));

export const applyPlanningIntentToDraft = ({ initialDraft = null, planningIntent = null } = {}) => {
  const source = initialDraft && typeof initialDraft === "object" ? initialDraft : {};
  const locked = normalizePlanningIntent(planningIntent);
  if (!locked) return Object.keys(source).length ? source : null;
  return {
    ...source,
    transaction_type: TRANSACTION_TYPES.EXPENSE,
    source_account_id: locked.source_account_id,
    category_id: locked.category_id,
    envelope_period_id: locked.envelope_period_id,
    budget_id: locked.budget_id,
  };
};

export const planningIntentLocksField = (planningIntent, field) => {
  if (!isLockedPlanningIntent(planningIntent)) return false;
  return ["transaction_type", "source_account_id", "category_id", "envelope_period_id", "budget_id"].includes(field);
};
export const planningIntentMatchesForm = ({ planningIntent = null, form = null } = {}) => {
  const locked = normalizePlanningIntent(planningIntent);
  if (!locked) return true;
  if (!form || form.transaction_type !== TRANSACTION_TYPES.EXPENSE) return false;
  return String(form.source_account_id || "") === locked.source_account_id
    && String(form.category_id || "") === locked.category_id
    && String(form.envelope_period_id || "") === locked.envelope_period_id
    && String(form.budget_id || "") === locked.budget_id;
};

export const planningDependencyInvalidatesSelection = ({ planningIntent = null, field = "" } = {}) => (
  !isLockedPlanningIntent(planningIntent)
  && ["transaction_type", "category_id", "transaction_date"].includes(field)
);

export const transactionPlanningState = ({ transaction = null, planningIntent = null, initialDraft = null, initialAllocationContext = null } = {}) => {
  const intent = transaction ? null : planningIntent;
  const locked = isLockedPlanningIntent(intent);
  const envelope = locked ? initialAllocationContext?.envelope : null;
  return {
    intent,
    locked,
    initialDraft: applyPlanningIntentToDraft({ initialDraft, planningIntent: intent }),
    dateMin: String(envelope?.period_start || ""),
    dateMax: String(envelope?.period_end || ""),
  };
};


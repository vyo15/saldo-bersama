import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";

const ATTENTION_SOURCES = new Set(["dashboard", "notification-center"]);

const ATTENTION_KEYS = Object.freeze([
  "attentionSource",
  "attentionType",
  "attentionAction",
  "attentionBudgetId",
  "attentionEnvelopeId",
  "attentionGoalId",
  "attentionOccurrenceId",
  "attentionRdnAccountId",
  "attentionSuggestedAmount",
]);

export const isFinancialAttentionState = (state) => Boolean(state && ATTENTION_SOURCES.has(state.attentionSource));

export const stripFinancialAttentionState = (state) => {
  if (!isFinancialAttentionState(state)) return state || null;
  const next = { ...state };
  for (const key of ATTENTION_KEYS) delete next[key];
  return Object.keys(next).length ? next : null;
};

// Compatibility export: feature modules historically imported this name.
export const stripDashboardAttentionState = stripFinancialAttentionState;

export const useDashboardAttentionState = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const attention = useMemo(() => isFinancialAttentionState(location.state) ? { ...location.state } : null, [location.state]);
  const consumeAttention = useCallback(() => {
    if (!attention) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: stripFinancialAttentionState(location.state),
    });
  }, [attention, location.hash, location.pathname, location.search, location.state, navigate]);

  return { attention, consumeAttention };
};

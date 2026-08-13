import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

const ATTENTION_KEYS = Object.freeze([
  "attentionSource",
  "attentionType",
  "attentionAction",
  "attentionBudgetId",
  "attentionEnvelopeId",
  "attentionGoalId",
  "attentionOccurrenceId",
]);

export const stripDashboardAttentionState = (state) => {
  if (!state || state.attentionSource !== "dashboard") return state || null;
  const next = { ...state };
  for (const key of ATTENTION_KEYS) delete next[key];
  return Object.keys(next).length ? next : null;
};

export const useDashboardAttentionState = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialAttentionRef = useRef(location.state?.attentionSource === "dashboard" ? { ...location.state } : null);
  const consumedRef = useRef(false);
  const attention = initialAttentionRef.current;
  const consumeAttention = useCallback(() => {
    if (!attention || consumedRef.current) return;
    consumedRef.current = true;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: stripDashboardAttentionState(location.state),
    });
  }, [attention, location.hash, location.pathname, location.search, location.state, navigate]);

  return { attention, consumeAttention };
};

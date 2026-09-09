import { scrollIntoViewWithMotionPreference } from "../../shared/motion.js";

const findAttentionEnvelope = (activeItems, attentionEnvelopeId) => attentionEnvelopeId
  ? activeItems.find((item) => item.envelope_period_id === attentionEnvelopeId) || null
  : null;

const findAttentionBudget = (budgets, attentionBudgetId, targetEnvelope) => (!targetEnvelope && attentionBudgetId)
  ? budgets.find((item) => item.budget_id === attentionBudgetId) || null
  : null;

const openAttentionFunding = ({ attentionAction, targetEnvelope, attentionSuggestedAmount, openFunding, consumeAttention }) => {
  if (attentionAction !== "fund") return false;
  openFunding({
    sourceAccountId: targetEnvelope?.source_account_id || "",
    envelopePeriodId: targetEnvelope?.envelope_period_id || "",
    suggestedAmount: attentionSuggestedAmount,
  });
  consumeAttention();
  return true;
};

const applyAttentionDetail = ({ targetEnvelope, targetBudget, setDetailRuleId, setLegacyBudgetAttention }) => {
  if (targetEnvelope) setDetailRuleId(targetEnvelope.envelope_rule_id);
  if (targetBudget?.envelope_rule_id) setDetailRuleId(targetBudget.envelope_rule_id);
  if (targetBudget && !targetBudget.envelope_rule_id) setLegacyBudgetAttention(true);
};

const scheduleAttentionBudgetScroll = (targetBudget) => {
  if (!targetBudget?.budget_id) return undefined;
  const selector = `[data-budget-id="${CSS.escape(targetBudget.budget_id)}"]`;
  const frame = window.requestAnimationFrame(() => scrollIntoViewWithMotionPreference(document.querySelector(selector), { block: "center" }));
  return () => window.cancelAnimationFrame(frame);
};

export const runAllocationAttentionNavigation = ({
  attentionAction,
  attentionEnvelopeId,
  attentionBudgetId,
  attentionSuggestedAmount,
  activeItems,
  budgets,
  consumeAttention,
  setDetailRuleId,
  setLegacyBudgetAttention,
  openFunding,
}) => {
  const targetEnvelope = findAttentionEnvelope(activeItems, attentionEnvelopeId);
  if (openAttentionFunding({ attentionAction, targetEnvelope, attentionSuggestedAmount, openFunding, consumeAttention })) return undefined;
  const targetBudget = findAttentionBudget(budgets, attentionBudgetId, targetEnvelope);
  applyAttentionDetail({ targetEnvelope, targetBudget, setDetailRuleId, setLegacyBudgetAttention });
  consumeAttention();
  return scheduleAttentionBudgetScroll(targetBudget);
};

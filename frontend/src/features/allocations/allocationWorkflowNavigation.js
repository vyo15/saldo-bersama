import { useEffect } from "react";
import { scrollWindowToWithMotionPreference } from "../../shared/motion.js";

const ALLOCATION_DASHBOARD_WORKFLOW_ACTIONS = ["create-allocation", "add-need", "choose-need-allocation"];
const loadAllocationDashboardWorkflow = () => import("./allocationDashboardWorkflow.js");

const clearAllocationWorkflowState = (location, navigate) => {
  navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
};

export const useAllocationDashboardCreateWorkflow = ({ canCreate, location, navigate, notify, resourceStatus, activeItems, setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId }) => {
  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    if (resourceStatus !== "ready" || !ALLOCATION_DASHBOARD_WORKFLOW_ACTIONS.includes(workflowAction)) return undefined;
    let disposed = false;
    void loadAllocationDashboardWorkflow().then(({ runAllocationDashboardWorkflow }) => {
      if (disposed) return;
      runAllocationDashboardWorkflow({
        workflowAction, envelopeRuleId: String(location.state?.envelopeRuleId || ""), canCreate, activeItems,
        setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId, notify,
      });
      clearAllocationWorkflowState(location, navigate);
    }).catch(() => {
      if (disposed) return;
      notify({ message: "Aksi Alokasi Dana belum dapat dimuat. Coba lagi.", tone: "warning", dedupeKey: "allocation:workflow-load-failed" });
      clearAllocationWorkflowState(location, navigate);
    });
    return () => { disposed = true; };
  }, [activeItems, canCreate, location, navigate, notify, resourceStatus, setAllocationFilter, setCreateOpen, setDetailAction, setDetailRuleId, setLegacyBudgetAttention, setMessage]);
};

export const useAllocationCommitmentPlanNavigation = ({ resourceStatus, budgetStatus, location, navigate, notify, activeItems, budgets, setLegacyBudgetAttention, setDetailAction, setDetailRuleId }) => {
  useEffect(() => {
    if (resourceStatus !== "ready" || budgetStatus !== "ready" || location.state?.workflowAction !== "commitment-plan") return;
    const budgetId = String(location.state.budgetId || "");
    const sourceAccountId = String(location.state.sourceAccountId || "");
    const targetBudget = budgetId ? budgets.find((item) => item.budget_id === budgetId) : null;
    const targetAllocation = targetBudget?.envelope_rule_id
      ? activeItems.find((item) => item.envelope_rule_id === targetBudget.envelope_rule_id)
      : activeItems.find((item) => item.source_account_id === sourceAccountId);
    if (targetAllocation) {
      setLegacyBudgetAttention(false);
      setDetailAction("");
      setDetailRuleId(targetAllocation.envelope_rule_id);
      window.requestAnimationFrame(() => scrollWindowToWithMotionPreference({ top: 0 }));
    } else {
      notify({ message: "Alokasi sumber Kewajiban belum ditemukan. Hubungkan Kewajiban ke Kebutuhan/Alokasi terlebih dahulu.", tone: "warning", dedupeKey: "allocation:commitment-plan-unavailable" });
    }
    clearAllocationWorkflowState(location, navigate);
  }, [activeItems, budgetStatus, budgets, location, navigate, notify, resourceStatus, setDetailAction, setDetailRuleId, setLegacyBudgetAttention]);
};

export const useAllocationGoalPlanNavigation = ({ resourceStatus, goalResource, location, navigate, notify, setGoalActionTarget }) => {
  useEffect(() => {
    if (resourceStatus !== "ready" || goalResource.status !== "ready" || location.state?.workflowAction !== "goal-plan") return;
    const goalId = String(location.state.goalId || "");
    const goal = (goalResource.data?.items || []).find((item) => item.goal_id === goalId && item.status === "active");
    const allocationIntent = {
      sourceAccountId: String(location.state.sourceAccountId || ""),
      suggestedAmount: Number(location.state.suggestedAmount || 0),
      manualAmount: location.state.manualAmount === true,
    };
    if (goal) setGoalActionTarget({ ...goal, allocation_intent: allocationIntent });
    else notify({ message: "Target aktif tidak ditemukan atau sudah tidak dapat menerima setoran.", tone: "warning", dedupeKey: "allocation:goal-plan-unavailable" });
    clearAllocationWorkflowState(location, navigate);
  }, [goalResource, location, navigate, notify, resourceStatus, setGoalActionTarget]);
};

export const useAllocationFundingNavigation = ({ resourceStatus, location, navigate, openFunding }) => {
  useEffect(() => {
    if (resourceStatus !== "ready" || location.state?.workflowAction !== "fund") return;
    openFunding({ sourceAccountId: String(location.state.sourceAccountId || ""), suggestedAmount: Number(location.state.suggestedAmount || 0) });
    clearAllocationWorkflowState(location, navigate);
  }, [location, navigate, openFunding, resourceStatus]);
};

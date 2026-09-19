import { useEffect, useRef } from "react";
import { scrollWindowToWithMotionPreference } from "../../shared/motion.js";

const ALLOCATION_DASHBOARD_WORKFLOW_ACTIONS = ["create-allocation", "add-need", "choose-need-allocation"];
const loadAllocationDashboardWorkflow = () => import("./allocationDashboardWorkflow.js");

const clearAllocationWorkflowState = (location, navigate) => {
  navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
};

const workflowKeyFromLocation = (location, workflowAction = String(location.state?.workflowAction || "")) => (workflowAction
  ? `${location.key}|${workflowAction}`
  : "");

const useMountedRef = () => {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  return mountedRef;
};

export const useAllocationDashboardCreateWorkflow = ({ canCreate, location, navigate, notify, resourceStatus, activeItems, setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId }) => {
  const workflowHandled = useRef("");
  const mountedRef = useMountedRef();
  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    const workflowKey = workflowKeyFromLocation(location, workflowAction);
    if (resourceStatus !== "ready" || !ALLOCATION_DASHBOARD_WORKFLOW_ACTIONS.includes(workflowAction) || workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;
    const envelopeRuleId = String(location.state?.envelopeRuleId || "");
    clearAllocationWorkflowState(location, navigate);
    void loadAllocationDashboardWorkflow().then(({ runAllocationDashboardWorkflow }) => {
      if (!mountedRef.current) return;
      runAllocationDashboardWorkflow({
        workflowAction, envelopeRuleId, canCreate, activeItems,
        setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId, notify,
      });
    }).catch(() => {
      if (!mountedRef.current) return;
      notify({ message: "Aksi Alokasi Dana belum dapat dimuat. Coba lagi.", tone: "warning", dedupeKey: "allocation:workflow-load-failed" });
    });
  }, [activeItems, canCreate, location, mountedRef, navigate, notify, resourceStatus, setAllocationFilter, setCreateOpen, setDetailAction, setDetailRuleId, setLegacyBudgetAttention, setMessage]);
};

export const useAllocationCommitmentPlanNavigation = ({ resourceStatus, budgetStatus, location, navigate, notify, activeItems, budgets, setLegacyBudgetAttention, setDetailAction, setDetailRuleId }) => {
  const workflowHandled = useRef("");
  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    const workflowKey = workflowKeyFromLocation(location, workflowAction);
    if (resourceStatus !== "ready" || budgetStatus !== "ready" || workflowAction !== "commitment-plan" || workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;
    const budgetId = String(location.state.budgetId || "");
    const sourceAccountId = String(location.state.sourceAccountId || "");
    const targetBudget = budgetId ? budgets.find((item) => item.budget_id === budgetId) : null;
    const targetAllocation = targetBudget?.envelope_rule_id
      ? activeItems.find((item) => item.envelope_rule_id === targetBudget.envelope_rule_id)
      : activeItems.find((item) => item.source_account_id === sourceAccountId);
    clearAllocationWorkflowState(location, navigate);
    if (targetAllocation) {
      setLegacyBudgetAttention(false);
      setDetailAction("");
      setDetailRuleId(targetAllocation.envelope_rule_id);
      window.requestAnimationFrame(() => scrollWindowToWithMotionPreference({ top: 0 }));
    } else {
      notify({ message: "Alokasi sumber Kewajiban belum ditemukan. Hubungkan Kewajiban ke Kebutuhan/Alokasi terlebih dahulu.", tone: "warning", dedupeKey: "allocation:commitment-plan-unavailable" });
    }
  }, [activeItems, budgetStatus, budgets, location, navigate, notify, resourceStatus, setDetailAction, setDetailRuleId, setLegacyBudgetAttention]);
};

export const useAllocationFundingNavigation = ({ resourceStatus, location, navigate, openFunding }) => {
  const workflowHandled = useRef("");
  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    const workflowKey = workflowKeyFromLocation(location, workflowAction);
    if (resourceStatus !== "ready" || workflowAction !== "fund" || workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;
    const intent = { sourceAccountId: String(location.state.sourceAccountId || ""), suggestedAmount: Number(location.state.suggestedAmount || 0) };
    clearAllocationWorkflowState(location, navigate);
    openFunding(intent);
  }, [location, navigate, openFunding, resourceStatus]);
};

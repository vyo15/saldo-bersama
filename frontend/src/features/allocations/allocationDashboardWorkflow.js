import { scrollWindowToWithMotionPreference } from "../../shared/motion.js";

const showNeedSelection = ({ setAllocationFilter, notify }) => {
  setAllocationFilter("all");
  notify({ message: "Pilih Alokasi Dana yang ingin diberi kebutuhan.", tone: "info", dedupeKey: "allocation:dashboard-need-select" });
};

export const runAllocationDashboardWorkflow = ({
  workflowAction,
  envelopeRuleId,
  canCreate,
  activeItems,
  setMessage,
  setCreateOpen,
  setAllocationFilter,
  setLegacyBudgetAttention,
  setDetailAction,
  setDetailRuleId,
  notify,
}) => {
  if (workflowAction === "create-allocation") {
    if (canCreate) {
      setMessage(null);
      setCreateOpen(true);
    } else {
      notify({ message: "Siapkan rekening yang dapat digunakan sebelum membuat Alokasi Dana.", tone: "warning", dedupeKey: "allocation:dashboard-create-unavailable" });
    }
    return;
  }

  if (workflowAction === "add-need") {
    const item = activeItems.find((entry) => entry.envelope_rule_id === envelopeRuleId && entry.can_manage_needs) || null;
    if (item) {
      setLegacyBudgetAttention(false);
      setDetailAction("add-need");
      setDetailRuleId(item.envelope_rule_id);
      window.requestAnimationFrame(() => scrollWindowToWithMotionPreference({ top: 0 }));
      return;
    }
  }

  showNeedSelection({ setAllocationFilter, notify });
};

import { useCallback, useState } from "react";

export const useAllocationWorkspaceUiState = ({ createFormFactory, createNeedsFactory }) => {
  const [move, setMove] = useState({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
  const [createForm, setCreateForm] = useState(createFormFactory);
  const [createNeeds, setCreateNeeds] = useState(createNeedsFactory);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ direction: "fund", amount: "", reason: "" });
  const [message, setMessage] = useState(null);
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [detailAction, setDetailAction] = useState("");
  const [legacyBudgetAttention, setLegacyBudgetAttention] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeReuseNeeds, setCloseReuseNeeds] = useState(false);
  const [closeState, setCloseState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const [releasedFunds, setReleasedFunds] = useState(null);
  const [fundingIntent, setFundingIntent] = useState(null);
  const [fundingError, setFundingError] = useState(null);
  return { move, setMove, createForm, setCreateForm, createNeeds, setCreateNeeds, createOpen, setCreateOpen, moveOpen, setMoveOpen, adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, message, setMessage, allocationFilter, setAllocationFilter, detailAction, setDetailAction, legacyBudgetAttention, setLegacyBudgetAttention, actionTarget, setActionTarget, reminderTarget, setReminderTarget, closeTarget, setCloseTarget, closeReuseNeeds, setCloseReuseNeeds, closeState, setCloseState, archiveTarget, setArchiveTarget, archiveState, setArchiveState, reverseTarget, setReverseTarget, reverseState, setReverseState, releasedFunds, setReleasedFunds, fundingIntent, setFundingIntent, fundingError, setFundingError };
};

export const useAllocationDetailRoute = (location, navigate) => {
  const detailRuleId = String(new URLSearchParams(location.search).get("allocation") || "");
  const setDetailRuleId = useCallback((ruleId, { replace = false } = {}) => {
    const params = new URLSearchParams(location.search);
    if (ruleId) params.set("allocation", String(ruleId));
    else params.delete("allocation");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace, state: null });
  }, [location.hash, location.pathname, location.search, navigate]);
  return { detailRuleId, setDetailRuleId };
};


export const actorCanOperateTransaction = (actor, transaction) => actor?.role === "owner"
  || transaction?.scope === "shared"
  || (transaction?.scope === "personal" && transaction?.owner_user_id === actor?.user_id);

const transactionIsLinked = (transaction) => Boolean(transaction?.recurring_occurrence_id || transaction?.goal_id);

const actorOwnsTransactionAction = (actor, transaction) => actor?.role === "owner"
  || (transaction?.created_by === actor?.user_id && actorCanOperateTransaction(actor, transaction));

const adjustmentActionAllowed = (actor, transaction) => transaction?.transaction_type !== "adjustment" || actor?.role === "owner";

const canModifyTransaction = (actor, transaction, periodOpen) => transaction?.status === "active"
  && periodOpen
  && !transactionIsLinked(transaction)
  && actorOwnsTransactionAction(actor, transaction)
  && adjustmentActionAllowed(actor, transaction);

const canRestoreTransaction = (actor, transaction, periodOpen) => transaction?.status === "cancelled"
  && periodOpen
  && !transactionIsLinked(transaction)
  && actor?.role === "owner";

const managedTransactionSource = (transaction) => {
  if (transaction?.recurring_occurrence_id) return "recurring";
  if (transaction?.goal_id) return "goal";
  return "";
};

export const transactionCapabilities = (actor, transaction, { periodOpen }) => {
  const canModify = canModifyTransaction(actor, transaction, periodOpen);
  return {
    can_edit: Boolean(canModify),
    can_cancel: Boolean(canModify),
    can_restore: Boolean(canRestoreTransaction(actor, transaction, periodOpen)),
    period_closed: Boolean(transaction?.status === "active" && !periodOpen),
    managed_by: managedTransactionSource(transaction),
  };
};

export const transferRouteMode = (actor, source, destination) => {
  if (!actor || !source || !destination || source.account_id === destination.account_id) return "denied";
  const sourceOperable = actor.role === "owner"
    || source.owner_scope === "shared"
    || (source.owner_scope === "personal" && source.owner_user_id === actor.user_id);
  if (!sourceOperable) return "denied";
  if (actor.role !== "owner" && source.owner_scope === "shared" && destination.owner_scope === "personal") {
    return "approval_required";
  }
  return "direct";
};

export const transferRoutesForAccounts = (actor, accounts = []) => accounts.flatMap((source) => accounts
  .filter((destination) => destination.account_id !== source.account_id)
  .map((destination) => ({
    source_account_id: source.account_id,
    destination_account_id: destination.account_id,
    mode: transferRouteMode(actor, source, destination),
  }))
  .filter((route) => route.mode !== "denied"));

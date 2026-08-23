export const canManageBudgetScope = (item, actor) => Boolean(
  actor?.role === "owner"
  || (
    actor?.role === "member"
    && (
      (item?.scope === "shared" && !item?.owner_user_id)
      || (item?.scope === "personal" && item?.owner_user_id === actor?.user_id)
    )
  )
);

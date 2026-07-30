export const ownershipKey = (entity) => {
  const scope = entity?.owner_scope || entity?.scope || "shared";
  return scope === "personal" ? `personal:${entity?.owner_user_id || ""}` : "shared:";
};

export const hasSameOwnership = (left, right) => ownershipKey(left) === ownershipKey(right);

export const filterByOwnership = (items, reference) => (
  reference ? items.filter((item) => hasSameOwnership(item, reference)) : items
);

export const ownershipLabel = (entity) => ownershipKey(entity).startsWith("personal:") ? "pribadi" : "bersama";

export const ownershipKey = (entity) => {
  const scope = entity?.owner_scope || entity?.scope || "shared";
  return scope === "personal" ? `personal:${entity?.owner_user_id || ""}` : "shared:";
};

export const hasSameOwnership = (left, right) => ownershipKey(left) === ownershipKey(right);

export const filterByOwnership = (items, reference) => (
  reference ? items.filter((item) => hasSameOwnership(item, reference)) : items
);

export const ownershipLabel = (entity) => {
  if (!ownershipKey(entity).startsWith("personal:")) return "bersama";
  const ownerName = String(entity?.owner_name || "").trim();
  return ownerName ? `pribadi · ${ownerName}` : "pribadi";
};

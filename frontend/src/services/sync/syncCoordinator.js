export const changedSyncResources = (previous, current) => {
  if (!previous || !current) return [];
  const keys = new Set([...Object.keys(previous.resources || {}), ...Object.keys(current.resources || {})]);
  return [...keys].filter((key) => Number(previous.resources?.[key] || 0) !== Number(current.resources?.[key] || 0));
};

export const createSyncRefreshPlan = ({ previous, current, manual = false, subscribedActions = [] }) => {
  const revisionChanged = Boolean(previous && current)
    && Number(previous.globalRevision || 0) !== Number(current.globalRevision || 0);
  const changedResources = revisionChanged ? changedSyncResources(previous, current) : [];
  const manualTargets = manual ? subscribedActions.filter((action) => action !== "sync.state") : [];
  const targets = [...new Set([...changedResources, ...manualTargets])];
  const bootstrapChanged = manual || targets.includes("bootstrap.get");
  const overviewChanged = manual || targets.includes("dashboard.overview");
  const passiveTargets = targets.filter((action) => !["bootstrap.get", "dashboard.overview"].includes(action));
  return { revisionChanged, changedResources, targets, bootstrapChanged, overviewChanged, passiveTargets };
};

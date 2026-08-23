/**
 * Per-session request epochs prevent slower responses from an older refresh/session from
 * overwriting newer finance state after navigation, refresh, logout, or login.
 */
const FINANCE_RESOURCES = Object.freeze(["bootstrap", "overview"]);

export const createFinanceRequestEpoch = () => ({
  session: 0,
  bootstrap: 0,
  overview: 0,
  pending: {
    bootstrap: false,
    overview: false,
  },
});

export const invalidateFinanceSession = (epoch) => {
  epoch.session += 1;
  for (const resource of FINANCE_RESOURCES) {
    epoch[resource] += 1;
    epoch.pending[resource] = false;
  }
};

export const beginFinanceRequest = (epoch, resources) => {
  const sequences = {};
  for (const resource of resources) {
    if (!FINANCE_RESOURCES.includes(resource)) throw new Error(`Resource finance tidak dikenal: ${resource}`);
    epoch[resource] += 1;
    epoch.pending[resource] = true;
    sequences[resource] = epoch[resource];
  }
  return { session: epoch.session, sequences };
};

export const requestOwnsFinanceResource = (epoch, token, resource) => (
  Boolean(token?.sequences && Object.hasOwn(token.sequences, resource))
  && epoch.session === token.session
  && epoch[resource] === token.sequences[resource]
);

export const finishFinanceResource = (epoch, token, resource) => {
  if (!requestOwnsFinanceResource(epoch, token, resource)) return false;
  epoch.pending[resource] = false;
  return true;
};

export const requestOwnsAnyFinanceResource = (epoch, token) => (
  Object.keys(token?.sequences || {}).some((resource) => requestOwnsFinanceResource(epoch, token, resource))
);

export const hasPendingFinanceRequest = (epoch) => FINANCE_RESOURCES.some((resource) => epoch.pending[resource]);

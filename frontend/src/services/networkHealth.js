export const NETWORK_HEALTH_EVENT = "saldo-bersama:network-health";

export const publishNetworkHealth = (status) => {
  if (typeof window === "undefined") return;
  const normalized = ["online", "degraded", "offline"].includes(status) ? status : "online";
  window.dispatchEvent(new CustomEvent(NETWORK_HEALTH_EVENT, { detail: { status: normalized } }));
};

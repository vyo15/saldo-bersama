import { useEffect, useRef, useState } from "react";
import { NETWORK_HEALTH_EVENT } from "../services/networkHealth.js";

const initialStatus = () => (typeof navigator === "undefined" || navigator.onLine ? "online" : "offline");

export const useNetworkStatus = () => {
  const initial = initialStatus();
  const [state, setState] = useState({ status: initial, recovering: false, recoveryRevision: 0 });
  const previousUnavailableRef = useRef(initial !== "online");

  useEffect(() => {
    let recoveryTimer = null;
    const settle = (status) => {
      const nextStatus = ["online", "degraded", "offline"].includes(status) ? status : "online";
      const recovered = nextStatus === "online" && previousUnavailableRef.current;
      previousUnavailableRef.current = nextStatus !== "online";
      setState((current) => ({
        status: nextStatus,
        recovering: recovered,
        recoveryRevision: recovered ? current.recoveryRevision + 1 : current.recoveryRevision,
      }));
      window.clearTimeout(recoveryTimer);
      if (recovered) recoveryTimer = window.setTimeout(() => setState((current) => ({ ...current, recovering: false })), 1_000);
    };
    const markOffline = () => settle("offline");
    const markOnline = () => settle("online");
    const onHealth = (event) => settle(event.detail?.status || "online");
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    window.addEventListener(NETWORK_HEALTH_EVENT, onHealth);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
      window.removeEventListener(NETWORK_HEALTH_EVENT, onHealth);
      window.clearTimeout(recoveryTimer);
    };
  }, []);

  return {
    ...state,
    online: state.status !== "offline",
    offline: state.status === "offline",
    degraded: state.status === "degraded",
  };
};

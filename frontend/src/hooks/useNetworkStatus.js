import { useEffect, useRef, useState } from "react";

export const useNetworkStatus = () => {
  const initialOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  const [state, setState] = useState({ online: initialOnline, recovering: false, recoveryRevision: 0 });
  const offlineRef = useRef(!initialOnline);

  useEffect(() => {
    let recoveryTimer = null;
    const markOffline = () => {
      offlineRef.current = true;
      setState((current) => ({ ...current, online: false, recovering: false }));
    };
    const markOnline = () => {
      const recovered = offlineRef.current;
      offlineRef.current = false;
      setState((current) => ({
        online: true,
        recovering: recovered,
        recoveryRevision: recovered ? current.recoveryRevision + 1 : current.recoveryRevision,
      }));
      if (recovered) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = window.setTimeout(() => setState((current) => ({ ...current, recovering: false })), 1_000);
      }
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
      window.clearTimeout(recoveryTimer);
    };
  }, []);

  return { ...state, offline: !state.online };
};

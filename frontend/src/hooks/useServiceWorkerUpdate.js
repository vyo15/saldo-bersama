import { useCallback, useEffect, useState } from "react";

export const useServiceWorkerUpdate = () => {
  const [registration, setRegistration] = useState(null);
  useEffect(() => {
    const available = (event) => setRegistration(event.detail?.registration || null);
    window.addEventListener("saldo-bersama:update-available", available);
    navigator.serviceWorker?.getRegistration?.().then((value) => { if (value?.waiting) setRegistration(value); }).catch(() => {});
    return () => window.removeEventListener("saldo-bersama:update-available", available);
  }, []);
  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return;
    let reloaded = false;
    const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(reload, 4_000);
  }, [registration]);
  return { updateAvailable: Boolean(registration?.waiting), applyUpdate };
};

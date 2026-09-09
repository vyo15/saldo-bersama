import { useCallback, useEffect, useState } from "react";

export const useServiceWorkerUpdate = ({ blocked = false } = {}) => {
  const [registration, setRegistration] = useState(null);
  useEffect(() => {
    const available = (event) => setRegistration(event.detail?.registration || null);
    window.addEventListener("saldo-bersama:update-available", available);
    navigator.serviceWorker?.getRegistration?.().then((value) => { if (value?.waiting) setRegistration(value); }).catch(() => {});
    return () => window.removeEventListener("saldo-bersama:update-available", available);
  }, []);
  const applyUpdate = useCallback(() => {
    if (blocked || document.body.classList.contains("modal-open") || !registration?.waiting) return false;
    let reloaded = false;
    const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(reload, 4_000);
    return true;
  }, [blocked, registration]);
  return { updateAvailable: Boolean(registration?.waiting), updateBlocked: blocked, applyUpdate };
};

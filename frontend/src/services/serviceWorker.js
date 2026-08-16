export const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator) || window.isSecureContext !== true) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  const notifyUpdate = () => window.dispatchEvent(new CustomEvent("saldo-bersama:update-available", { detail: { registration } }));
  if (registration.waiting && navigator.serviceWorker.controller) notifyUpdate();
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) notifyUpdate();
    });
  });
  return registration;
};

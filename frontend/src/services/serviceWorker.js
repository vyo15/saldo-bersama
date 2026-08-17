const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOGIN_SW_ACTIVATION_TIMEOUT_MS = 4_000;

const isLoginRoute = () => window.location.pathname === "/login";
const isLocalHostname = () => LOCAL_HOSTNAMES.has(window.location.hostname);

const requestWaitingWorkerActivation = (worker) => {
  if (!worker || !navigator.serviceWorker.controller || !isLoginRoute()) return false;
  worker.postMessage({ type: "SKIP_WAITING" });
  return true;
};

const waitForInstalledWorker = (worker) => new Promise((resolve) => {
  if (!worker || ["installed", "activating", "activated"].includes(worker.state)) {
    resolve(worker || null);
    return;
  }
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    worker.removeEventListener("statechange", onStateChange);
    window.clearTimeout(timer);
    resolve(value);
  };
  const onStateChange = () => {
    if (["installed", "activating", "activated"].includes(worker.state)) finish(worker);
    else if (worker.state === "redundant") finish(null);
  };
  const timer = window.setTimeout(() => finish(null), LOGIN_SW_ACTIVATION_TIMEOUT_MS);
  worker.addEventListener("statechange", onStateChange);
});

const waitForUpdateCheck = (registration) => Promise.race([
  registration.update().catch(() => null),
  new Promise((resolve) => window.setTimeout(() => resolve(null), LOGIN_SW_ACTIVATION_TIMEOUT_MS)),
]);

const waitForControllerChange = (previousController) => new Promise((resolve) => {
  if (navigator.serviceWorker.controller !== previousController) {
    resolve(true);
    return;
  }
  let settled = false;
  const finish = (changed) => {
    if (settled) return;
    settled = true;
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    window.clearTimeout(timer);
    resolve(changed);
  };
  const onControllerChange = () => finish(true);
  const timer = window.setTimeout(() => finish(false), LOGIN_SW_ACTIVATION_TIMEOUT_MS);
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
});

export const prepareLoginServiceWorker = async () => {
  if (!("serviceWorker" in navigator) || window.isSecureContext !== true || !isLoginRoute() || isLocalHostname()) return false;
  const registration = await navigator.serviceWorker.getRegistration("/").catch(() => null);
  if (!registration || !navigator.serviceWorker.controller) return false;

  await waitForUpdateCheck(registration);
  let worker = registration.waiting;
  if (!worker && registration.installing) worker = await waitForInstalledWorker(registration.installing);
  if (!worker) return false;

  const previousController = navigator.serviceWorker.controller;
  if (!requestWaitingWorkerActivation(worker)) return false;
  if (["activating", "activated"].includes(worker.state) || navigator.serviceWorker.controller !== previousController) return true;
  return waitForControllerChange(previousController);
};

export const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator) || window.isSecureContext !== true) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  const notifyUpdate = () => window.dispatchEvent(new CustomEvent("saldo-bersama:update-available", { detail: { registration } }));

  if (registration.waiting && navigator.serviceWorker.controller) {
    if (!requestWaitingWorkerActivation(registration.waiting)) notifyUpdate();
  }

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
      if (!requestWaitingWorkerActivation(worker)) notifyUpdate();
    });
  });

  return registration;
};

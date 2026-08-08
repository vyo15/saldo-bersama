import { env } from "../config/env.js";
import { apiClient } from "./api/client.js";

const urlBase64ToUint8Array = (value) => {
  const candidate = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(candidate)) throw new Error("VAPID public key tidak valid.");
  const padding = "=".repeat((4 - (candidate.length % 4)) % 4);
  const base64 = (candidate + padding).replace(/-/g, "+").replace(/_/g, "/");
  let raw;
  try { raw = atob(base64); } catch { throw new Error("VAPID public key tidak valid."); }
  const bytes = Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("VAPID public key tidak valid.");
  return bytes;
};

const equalBytes = (left, right) => {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.every((value, index) => value === b[index]);
};

const isAppleMobile = () => {
  const userAgent = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
};

const isStandaloneApp = () => window.matchMedia?.("(display-mode: standalone)")?.matches === true
  || navigator.standalone === true;

const notificationCapability = () => {
  const supported = "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
  const secureContext = window.isSecureContext === true;
  const iosInstallRequired = supported && isAppleMobile() && !isStandaloneApp();
  let clientKeyValid = false;
  if (env.vapidPublicKey) {
    try { urlBase64ToUint8Array(env.vapidPublicKey); clientKeyValid = true; } catch { clientKeyValid = false; }
  }
  return {
    supported,
    secureContext,
    iosInstallRequired,
    clientConfigured: Boolean(env.vapidPublicKey),
    clientKeyValid,
    permission: supported ? Notification.permission : "unsupported",
  };
};

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

const currentPushSubscription = async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/")
    || await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

const subscriptionKeyMatches = (subscription) => {
  if (!subscription || !env.vapidPublicKey) return true;
  const currentKey = subscription.options?.applicationServerKey;
  if (!currentKey) return true;
  try { return equalBytes(currentKey, urlBase64ToUint8Array(env.vapidPublicKey)); }
  catch { return false; }
};

const localReason = (capability) => {
  if (!capability.supported) return "unsupported";
  if (!capability.secureContext) return "insecure_context";
  if (capability.iosInstallRequired) return "ios_install_required";
  if (capability.permission === "denied") return "permission_denied";
  if (!capability.clientConfigured) return "client_not_configured";
  if (!capability.clientKeyValid) return "client_configuration_invalid";
  return null;
};

export const getPushNotificationState = async () => {
  const capability = notificationCapability();
  const subscription = capability.supported && capability.secureContext
    ? await currentPushSubscription().catch(() => null)
    : null;
  const browserSubscribed = Boolean(subscription);
  const blockedReason = localReason(capability);
  if (blockedReason) {
    return {
      ...capability,
      reason: blockedReason,
      browserSubscribed,
      registered: false,
      enabled: false,
      server: null,
      activeDeviceCount: 0,
      lastTestFailure: null,
      lastDelivery: null,
    };
  }


  const keyMismatch = browserSubscribed && !subscriptionKeyMatches(subscription);
  let remote;
  try {
    remote = await apiClient.request(
      "notifications.status",
      subscription ? { endpoint: subscription.endpoint } : {},
      { force: true },
    );
  } catch (error) {
    return {
      ...capability,
      reason: "server_status_unavailable",
      browserSubscribed,
      registered: false,
      enabled: false,
      keyMismatch,
      server: null,
      activeDeviceCount: 0,
      lastTestFailure: null,
      lastDelivery: null,
      error,
    };
  }

  const registered = remote.currentDevice?.registered === true;
  let reason = "not_subscribed";
  if (!remote.server?.configured) reason = "server_not_configured";
  else if (!remote.server?.ready) reason = "server_configuration_invalid";
  else if (keyMismatch) reason = "vapid_key_changed";
  else if (remote.currentDevice?.state === "owned_by_other") reason = "account_conflict";
  else if (browserSubscribed && !registered) reason = "registration_required";
  else if (browserSubscribed && registered) reason = remote.lastTestAt ? "ready_tested" : "ready_unverified";

  return {
    ...capability,
    reason,
    browserSubscribed,
    registered,
    enabled: reason === "ready_tested" || reason === "ready_unverified",
    keyMismatch,
    server: remote.server || null,
    currentDevice: remote.currentDevice || null,
    activeDeviceCount: Number(remote.activeDeviceCount || 0),
    lastTestAt: remote.lastTestAt || null,
    lastTestFailure: remote.lastTestFailure || null,
    lastDelivery: remote.lastDelivery || null,
  };
};

const stateError = (state) => {
  const messages = {
    unsupported: "Browser ini belum mendukung Web Push.",
    insecure_context: "Notifikasi memerlukan HTTPS. Untuk pengujian lokal gunakan localhost, bukan alamat IP jaringan lokal.",
    ios_install_required: "Pada iPhone atau iPad, pasang Saldo Bersama ke Home Screen lalu buka dari ikon aplikasi.",
    permission_denied: "Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan browser atau pengaturan notifikasi perangkat.",
    client_not_configured: "VAPID public key belum dikonfigurasi pada frontend.",
    client_configuration_invalid: "VAPID public key pada frontend tidak valid.",
    server_not_configured: "Web Push belum dikonfigurasi pada server.",
    server_configuration_invalid: "Konfigurasi Web Push pada server belum valid.",
    server_status_unavailable: "Status Web Push pada server belum dapat diverifikasi.",
  };
  return messages[state.reason] || null;
};

const subscribeWithCurrentKey = async (registration) => registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey),
});

export const enablePushNotifications = async () => {
  const initialState = await getPushNotificationState();
  const blockingMessage = stateError(initialState);
  if (blockingMessage) throw new Error(blockingMessage);

  const permission = initialState.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Izin notifikasi belum diberikan.");

  const registration = await registerServiceWorker();
  if (!registration) throw new Error("Service worker notifikasi belum tersedia pada koneksi ini.");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  const subscriptionPayload = (value) => {
    const json = value.toJSON();
    return { endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 250) };
  };
  const registerRemote = (value) => apiClient.request(
    "notifications.register",
    subscriptionPayload(value),
    {},
  );

  if (subscription && initialState.keyMismatch) {
    if (initialState.currentDevice?.state === "owned_by_other") await registerRemote(subscription);
    if (["active", "owned_by_other"].includes(initialState.currentDevice?.state)) {
      await apiClient.request(
        "notifications.unregister",
        { endpoint: subscription.endpoint },
        {},
      );
    }
    await subscription.unsubscribe();
    subscription = null;
  }

  let created = false;
  if (!subscription) {
    subscription = await subscribeWithCurrentKey(registration);
    created = true;
  }

  try {
    const result = await registerRemote(subscription);
    let verification = null;
    let verificationError = null;
    try {
      verification = await apiClient.request(
        "notifications.test",
        { endpoint: subscription.endpoint },
        {},
      );
    } catch (error) {
      verificationError = { code: error?.code || "PUSH_VERIFICATION_FAILED", message: error?.message || "Verifikasi otomatis belum berhasil." };
    }
    apiClient.invalidate("notifications.status");
    return { ...result, subscription, verification, verificationError };
  } catch (error) {
    if (created) await subscription.unsubscribe().catch(() => {});
    throw error;
  }
};

export const testPushNotification = async () => {
  const state = await getPushNotificationState();
  if (!state.enabled) throw new Error("Perangkat belum terdaftar aktif dan belum siap menerima notifikasi uji.");
  const subscription = await currentPushSubscription();
  if (!subscription) throw new Error("Subscription perangkat tidak ditemukan.");
  const result = await apiClient.request(
    "notifications.test",
    { endpoint: subscription.endpoint },
    {},
  );
  apiClient.invalidate("notifications.status");
  return result;
};

export const disablePushNotifications = async ({ bestEffort = false, localOnly = false } = {}) => {
  try {
    const subscription = await currentPushSubscription();
    if (!subscription) return { disabled: true, hadSubscription: false };
    if (!localOnly) {
      try {
        await apiClient.request("notifications.unregister", { endpoint: subscription.endpoint }, {});
      } catch (error) {
        if (error?.code !== "NOT_FOUND" && !bestEffort) throw error;
      }
    }
    const unsubscribed = await subscription.unsubscribe();
    apiClient.invalidate("notifications.status");
    return { disabled: true, hadSubscription: true, unsubscribed };
  } catch (error) {
    if (bestEffort) return { disabled: false, errorCode: error?.code || "PUSH_DISABLE_FAILED" };
    throw error;
  }
};

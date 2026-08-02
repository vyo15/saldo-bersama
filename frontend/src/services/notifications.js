import { env } from "../config/env.js";
import { apiClient } from "./api/client.js";
import { createIdempotencyKey } from "../domain/security.js";

const urlBase64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

export const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return null;
  if (import.meta.env.DEV) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("saldo-bersama-")).map((key) => caches.delete(key)));
    }
    return null;
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
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

export const getPushNotificationState = async () => {
  const supported = "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
  if (!supported) return { supported: false, permission: "unsupported", enabled: false };
  const subscription = await currentPushSubscription();
  return { supported: true, permission: Notification.permission, enabled: Boolean(subscription) };
};

export const enablePushNotifications = async () => {
  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("Browser ini belum mendukung Web Push.");
  }
  if (import.meta.env.DEV) throw new Error("Web Push hanya dapat diuji pada deployment HTTPS, bukan server development lokal.");
  if (!env.vapidPublicKey) throw new Error("VAPID public key belum dikonfigurasi.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Izin notifikasi belum diberikan.");

  const registration = await registerServiceWorker();
  if (!registration) throw new Error("Service worker notifikasi belum tersedia.");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey),
  });
  const json = subscription.toJSON();
  await apiClient.request("notifications.register", {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent.slice(0, 250),
  }, { idempotencyKey: createIdempotencyKey() });
  return subscription;
};

export const disablePushNotifications = async ({ bestEffort = false, localOnly = false } = {}) => {
  try {
    const subscription = await currentPushSubscription();
    if (!subscription) return { disabled: true, hadSubscription: false };
    if (!localOnly) {
      try {
        await apiClient.request("notifications.unregister", { endpoint: subscription.endpoint }, { idempotencyKey: createIdempotencyKey() });
      } catch (error) {
        if (error?.code !== "NOT_FOUND" && !bestEffort) throw error;
      }
    }
    const unsubscribed = await subscription.unsubscribe();
    return { disabled: true, hadSubscription: true, unsubscribed };
  } catch (error) {
    if (bestEffort) return { disabled: false, errorCode: error?.code || "PUSH_DISABLE_FAILED" };
    throw error;
  }
};

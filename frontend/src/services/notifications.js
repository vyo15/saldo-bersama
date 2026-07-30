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
  return navigator.serviceWorker.register("/sw.js");
};

export const enablePushNotifications = async () => {
  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("Browser ini belum mendukung Web Push.");
  }
  if (!env.vapidPublicKey) throw new Error("VAPID public key belum dikonfigurasi.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Izin notifikasi belum diberikan.");

  const registration = await registerServiceWorker();
  const subscription = await registration.pushManager.subscribe({
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

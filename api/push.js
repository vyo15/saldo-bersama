import webpush from "web-push";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { verifyInternalPushSignature } from "./_lib/security.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    const body = await readJsonBody(request, 250_000);
    const message = verifyInternalPushSignature(body);
    if (!message) return fail(response, 401, "INVALID_SIGNATURE", "Signature internal tidak valid.");
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) throw new Error("Konfigurasi VAPID belum lengkap.");
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const notification = {
      title: String(message.notification?.title || "Saldo Bersama").slice(0, 80),
      body: String(message.notification?.body || "Ada pembaruan yang perlu diperiksa.").slice(0, 180),
      targetPath: String(message.notification?.targetPath || "/").startsWith("/") ? message.notification.targetPath : "/",
      notificationId: String(message.notification?.notificationId || "").slice(0, 120),
    };
    const results = await Promise.allSettled((message.subscriptions || []).map((subscription) => webpush.sendNotification(subscription, JSON.stringify(notification), { TTL: 3600 })));
    return ok(response, { sent: results.filter((item) => item.status === "fulfilled").length, failed: results.filter((item) => item.status === "rejected").length });
  } catch (error) {
    return fail(response, 500, "PUSH_ERROR", "Notifikasi tidak dapat dikirim.");
  }
}

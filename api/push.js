import webpush from "web-push";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { verifyInternalPushSignature } from "./_lib/security.js";

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  attachRequestId(response, requestId);
  if (request.method !== "POST") {
    logEvent("warn", "push.request.rejected", { requestId, status: 405, code: "METHOD_NOT_ALLOWED", durationMs: Date.now() - startedAt });
    return methodNotAllowed(response, ["POST"]);
  }
  try {
    const body = await readJsonBody(request, 250_000);
    const message = verifyInternalPushSignature(body);
    if (!message) {
      logEvent("warn", "push.request.rejected", { requestId, status: 401, code: "INVALID_SIGNATURE", durationMs: Date.now() - startedAt });
      return fail(response, 401, "INVALID_SIGNATURE", "Signature internal tidak valid.", { requestId });
    }
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) throw Object.assign(new Error("Konfigurasi VAPID belum lengkap."), { code: "VAPID_NOT_CONFIGURED", status: 503 });
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const notification = {
      title: String(message.notification?.title || "Saldo Bersama").slice(0, 80),
      body: String(message.notification?.body || "Ada pembaruan yang perlu diperiksa.").slice(0, 180),
      targetPath: String(message.notification?.targetPath || "/").startsWith("/") ? message.notification.targetPath : "/",
      notificationId: String(message.notification?.notificationId || "").slice(0, 120),
    };
    const results = await Promise.allSettled((message.subscriptions || []).map((subscription) => webpush.sendNotification(subscription, JSON.stringify(notification), { TTL: 3600 })));
    const deliveries = results.map((item, index) => ({
      index,
      delivered: item.status === "fulfilled",
      statusCode: item.status === "rejected" ? Number(item.reason?.statusCode || 0) : Number(item.value?.statusCode || 201),
    }));
    const sent = deliveries.filter((item) => item.delivered).length;
    const failed = deliveries.length - sent;
    logEvent(failed ? "warn" : "info", "push.request.completed", {
      requestId,
      status: 200,
      subscriptionCount: deliveries.length,
      sentCount: sent,
      failedCount: failed,
      durationMs: Date.now() - startedAt,
    });
    return ok(response, { sent, failed, deliveries });
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || "PUSH_ERROR";
    logEvent(status >= 500 ? "error" : "warn", "push.request.failed", {
      requestId,
      status,
      code,
      durationMs: Date.now() - startedAt,
      error: sanitizeError(error),
    });
    return fail(response, status, code, "Notifikasi tidak dapat dikirim.", { requestId });
  }
}

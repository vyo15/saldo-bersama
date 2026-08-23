import { readBatchRows } from "../../db/readBatchRows.js";
import { NOTIFICATION_TYPE_VALUES } from "../../domainConstants.js";
import webpush from "web-push";
import { appendAudit } from "../audit.js";
import { appError, assertVersion, nowIso, parseJson, sanitizeText, strictBoolean, uuid } from "../core.js";
import {
  configureWebPushClient,
  normalizePushEndpoint,
  normalizeSubscriptionKeys,
  webPushConfigurationStatus,
  webPushRequestOptions,
} from "./pushSecurity.js";

const TEST_COOLDOWN_MS = 30_000;
export const NOTIFICATION_TYPES = NOTIFICATION_TYPE_VALUES;
const NOTIFICATION_TYPE_SET = new Set(NOTIFICATION_TYPES);

// Subscription ownership is proven with the current endpoint keys before a device
// may be reassigned. Client identity alone is not enough to take over a subscription.
export const registerPush = async (db, context) => {
  const payload = context.payload || {};
  const endpoint = normalizePushEndpoint(payload.endpoint);
  const keys = normalizeSubscriptionKeys(payload.keys);
  const existing = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=?", [endpoint]);
  const ownedByOtherUser = existing && existing.user_id !== context.actor.user_id;
  const provesCurrentSubscription = ownedByOtherUser
    && existing.p256dh === keys.p256dh
    && existing.auth === keys.auth;
  if (ownedByOtherUser && !provesCurrentSubscription) {
    throw appError("PUSH_ENDPOINT_OWNERSHIP_CONFLICT", "Perangkat ini masih tercatat pada akun lain dan bukti subscription tidak cocok.", 409);
  }

  const timestamp = nowIso();
  const userAgent = sanitizeText(payload.userAgent, 250) || "Unknown device";
  const reassigned = Boolean(existing && existing.user_id !== context.actor.user_id);
  let next;
  if (existing && !reassigned) {
    next = { ...existing, ...keys, user_agent: userAgent, status: "active", updated_at: timestamp };
    await db.execute(
      "UPDATE push_subscriptions SET p256dh=?,auth=?,user_agent=?,status='active',updated_at=? WHERE subscription_id=?",
      [next.p256dh, next.auth, next.user_agent, next.updated_at, existing.subscription_id],
    );
  } else {
    if (existing) {
      const retiredEndpoint = `https://retired.invalid/${existing.subscription_id}`;
      await db.execute(
        "UPDATE push_subscriptions SET endpoint=?,status='inactive',updated_at=? WHERE subscription_id=?",
        [retiredEndpoint, timestamp, existing.subscription_id],
      );
      await db.execute(`UPDATE notification_deliveries
        SET status='expired',locked_by=NULL,error_code='SUBSCRIPTION_REASSIGNED',updated_at=?
        WHERE subscription_id=? AND status IN ('pending','processing','failed')`, [timestamp, existing.subscription_id]);
    }
    next = {
      subscription_id: uuid(),
      user_id: context.actor.user_id,
      endpoint,
      ...keys,
      user_agent: userAgent,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    };
    await db.execute(
      "INSERT INTO push_subscriptions(subscription_id,user_id,endpoint,p256dh,auth,user_agent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [next.subscription_id, next.user_id, next.endpoint, next.p256dh, next.auth, next.user_agent, next.status, next.created_at, next.updated_at],
    );
  }
  await appendAudit(db, context, {
    entityType: "push_subscription",
    entityId: next.subscription_id,
    previous: existing ? { subscriptionId: existing.subscription_id, status: existing.status, userId: existing.user_id, reassigned } : null,
    next: { status: next.status, userId: next.user_id, registered: true },
  });
  return { registered: true, subscriptionId: next.subscription_id, registeredAt: timestamp };
};

export const unregisterPush = async (db, context) => {
  const endpoint = normalizePushEndpoint(context.payload?.endpoint);
  const current = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?", [endpoint, context.actor.user_id]);
  if (!current) throw appError("NOT_FOUND", "Subscription tidak ditemukan.", 404);
  const timestamp = nowIso();
  await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE subscription_id=?", [timestamp, current.subscription_id]);
  await db.execute(`UPDATE notification_deliveries SET status='expired',locked_by=NULL,error_code='SUBSCRIPTION_INACTIVE',updated_at=?
    WHERE subscription_id=? AND status IN ('pending','processing','failed')`, [timestamp, current.subscription_id]);
  await appendAudit(db, context, {
    entityType: "push_subscription",
    entityId: current.subscription_id,
    previous: { status: current.status },
    next: { status: "inactive" },
  });
  return { unregistered: true, unregisteredAt: timestamp };
};

export const notificationPreferences = async (db, context) => {
  const rows = await db.all("SELECT notification_type,enabled,row_version,updated_at FROM notification_preferences WHERE user_id=?", [context.actor.user_id]);
  const stored = new Map(rows.map((row) => [row.notification_type, row]));
  return {
    items: NOTIFICATION_TYPES.map((type) => {
      const row = stored.get(type);
      return {
        type,
        enabled: row ? Number(row.enabled) === 1 : true,
        row_version: row ? Number(row.row_version) : null,
        updated_at: row?.updated_at || null,
        source: row ? "stored" : "default",
      };
    }),
  };
};

export const updateNotificationPreference = async (db, context) => {
  const p = context.payload || {};
  const type = String(p.notification_type || "").trim();
  if (!NOTIFICATION_TYPE_SET.has(type)) throw appError("INVALID_NOTIFICATION_TYPE", "Jenis notifikasi tidak valid.", 400);
  if (p.enabled === undefined || p.enabled === null || p.enabled === "") throw appError("INVALID_BOOLEAN", "Status notifikasi wajib diisi.", 400);
  const enabled = strictBoolean(p.enabled) ? 1 : 0;
  const current = await db.one("SELECT * FROM notification_preferences WHERE user_id=? AND notification_type=?", [context.actor.user_id, type]);
  const timestamp = nowIso();
  let next;
  if (current) {
    assertVersion(current, context.rowVersion ?? p.row_version);
    next = { ...current, enabled, row_version: Number(current.row_version) + 1, updated_at: timestamp };
    const result = await db.execute("UPDATE notification_preferences SET enabled=?,row_version=?,updated_at=? WHERE user_id=? AND notification_type=? AND row_version=?", [enabled, next.row_version, timestamp, context.actor.user_id, type, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Preferensi notifikasi berubah di perangkat lain.", 409);
  } else {
    if (context.rowVersion !== undefined && context.rowVersion !== null || p.row_version !== undefined && p.row_version !== null) {
      throw appError("CONFLICT", "Preferensi notifikasi belum memiliki versi yang dapat diperbarui.", 409);
    }
    next = { user_id: context.actor.user_id, notification_type: type, enabled, row_version: 1, created_at: timestamp, updated_at: timestamp };
    try {
      await db.execute("INSERT INTO notification_preferences(user_id,notification_type,enabled,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?)", [next.user_id, next.notification_type, next.enabled, next.row_version, next.created_at, next.updated_at]);
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) throw appError("CONFLICT", "Preferensi notifikasi berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
      throw error;
    }
  }
  await appendAudit(db, context, {
    entityType: "notification_preference",
    entityId: `${context.actor.user_id}:${type}`,
    previous: current ? { type, enabled: Number(current.enabled) === 1, row_version: Number(current.row_version) } : null,
    next: { type, enabled: Boolean(enabled), row_version: Number(next.row_version) },
  });
  return { type, enabled: Boolean(enabled), row_version: Number(next.row_version), updated_at: next.updated_at };
};

const deviceStateFromSubscription = (current, actorId) => {
  if (!current) return { state: "not_registered", registered: false, updatedAt: null };
  if (current.user_id !== actorId) return { state: "owned_by_other", registered: false, updatedAt: null };
  const active = current.status === "active";
  return { state: active ? "active" : "inactive", registered: active, updatedAt: current.updated_at || null };
};

const notificationStatusStatements = (actorId, endpointValue) => {
  const endpoint = endpointValue ? normalizePushEndpoint(endpointValue) : null;
  const statements = [];
  const currentIndex = endpoint ? statements.push({
    sql: "SELECT subscription_id,user_id,status,updated_at FROM push_subscriptions WHERE endpoint=?",
    args: [endpoint],
  }) - 1 : -1;
  const activeIndex = statements.push({
    sql: "SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id=? AND status='active'",
    args: [actorId],
  }) - 1;
  const deliveryIndex = statements.push({
    sql: `SELECT notification_type,status,attempt_count,last_attempt_at,created_at
      FROM notification_queue WHERE user_id=? ORDER BY created_at DESC LIMIT 1`,
    args: [actorId],
  }) - 1;
  const auditSubscriptionArgs = endpoint ? [actorId, endpoint, actorId] : null;
  const successIndex = endpoint ? statements.push({
    sql: `SELECT timestamp FROM audit_log
      WHERE actor_id=? AND action='notifications.test' AND entity_type='push_subscription'
        AND entity_id=(SELECT subscription_id FROM push_subscriptions WHERE endpoint=? AND user_id=? LIMIT 1)
        AND result='success'
      ORDER BY timestamp DESC LIMIT 1`,
    args: auditSubscriptionArgs,
  }) - 1 : -1;
  const failureIndex = endpoint ? statements.push({
    sql: `SELECT timestamp,new_value FROM audit_log
      WHERE actor_id=? AND action='notifications.test' AND entity_type='push_subscription'
        AND entity_id=(SELECT subscription_id FROM push_subscriptions WHERE endpoint=? AND user_id=? LIMIT 1)
        AND result='failed'
      ORDER BY timestamp DESC LIMIT 1`,
    args: auditSubscriptionArgs,
  }) - 1 : -1;
  return { statements, currentIndex, activeIndex, deliveryIndex, successIndex, failureIndex };
};

const presentLastTestFailure = (row) => {
  if (!row) return null;
  const value = parseJson(row.new_value, {});
  return {
    at: row.timestamp,
    code: sanitizeText(value?.errorCode, 80) || "PUSH_DELIVERY_FAILED",
    providerStatus: Number(value?.providerStatus || 0) || null,
  };
};

const presentLastDelivery = (row) => row ? {
  type: row.notification_type,
  status: row.status,
  attemptCount: Number(row.attempt_count || 0),
  lastAttemptAt: row.last_attempt_at || null,
  createdAt: row.created_at,
} : null;

const rowAt = (rows, index) => {
  if (index < 0) return null;
  const group = rows[index];
  return group && group[0] ? group[0] : null;
};

const notificationDevicePresentation = (current, endpointValue, actorId) => {
  if (!endpointValue) return { state: "not_subscribed", registered: false, updatedAt: null };
  return deviceStateFromSubscription(current, actorId);
};

const notificationStatusFromRows = ({ resultRows, plan, actorId, endpointValue, configuration }) => {
  const current = rowAt(resultRows, plan.currentIndex);
  const activeDevices = rowAt(resultRows, plan.activeIndex);
  const lastDelivery = rowAt(resultRows, plan.deliveryIndex);
  const lastTest = rowAt(resultRows, plan.successIndex);
  const failureRow = lastTest ? null : rowAt(resultRows, plan.failureIndex);
  return {
    server: { configured: configuration.configured, ready: configuration.ready, code: configuration.code },
    currentDevice: notificationDevicePresentation(current, endpointValue, actorId),
    activeDeviceCount: Number(activeDevices ? activeDevices.count : 0),
    lastTestAt: lastTest ? lastTest.timestamp : null,
    lastTestFailure: presentLastTestFailure(failureRow),
    lastDelivery: presentLastDelivery(lastDelivery),
  };
};

export const notificationStatus = async (db, context) => {
  const configuration = webPushConfigurationStatus();
  const actorId = context.actor.user_id;
  const endpointValue = String(context.payload?.endpoint || "").trim();
  const plan = notificationStatusStatements(actorId, endpointValue);
  const resultRows = await readBatchRows(db, plan.statements);
  return notificationStatusFromRows({ resultRows, plan, actorId, endpointValue, configuration });
};

const testRateLimit = async (db, actorId) => {
  const latest = await db.one(`SELECT timestamp FROM audit_log
    WHERE actor_id=? AND action='notifications.test'
    ORDER BY timestamp DESC LIMIT 1`, [actorId]);
  if (!latest?.timestamp) return;
  const elapsed = Date.now() - new Date(latest.timestamp).getTime();
  if (!Number.isFinite(elapsed) || elapsed >= TEST_COOLDOWN_MS) return;
  const retryAfterSeconds = Math.max(1, Math.ceil((TEST_COOLDOWN_MS - elapsed) / 1_000));
  throw Object.assign(appError("PUSH_TEST_RATE_LIMITED", `Tunggu ${retryAfterSeconds} detik sebelum mengirim notifikasi uji lagi.`, 429), { retryAfterSeconds });
};

const pushTransportFailure = (error) => {
  const statusCode = Number(error?.statusCode || 0);
  const transportCode = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  if ([404, 410].includes(statusCode)) return { errorCode: "SUBSCRIPTION_EXPIRED", statusCode, terminalSubscription: true };
  if (transportCode === "PUSH_ENDPOINT_PRIVATE_ADDRESS") return { errorCode: "PUSH_ENDPOINT_PRIVATE_ADDRESS", statusCode, terminalSubscription: true };
  if ([401, 403].includes(statusCode)) return { errorCode: "PUSH_AUTH_REJECTED", statusCode, terminalSubscription: false };
  if (statusCode === 400) return { errorCode: "PUSH_REQUEST_REJECTED", statusCode, terminalSubscription: false };
  if (["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "EAI_NONAME", "ERR_INVALID_IP_ADDRESS"].includes(transportCode)) {
    return { errorCode: "PUSH_DNS_FAILED", statusCode, terminalSubscription: false };
  }
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(transportCode) || message.includes("socket timeout")) {
    return { errorCode: "PUSH_TIMEOUT", statusCode, terminalSubscription: false };
  }
  if (transportCode.startsWith("ERR_TLS_") || transportCode.startsWith("CERT_") || transportCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return { errorCode: "PUSH_TLS_FAILED", statusCode, terminalSubscription: false };
  }
  if (["ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"].includes(transportCode)) {
    return { errorCode: "PUSH_NETWORK_FAILED", statusCode, terminalSubscription: false };
  }
  if (statusCode) return { errorCode: `PUSH_HTTP_${statusCode}`, statusCode, terminalSubscription: false };
  return { errorCode: "PUSH_DELIVERY_FAILED", statusCode, terminalSubscription: false };
};

const pushFailureAppError = ({ errorCode }) => {
  if (errorCode === "SUBSCRIPTION_EXPIRED") return appError("PUSH_SUBSCRIPTION_EXPIRED", "Subscription perangkat sudah kedaluwarsa. Aktifkan ulang notifikasi.", 409);
  if (errorCode === "PUSH_ENDPOINT_PRIVATE_ADDRESS") return appError("PUSH_ENDPOINT_BLOCKED", "Alamat push service perangkat tidak diizinkan. Daftarkan ulang perangkat setelah memeriksa browser dan jaringan.", 409);
  if (errorCode === "PUSH_AUTH_REJECTED") return appError("PUSH_AUTH_REJECTED", "Push service menolak identitas VAPID. Periksa VAPID_SUBJECT dan pasangan key, lalu daftar ulang perangkat.", 502);
  if (errorCode === "PUSH_REQUEST_REJECTED") return appError("PUSH_REQUEST_REJECTED", "Push service menolak subscription atau payload. Nonaktifkan lalu aktifkan kembali notifikasi perangkat.", 502);
  if (errorCode === "PUSH_DNS_FAILED") return appError("PUSH_DNS_FAILED", "DNS push service gagal diakses dari server. Periksa koneksi atau DNS, lalu coba lagi.", 502);
  if (errorCode === "PUSH_TIMEOUT") return appError("PUSH_TIMEOUT", "Push service tidak merespons sebelum batas waktu. Coba lagi setelah koneksi stabil.", 504);
  if (errorCode === "PUSH_TLS_FAILED") return appError("PUSH_TLS_FAILED", "Koneksi TLS ke push service gagal diverifikasi. Periksa waktu sistem dan jaringan.", 502);
  if (errorCode === "PUSH_NETWORK_FAILED") return appError("PUSH_NETWORK_FAILED", "Server belum dapat menjangkau push service. Periksa jaringan lalu coba lagi.", 502);
  return appError("PUSH_DELIVERY_FAILED", "Push service belum menerima notifikasi uji. Periksa konfigurasi dan koneksi lalu coba lagi.", 502);
};

export const testPush = async (db, context, { pushClient = webpush } = {}) => {
  configureWebPushClient(pushClient);
  await testRateLimit(db, context.actor.user_id);
  const endpoint = normalizePushEndpoint(context.payload?.endpoint);
  const subscription = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=? AND status='active'", [endpoint, context.actor.user_id]);
  if (!subscription) throw appError("PUSH_DEVICE_NOT_REGISTERED", "Perangkat ini belum terdaftar aktif pada server.", 409);

  const testedAt = nowIso();
  const notificationId = `test:${sanitizeText(context.idempotencyKey || uuid(), 80)}`;
  try {
    await pushClient.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ notificationType: "test", targetPath: "/pengaturan/notifikasi", notificationId }),
      webPushRequestOptions(300),
    );
  } catch (error) {
    const failure = pushTransportFailure(error);
    const { errorCode, statusCode, terminalSubscription } = failure;
    const recordFailure = async (tx) => {
      if (terminalSubscription) {
        await tx.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE subscription_id=?", [testedAt, subscription.subscription_id]);
        await tx.execute(`UPDATE notification_deliveries SET status='expired',locked_by=NULL,error_code=?,updated_at=?
          WHERE subscription_id=? AND status IN ('pending','processing','failed')`, [errorCode, testedAt, subscription.subscription_id]);
      }
      await appendAudit(tx, context, {
        entityType: "push_subscription",
        entityId: subscription.subscription_id,
        previous: null,
        next: { testAcceptedAt: null, errorCode, providerStatus: statusCode || null },
        result: "failed",
      });
    };
    if (typeof db.transaction === "function") await db.transaction(recordFailure);
    else await recordFailure(db);
    throw pushFailureAppError(failure);
  }

  await appendAudit(db, context, {
    entityType: "push_subscription",
    entityId: subscription.subscription_id,
    previous: null,
    next: { testAcceptedAt: testedAt },
  });
  return { accepted: true, testedAt };
};

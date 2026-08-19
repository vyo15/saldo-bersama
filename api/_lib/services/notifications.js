import { readBatchRows } from "../db/readBatchRows.js";
import { NOTIFICATION_TYPE_VALUES } from "../domainConstants.js";
import { decodeBase64Url } from "../encoding.js";
import { WEB_PUSH_ENV_KEYS, validateVapidConfiguration } from "../webPushConfiguration.js";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import webpush from "web-push";
import { appendAudit } from "./audit.js";
import { addDays, appError, assertVersion, nowIso, parseJson, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid } from "./core.js";
import { goalProjection } from "./planning/goals.js";

const BLOCKED_ENDPOINT_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid", ".onion"];
const TEST_COOLDOWN_MS = 30_000;
export const NOTIFICATION_TYPES = NOTIFICATION_TYPE_VALUES;
const NOTIFICATION_TYPE_SET = new Set(NOTIFICATION_TYPES);
export const PUSH_REQUEST_TIMEOUT_MS = 8_000;

const PUSH_ADDRESS_BLOCKLIST = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) PUSH_ADDRESS_BLOCKLIST.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10],
  ["fec0::", 10], ["ff00::", 8],
]) PUSH_ADDRESS_BLOCKLIST.addSubnet(network, prefix, "ipv6");

const parseIpv6Hextets = (value) => {
  let address = String(value || "").trim().toLowerCase();
  const dottedTail = address.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedTail) {
    const octets = dottedTail[2].split(".").map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    address = `${dottedTail[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const parts = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
};

const ipv4FromHextets = (high, low) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

export const isPublicPushAddress = (value) => {
  const address = String(value || "").trim().toLowerCase();
  const family = net.isIP(address);
  if (!family) return false;
  if (family === 6) {
    const hextets = parseIpv6Hextets(address);
    if (!hextets) return false;
    const ipv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
    if (ipv4Mapped) return isPublicPushAddress(ipv4FromHextets(hextets[6], hextets[7]));
    const wellKnownNat64 = hextets[0] === 0x64 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((part) => part === 0);
    if (wellKnownNat64) return isPublicPushAddress(ipv4FromHextets(hextets[6], hextets[7]));
  }
  return !PUSH_ADDRESS_BLOCKLIST.check(address, family === 4 ? "ipv4" : "ipv6");
};

export const createSafePushLookup = (lookup = dns.lookup) => (hostname, options, callback) => {
  const normalizedOptions = typeof options === "object" && options !== null ? options : {};
  const requestedFamily = typeof options === "number" ? Number(options || 0) : Number(normalizedOptions.family || 0);
  const hints = Number(normalizedOptions.hints || 0);
  const returnAll = normalizedOptions.all === true;
  lookup(hostname, { all: true, verbatim: true, family: requestedFamily, hints }, (error, addresses) => {
    if (error) return callback(error);
    const candidates = Array.isArray(addresses) ? addresses : [];
    if (!candidates.length || candidates.some((entry) => !isPublicPushAddress(entry.address))) {
      return callback(Object.assign(new Error("Alamat push service tidak diizinkan."), { code: "PUSH_ENDPOINT_PRIVATE_ADDRESS" }));
    }
    if (returnAll) return callback(null, candidates);
    const selected = candidates.find((entry) => !requestedFamily || entry.family === requestedFamily) || candidates[0];
    return callback(null, selected.address, selected.family);
  });
};

export const safePushLookup = createSafePushLookup();
const PUSH_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 10, lookup: safePushLookup });
export const webPushRequestOptions = (ttlSeconds) => ({
  TTL: ttlSeconds,
  timeout: PUSH_REQUEST_TIMEOUT_MS,
  agent: PUSH_HTTPS_AGENT,
});

export const webPushConfigurationStatus = (environment = process.env) => {
  const values = Object.fromEntries(WEB_PUSH_ENV_KEYS.map((key) => [key, String(environment[key] || "").trim()]));
  const status = validateVapidConfiguration(values);
  if (!status.enabled) return { configured: false, ready: false, code: "DISABLED", missing: [...WEB_PUSH_ENV_KEYS], invalid: [] };
  if (!status.complete) return { configured: true, ready: false, code: "INCOMPLETE", missing: status.missing, invalid: [] };
  if (!status.valid) return { configured: true, ready: false, code: "INVALID", missing: [], invalid: status.invalid };
  return { configured: true, ready: true, code: "READY", missing: [], invalid: [] };
};

export const configureWebPushClient = (client = webpush, environment = process.env) => {
  const status = webPushConfigurationStatus(environment);
  if (!status.ready) {
    throw appError(
      "WEB_PUSH_NOT_READY",
      status.configured ? "Konfigurasi Web Push belum valid." : "Web Push belum dikonfigurasi pada server.",
      503,
      { configurationCode: status.code },
    );
  }
  try {
    client.setVapidDetails(
      String(environment.VAPID_SUBJECT).trim(),
      String(environment.VITE_VAPID_PUBLIC_KEY).trim(),
      String(environment.VAPID_PRIVATE_KEY).trim(),
    );
  } catch {
    throw appError("WEB_PUSH_NOT_READY", "Konfigurasi Web Push belum valid.", 503, { configurationCode: "CLIENT_REJECTED" });
  }
  return status;
};

export const normalizePushEndpoint = (value) => {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > 2_048) throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blockedHostname = !hostname
    || hostname.length > 253
    || hostname === "localhost"
    || !hostname.includes(".")
    || BLOCKED_ENDPOINT_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    || net.isIP(hostname) !== 0;
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.hash || blockedHostname) {
    throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  }
  return url.href;
};

const normalizeSubscriptionKeys = (keys) => {
  const p256dh = String(keys?.p256dh || "").trim();
  const auth = String(keys?.auth || "").trim();
  const p256dhBuffer = decodeBase64Url(p256dh);
  const authBuffer = decodeBase64Url(auth);
  if (!p256dhBuffer || p256dhBuffer.length !== 65 || p256dhBuffer[0] !== 4 || !authBuffer || authBuffer.length !== 16) {
    throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  }
  return { p256dh: p256dh.replace(/=+$/, ""), auth: auth.replace(/=+$/, "") };
};

export const safeNotificationTargetPath = (value = "/") => {
  const candidate = String(value || "/").trim();
  if (candidate.length > 200 || !/^\/(?!\/)[A-Za-z0-9/_-]*$/.test(candidate) || candidate.includes("\\")) return "/";
  return candidate;
};

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

export const queueNotification = async (db, { userId, type, title, body, targetPath = "/", scheduledAt = nowIso(), dedupeKey }) => {
  const safeDedupeKey = sanitizeText(dedupeKey, 200);
  if (!safeDedupeKey) throw appError("NOTIFICATION_DEDUPE_REQUIRED", "Dedupe key notifikasi wajib diisi.", 500);
  const id = uuid();
  const result = await db.execute(
    "INSERT OR IGNORE INTO notification_queue(notification_id,user_id,notification_type,title,body,target_path,scheduled_at,status,attempt_count,last_attempt_at,locked_by,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, userId, sanitizeText(type, 60), sanitizeText(title, 80), sanitizeText(body, 180), safeNotificationTargetPath(targetPath), scheduledAt, "pending", 0, null, null, safeDedupeKey, nowIso()],
  );
  if (result.rowsAffected === 1) return { notificationId: id, created: true };
  const existing = await db.one("SELECT notification_id FROM notification_queue WHERE dedupe_key=?", [safeDedupeKey]);
  if (!existing) throw appError("NOTIFICATION_QUEUE_CONFLICT", "Notifikasi tidak dapat diantrikan secara idempotent.", 409);
  return { notificationId: existing.notification_id, created: false };
};

export const listSubscriptionsForUser = async (db, userId) => (await db.all(
  "SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=? AND status='active'",
  [userId],
)).map((row) => publicRow(row));

const notificationRecipients = (users, item) => {
  if (item.assignee_user_id) return users.filter((user) => user.user_id === item.assignee_user_id);
  return item.scope === "personal"
    ? users.filter((user) => user.user_id === item.owner_user_id)
    : users;
};

const highestUsageThreshold = (percentage, customThreshold = 75) => {
  if (percentage >= 100) return 100;
  if (percentage >= 90) return 90;
  if (percentage >= customThreshold) return customThreshold;
  return 0;
};

export const notificationRupiah = (value) => `Rp${Math.max(0, Math.round(Number(value || 0))).toLocaleString("id-ID")}`;

const dueTimingLabel = (today, dueDate) => {
  if (dueDate === today) return "hari ini";
  if (dueDate === addDays(today, 1)) return "besok";
  const delta = Math.round((new Date(`${dueDate}T00:00:00+07:00`).getTime() - new Date(`${today}T00:00:00+07:00`).getTime()) / 86_400_000);
  return delta > 1 ? `${delta} hari lagi` : "segera";
};

const shortName = (value, fallback) => sanitizeText(value, 60) || fallback;

const queueForRecipients = async (db, users, item, notification, disabledPreferences = new Set()) => {
  let queued = 0;
  for (const user of notificationRecipients(users, item)) {
    if (disabledPreferences.has(`${user.user_id}:${notification.type}`)) continue;
    const result = await queueNotification(db, {
      userId: user.user_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      targetPath: notification.targetPath,
      scheduledAt: nowIso(),
      dedupeKey: `${notification.dedupeKey}:${user.user_id}`,
    });
    if (result.created) queued += 1;
  }
  return queued;
};

const actionableNotificationReadPlan = ({ today, dueEndDate, period }) => {
  const statements = [];
  const indexes = {};
  const add = (key, statement) => {
    indexes[key] = statements.length;
    statements.push(statement);
  };
  add("users", { sql: "SELECT user_id FROM users WHERE status='active'", args: [] });
  add("preferences", { sql: "SELECT user_id,notification_type FROM notification_preferences WHERE enabled=0", args: [] });
  add("recurringDue", {
    sql: `SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,o.status,o.updated_at,
      r.name,r.kind,r.scope,r.owner_user_id,r.default_account_id,
      a.account_id,a.name AS account_name,a.status AS account_status
    FROM recurring_occurrences o
    JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    JOIN accounts a ON a.account_id=r.default_account_id
    WHERE r.status='active' AND o.status NOT IN ('paid','cancelled') AND o.due_date BETWEEN ? AND ?`,
    args: [today, dueEndDate],
  });
  add("recurringCompleted", {
    sql: `SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,o.updated_at,r.name,r.kind,r.scope,r.owner_user_id
      FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
      WHERE r.status='active' AND o.status='paid' AND substr(o.updated_at,1,10) BETWEEN ? AND ?`,
    args: [addDays(today, -3), today],
  });
  add("budgets", {
    sql: `SELECT b.*,COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id
        AND substr(t.transaction_date,1,7)=b.period_key
        AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount
    FROM budgets b WHERE b.period_key=? AND b.status='active'`,
    args: [period],
  });
  add("envelopes", {
    sql: `SELECT p.envelope_period_id,p.name,p.allocated_amount,p.reserved_amount,r.scope,r.owner_user_id,r.assignee_user_id,
      COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0) AS used_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.status='active' AND r.status='active' AND p.period_start<=? AND p.period_end>=?`,
    args: [today, today],
  });
  add("goals", {
    sql: `SELECT g.*,COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END)
      FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount
    FROM savings_goals g WHERE g.status='active' AND g.target_date IS NOT NULL`,
    args: [],
  });
  add("unallocated", {
    sql: `SELECT scope,owner_user_id,COUNT(*) AS count,SUM(amount) AS total_amount
      FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id IS NULL AND substr(transaction_date,1,7)=?
      GROUP BY scope,owner_user_id`,
    args: [period],
  });
  add("accountBalances", {
    sql: `SELECT a.account_id,
      CASE WHEN a.initial_balance_date<=? THEN a.initial_balance ELSE 0 END + COALESCE((SELECT SUM(CASE
        WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
        WHEN t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
        WHEN t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
        WHEN t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
        WHEN t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
        ELSE 0 END)
      FROM transactions t WHERE t.status='active'
        AND t.transaction_date BETWEEN a.initial_balance_date AND ?
        AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)),0) AS balance
      FROM accounts a WHERE a.status='active'`,
    args: [today, today],
  });
  return { statements, indexes };
};

const queueRecurringDueNotifications = async (db, state, recurring) => {
  const { today, users, disabledPreferences, accountBalances } = state;
  let queued = 0;
  for (const item of recurring) {
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_due",
      title: `${shortName(item.name, item.kind === "income" ? "Pemasukan rutin" : "Tagihan")} ${item.kind === "income" ? "dijadwalkan" : "jatuh tempo"} ${dueTimingLabel(today, item.due_date)}`,
      body: item.kind === "income"
        ? `${notificationRupiah(Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)))} dijadwalkan masuk ke ${shortName(item.account_name, "rekening tujuan")}.`
        : `${notificationRupiah(Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)))} perlu dibayar dari ${shortName(item.account_name, "rekening sumber")}.`,
      targetPath: "/perencanaan/jadwal",
      dedupeKey: `recurring:${item.occurrence_id}:${item.due_date}`,
    }, disabledPreferences);
    const remaining = Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0));
    if (item.kind !== "expense" || remaining <= 0 || item.account_status !== "active" || item.due_date > addDays(today, 2)) continue;
    const balance = Number(accountBalances.get(item.account_id) || 0);
    if (balance >= remaining) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_funding_shortage",
      title: `Dana ${shortName(item.name, "pembayaran")} belum cukup`,
      body: `Masih kurang ${notificationRupiah(remaining - balance)} dari kebutuhan ${notificationRupiah(remaining)} di ${shortName(item.account_name, "rekening sumber")}.`,
      targetPath: "/perencanaan/jadwal",
      dedupeKey: `recurring-shortage:${item.occurrence_id}:${item.due_date}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueRecurringCompletedNotifications = async (db, state, items) => {
  const { users, disabledPreferences } = state;
  let queued = 0;
  for (const item of items) {
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_completed",
      title: `${shortName(item.name, "Jadwal rutin")} berhasil dicatat`,
      body: `${notificationRupiah(Number(item.actual_amount || item.expected_amount || 0))} sudah tercatat sebagai ${item.kind === "income" ? "pemasukan" : "pembayaran"} rutin.`,
      targetPath: "/perencanaan/jadwal",
      dedupeKey: `recurring-completed:${item.occurrence_id}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueBudgetNotifications = async (db, state, budgets) => {
  const { period, users, disabledPreferences } = state;
  let queued = 0;
  for (const item of budgets) {
    const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount)) * 100) : 0;
    const threshold = highestUsageThreshold(percentage, Number(item.warning_threshold || 80));
    if (!threshold) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "budget_threshold",
      title: `Batas ${shortName(item.name, "bulan ini")} sudah ${threshold}%`,
      body: `Terpakai ${notificationRupiah(item.used_amount)} dari ${notificationRupiah(item.amount)}. Sisa ${notificationRupiah(Math.max(0, Number(item.amount || 0) - Number(item.used_amount || 0)))}.`,
      targetPath: "/perencanaan/kantong",
      dedupeKey: `budget:${item.budget_id}:${period}:${threshold}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueEnvelopeNotifications = async (db, state, envelopes) => {
  const { users, disabledPreferences } = state;
  let queued = 0;
  for (const item of envelopes) {
    const allocated = Number(item.allocated_amount || 0);
    const percentage = allocated > 0 ? Math.round(((Number(item.used_amount || 0) + Number(item.reserved_amount || 0)) / allocated) * 100) : 0;
    const threshold = highestUsageThreshold(percentage, 75);
    if (!threshold) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "envelope_threshold",
      title: `Alokasi Dana ${shortName(item.name, "aktif")} sudah ${threshold}%`,
      body: `Terpakai + dipesan ${notificationRupiah(Number(item.used_amount || 0) + Number(item.reserved_amount || 0))} dari ${notificationRupiah(item.allocated_amount)}. Sisa ${notificationRupiah(Math.max(0, allocated - Number(item.used_amount || 0) - Number(item.reserved_amount || 0)))}.`,
      targetPath: "/perencanaan/kantong",
      dedupeKey: `envelope:${item.envelope_period_id}:${threshold}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueGoalNotifications = async (db, state, goals) => {
  const { period, users, disabledPreferences } = state;
  let queued = 0;
  for (const item of goals) {
    const projection = goalProjection(item, Number(item.current_amount || 0));
    if (projection.pace_status !== "behind" && projection.pace_status !== "overdue") continue;
    queued += await queueForRecipients(db, users, item, {
      type: "goal_behind",
      title: `Target ${shortName(item.name, "keuangan")} ${projection.pace_status === "overdue" ? "melewati tenggat" : "tertinggal"}`,
      body: projection.pace_status === "overdue"
        ? `Masih kurang ${notificationRupiah(projection.remaining_amount)} dari target ${notificationRupiah(item.target_amount)}.`
        : `Masih kurang ${notificationRupiah(projection.remaining_amount)}. Kebutuhan rata-rata ${notificationRupiah(projection.required_monthly_amount)} per bulan.`,
      targetPath: "/target",
      dedupeKey: `goal:${item.goal_id}:${period}:${projection.pace_status}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueUnallocatedExpenseNotifications = async (db, state, items) => {
  const { today, users, disabledPreferences } = state;
  let queued = 0;
  for (const item of items) {
    if (Number(item.count || 0) < 1) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "unallocated_expense",
      title: `${Number(item.count || 0)} pengeluaran belum dialokasikan`,
      body: `Total ${notificationRupiah(item.total_amount)} belum masuk Alokasi Dana. Rapikan agar laporan bulan ini tetap akurat.`,
      targetPath: "/transaksi",
      dedupeKey: `unallocated:${item.scope}:${item.owner_user_id || "shared"}:${today}`,
    }, disabledPreferences);
  }
  return queued;
};

export const queueActionableNotifications = async (db) => {
  const today = todayJakarta();
  const dueEnd = new Date(`${today}T00:00:00+07:00`);
  dueEnd.setUTCDate(dueEnd.getUTCDate() + 3);
  const period = today.slice(0, 7);
  const dueEndDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(dueEnd);
  const plan = actionableNotificationReadPlan({ today, dueEndDate, period });
  const rows = await readBatchRows(db, plan.statements);
  const at = (key) => rows[plan.indexes[key]] || [];
  const state = {
    today,
    period,
    dueEndDate,
    users: at("users"),
    disabledPreferences: new Set(at("preferences").map((row) => `${row.user_id}:${row.notification_type}`)),
    accountBalances: new Map(at("accountBalances").map((row) => [row.account_id, Number(row.balance || 0)])),
  };

  let queued = 0;
  queued += await queueRecurringDueNotifications(db, state, at("recurringDue"));
  queued += await queueRecurringCompletedNotifications(db, state, at("recurringCompleted"));
  queued += await queueBudgetNotifications(db, state, at("budgets"));
  queued += await queueEnvelopeNotifications(db, state, at("envelopes"));
  queued += await queueGoalNotifications(db, state, at("goals"));
  queued += await queueUnallocatedExpenseNotifications(db, state, at("unallocated"));
  return queued;
};

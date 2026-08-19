import assert from "node:assert/strict";
import test from "node:test";
import { processPush } from "../../api/jobs.js";
import { listAudit } from "../../api/_lib/services/audit.js";
import { integrityIssues } from "../../api/_lib/services/reporting/index.js";
import {
  createSafePushLookup,
  isPublicPushAddress,
  notificationStatus,
  normalizePushEndpoint,
  queueNotification,
  registerPush,
  safeNotificationTargetPath,
  testPush,
  unregisterPush,
  webPushConfigurationStatus,
} from "../../api/_lib/services/notifications.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createVapidTestKeyPair } from "../helpers/vapid-test-keys.js";

const vapidPair = createVapidTestKeyPair();
const vapidPublicKey = vapidPair.publicKey;
const vapidPrivateKey = vapidPair.privateKey;
const subscriptionKeys = {
  p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 5)]).toString("base64url"),
  auth: Buffer.alloc(16, 3).toString("base64url"),
};
const validPushEnvironment = {
  VITE_VAPID_PUBLIC_KEY: vapidPublicKey,
  VAPID_PRIVATE_KEY: vapidPrivateKey,
  VAPID_SUBJECT: "mailto:security@example.com",
};

const owner = {
  user_id: "push-owner",
  firebase_uid: "firebase-push-owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};
const member = {
  user_id: "push-member",
  firebase_uid: "firebase-push-member",
  email: "member@example.com",
  name: "Member",
  role: "member",
  status: "active",
  row_version: 1,
};

const contextFor = (actor, action, payload = {}, idempotencyKey = `${action}:${actor.user_id}`) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  requestId: `test:${action}:${actor.user_id}`,
  action,
  payload,
  idempotencyKey,
});

const seedUsers = async (db) => {
  const timestamp = new Date().toISOString();
  for (const user of [owner, member]) {
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, user.row_version, timestamp, timestamp],
    );
  }
};

const withPushEnvironment = async (callback) => {
  const previous = Object.fromEntries(Object.keys(validPushEnvironment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, validPushEnvironment);
  try { return await callback(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const register = (db, actor, endpoint) => registerPush(db, contextFor(actor, "notifications.register", {
  endpoint,
  keys: subscriptionKeys,
  userAgent: "Web Push integration test",
}));

test("konfigurasi Web Push menolak grup parsial dan key yang tidak valid", () => {
  assert.equal(webPushConfigurationStatus({}).code, "DISABLED");
  assert.equal(webPushConfigurationStatus({ VITE_VAPID_PUBLIC_KEY: vapidPublicKey }).code, "INCOMPLETE");
  assert.equal(webPushConfigurationStatus({ ...validPushEnvironment, VAPID_PRIVATE_KEY: "invalid" }).code, "INVALID");
  const otherPair = createVapidTestKeyPair();
  assert.deepEqual(
    webPushConfigurationStatus({ ...validPushEnvironment, VAPID_PRIVATE_KEY: otherPair.privateKey }).invalid,
    ["VAPID_KEY_PAIR"],
  );
  assert.equal(webPushConfigurationStatus(validPushEnvironment).code, "READY");
  assert.deepEqual(
    webPushConfigurationStatus({ ...validPushEnvironment, VAPID_SUBJECT: "https://localhost" }).invalid,
    ["VAPID_SUBJECT"],
  );
});

test("endpoint push dan target route dibatasi ke HTTPS publik serta path same-origin", () => {
  const accepted = "https://fcm.googleapis.com/fcm/send/device-token";
  assert.equal(normalizePushEndpoint(accepted), accepted);
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/a",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "https://push.example.test/device",
    "https://user:secret@fcm.googleapis.com/push",
    "https://fcm.googleapis.com/push#fragment",
    "https://fcm.googleapis.com:8443/push",
  ]) {
    assert.throws(() => normalizePushEndpoint(endpoint), (error) => error?.code === "INVALID_SUBSCRIPTION");
  }
  assert.equal(isPublicPushAddress("8.8.8.8"), true);
  assert.equal(isPublicPushAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicPushAddress("::ffff:8.8.8.8"), true);
  assert.equal(isPublicPushAddress("64:ff9b::808:808"), true);
  for (const address of [
    "127.0.0.1", "10.1.2.3", "169.254.1.1", "192.168.1.1", "::1", "fc00::1", "fe80::1", "fec0::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "64:ff9b::7f00:1", "64:ff9b:1::1",
    "2001::1", "2002:7f00:1::",
  ]) {
    assert.equal(isPublicPushAddress(address), false);
  }
  assert.equal(safeNotificationTargetPath("/pengaturan"), "/pengaturan");
  for (const target of ["//evil.example", "/pengaturan?tab=push", "/../admin", "/a\\b"]) {
    assert.equal(safeNotificationTargetPath(target), "/");
  }
});

test("custom DNS lookup Web Push menghormati kontrak callback Node untuk mode all dan single", async () => {
  const addresses = [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ];
  const calls = [];
  const lookup = createSafePushLookup((hostname, options, callback) => {
    calls.push({ hostname, options });
    callback(null, addresses);
  });

  const all = await new Promise((resolve, reject) => lookup("push.example.net", { all: true, hints: 32 }, (error, result) => {
    if (error) reject(error);
    else resolve(result);
  }));
  assert.deepEqual(all, addresses);

  const single = await new Promise((resolve, reject) => lookup("push.example.net", { family: 4 }, (error, address, family) => {
    if (error) reject(error);
    else resolve({ address, family });
  }));
  assert.deepEqual(single, addresses[0]);
  assert.equal(calls.every((call) => call.options.all === true), true);

  const blockedLookup = createSafePushLookup((_hostname, _options, callback) => callback(null, [
    { address: "127.0.0.1", family: 4 },
  ]));
  await assert.rejects(
    () => new Promise((resolve, reject) => blockedLookup("push.example.net", { all: true }, (error, result) => error ? reject(error) : resolve(result))),
    (error) => error?.code === "PUSH_ENDPOINT_PRIVATE_ADDRESS",
  );
});

test("registrasi sinkron dengan backend dan transfer akun memerlukan bukti subscription yang cocok", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://updates.push.services.mozilla.com/wpush/v2/device-one";
  try {
    await seedUsers(db);
    const ownerRegistration = await register(db, owner, endpoint);
    const queued = await queueNotification(db, {
      userId: owner.user_id,
      type: "account-transfer-guard",
      title: "Pengingat keuangan",
      body: "Periksa aplikasi.",
      targetPath: "/pengaturan",
      dedupeKey: "account-transfer-guard:owner",
    });
    const timestamp = new Date().toISOString();
    await db.execute(`INSERT INTO notification_deliveries(
      delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at
    ) VALUES(?,?,?,'pending',0,NULL,NULL,NULL,?,?)`, ["delivery-transfer-guard", queued.notificationId, ownerRegistration.subscriptionId, timestamp, timestamp]);
    const ownerStatus = await withPushEnvironment(() => notificationStatus(db, contextFor(owner, "notifications.status", { endpoint })));
    assert.equal(ownerStatus.currentDevice.state, "active");
    assert.equal(ownerStatus.activeDeviceCount, 1);
    assert.equal(ownerStatus.lastTestAt, null);

    await assert.rejects(
      () => registerPush(db, contextFor(member, "notifications.register", {
        endpoint,
        keys: { ...subscriptionKeys, auth: Buffer.alloc(16, 8).toString("base64url") },
        userAgent: "Mismatched browser subscription",
      })),
      (error) => error?.code === "PUSH_ENDPOINT_OWNERSHIP_CONFLICT" && error?.status === 409,
    );

    const memberRegistration = await register(db, member, endpoint);
    assert.notEqual(memberRegistration.subscriptionId, ownerRegistration.subscriptionId);
    const retiredOwnerSubscription = await db.one("SELECT endpoint,status,user_id FROM push_subscriptions WHERE subscription_id=?", [ownerRegistration.subscriptionId]);
    assert.match(retiredOwnerSubscription.endpoint, /^https:\/\/retired\.invalid\//);
    assert.equal(retiredOwnerSubscription.status, "inactive");
    assert.equal(retiredOwnerSubscription.user_id, owner.user_id);
    assert.deepEqual({ ...(await db.one("SELECT status,error_code FROM notification_deliveries WHERE delivery_id='delivery-transfer-guard'")) }, {
      status: "expired",
      error_code: "SUBSCRIPTION_REASSIGNED",
    });

    const memberStatus = await withPushEnvironment(() => notificationStatus(db, contextFor(member, "notifications.status", { endpoint })));
    assert.equal(memberStatus.currentDevice.state, "active");
    assert.equal(memberStatus.activeDeviceCount, 1);
    assert.equal((await withPushEnvironment(() => notificationStatus(db, contextFor(owner, "notifications.status", { endpoint })))).currentDevice.state, "owned_by_other");

    await unregisterPush(db, contextFor(member, "notifications.unregister", { endpoint }));
    await assert.rejects(
      () => registerPush(db, contextFor(owner, "notifications.register", {
        endpoint,
        keys: { ...subscriptionKeys, auth: Buffer.alloc(16, 8).toString("base64url") },
        userAgent: "Mismatched inactive browser subscription",
      })),
      (error) => error?.code === "PUSH_ENDPOINT_OWNERSHIP_CONFLICT" && error?.status === 409,
    );
    await register(db, owner, endpoint);
  } finally {
    db.close();
  }
});

test("notifikasi uji hanya menuju perangkat aktor, memakai payload privat, dan tercatat per perangkat", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://fcm.googleapis.com/fcm/send/test-device";
  const calls = [];
  const pushClient = {
    setVapidDetails: (...args) => calls.push({ type: "config", args }),
    sendNotification: async (subscription, payload, options) => calls.push({ type: "send", subscription, payload: JSON.parse(payload), options }),
  };
  try {
    await seedUsers(db);
    await register(db, owner, endpoint);
    const result = await withPushEnvironment(() => testPush(
      db,
      contextFor(owner, "notifications.test", { endpoint }, "push-test-once"),
      { pushClient },
    ));
    assert.equal(result.accepted, true);
    const sent = calls.find((call) => call.type === "send");
    assert.equal(sent.subscription.endpoint, endpoint);
    assert.deepEqual(Object.keys(sent.payload).sort(), ["notificationId", "notificationType", "targetPath"]);
    assert.equal(sent.payload.notificationType, "test");
    assert.equal(sent.payload.targetPath, "/pengaturan/notifikasi");
    assert.equal(sent.options.timeout, 8_000);
    assert.equal(typeof sent.options.agent?.options?.lookup, "function");

    const status = await withPushEnvironment(() => notificationStatus(db, contextFor(owner, "notifications.status", { endpoint })));
    assert.match(status.lastTestAt, /^\d{4}-\d{2}-\d{2}T/);
    await assert.rejects(
      () => withPushEnvironment(() => testPush(db, contextFor(owner, "notifications.test", { endpoint }, "push-test-twice"), { pushClient })),
      (error) => error?.code === "PUSH_TEST_RATE_LIMITED" && error?.status === 429,
    );
  } finally {
    db.close();
  }
});

test("kegagalan DNS notifikasi uji tetap menjaga subscription aktif dan memberi diagnosis aman", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://fcm.googleapis.com/fcm/send/dns-device";
  try {
    await seedUsers(db);
    await register(db, owner, endpoint);
    const pushClient = {
      setVapidDetails: () => {},
      sendNotification: async () => { throw Object.assign(new Error("temporary dns failure"), { code: "EAI_AGAIN" }); },
    };
    await assert.rejects(
      () => withPushEnvironment(() => testPush(db, contextFor(owner, "notifications.test", { endpoint }, "push-dns-failure"), { pushClient })),
      (error) => error?.code === "PUSH_DNS_FAILED" && error?.status === 502,
    );
    const subscription = await db.one("SELECT status FROM push_subscriptions WHERE endpoint=?", [endpoint]);
    assert.equal(subscription.status, "active");
    const status = await withPushEnvironment(() => notificationStatus(db, contextFor(owner, "notifications.status", { endpoint })));
    assert.equal(status.lastTestAt, null);
    assert.deepEqual(status.lastTestFailure, {
      at: status.lastTestFailure.at,
      code: "PUSH_DNS_FAILED",
      providerStatus: null,
    });
    assert.match(status.lastTestFailure.at, /^\d{4}-\d{2}-\d{2}T/);
    const audit = await listAudit(db, contextFor(owner, "audit.list", { limit: 20 }));
    const failure = audit.items.find((item) => item.action === "notifications.test" && item.result === "failed");
    assert.equal(failure.detail_code, "PUSH_DNS_FAILED");
    assert.equal(Object.hasOwn(failure, "new_value"), false);
  } finally {
    db.close();
  }
});

test("subscription 410 dinonaktifkan dan delivery tertunda ditandai expired", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://fcm.googleapis.com/fcm/send/expired-device";
  try {
    await seedUsers(db);
    const registration = await register(db, owner, endpoint);
    const queued = await queueNotification(db, {
      userId: owner.user_id,
      type: "test-expiry",
      title: "Pengingat keuangan",
      body: "Periksa aplikasi.",
      targetPath: "/pengaturan",
      dedupeKey: "test-expiry:owner",
    });
    const timestamp = new Date().toISOString();
    await db.execute(`INSERT INTO notification_deliveries(
      delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at
    ) VALUES(?,?,?,'pending',0,NULL,NULL,NULL,?,?)`, ["delivery-expiry", queued.notificationId, registration.subscriptionId, timestamp, timestamp]);

    const pushClient = {
      setVapidDetails: () => {},
      sendNotification: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); },
    };
    await assert.rejects(
      () => withPushEnvironment(() => testPush(db, contextFor(owner, "notifications.test", { endpoint }, "push-expired"), { pushClient })),
      (error) => error?.code === "PUSH_SUBSCRIPTION_EXPIRED",
    );
    assert.equal((await db.one("SELECT status FROM push_subscriptions WHERE subscription_id=?", [registration.subscriptionId])).status, "inactive");
    assert.equal((await db.one("SELECT status FROM notification_deliveries WHERE delivery_id='delivery-expiry'")).status, "expired");
    const failureAudit = await db.one("SELECT result,new_value FROM audit_log WHERE action='notifications.test' ORDER BY timestamp DESC LIMIT 1");
    assert.equal(failureAudit.result, "failed");
    assert.equal(JSON.parse(failureAudit.new_value).errorCode, "SUBSCRIPTION_EXPIRED");
  } finally {
    db.close();
  }
});



test("integrity check mendeteksi ownership delivery dan status Push yang tidak konsisten", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://fcm.googleapis.com/fcm/send/integrity-device";
  try {
    await seedUsers(db);
    const registration = await register(db, owner, endpoint);
    const queued = await queueNotification(db, {
      userId: member.user_id,
      type: "integrity-guard",
      title: "Pengingat keuangan",
      body: "Periksa aplikasi.",
      targetPath: "/pengaturan",
      dedupeKey: "integrity-guard:member",
    });
    const timestamp = new Date().toISOString();
    await db.execute(`INSERT INTO notification_deliveries(
      delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at
    ) VALUES(?,?,?,'pending',0,NULL,NULL,NULL,?,?)`, ["delivery-integrity-guard", queued.notificationId, registration.subscriptionId, timestamp, timestamp]);
    await db.execute("UPDATE users SET status='inactive' WHERE user_id=?", [owner.user_id]);
    await db.execute("UPDATE notification_queue SET status='sent' WHERE notification_id=?", [queued.notificationId]);

    const codes = new Set((await integrityIssues(db)).map((issue) => issue.code));
    assert.equal(codes.has("PUSH_DELIVERY_OWNERSHIP_MISMATCH"), true);
    assert.equal(codes.has("PUSH_SUBSCRIPTION_INACTIVE_USER"), true);
    assert.equal(codes.has("PUSH_QUEUE_TERMINAL_WITH_RETRYABLE_DELIVERY"), true);
  } finally {
    db.close();
  }
});

test("endpoint yang berubah ke alamat privat dinonaktifkan dan tidak terus di-retry", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://push.example.net/device-private-resolution";
  try {
    await seedUsers(db);
    const registration = await register(db, owner, endpoint);
    const first = await queueNotification(db, {
      userId: owner.user_id,
      type: "dns-guard-one",
      title: "Pengingat keuangan",
      body: "Periksa aplikasi.",
      targetPath: "/pengaturan",
      dedupeKey: "dns-guard-one:owner",
    });
    const second = await queueNotification(db, {
      userId: owner.user_id,
      type: "dns-guard-two",
      title: "Pengingat keuangan",
      body: "Periksa aplikasi.",
      targetPath: "/pengaturan",
      dedupeKey: "dns-guard-two:owner",
    });
    const timestamp = new Date().toISOString();
    for (const [deliveryId, notificationId] of [["delivery-dns-one", first.notificationId], ["delivery-dns-two", second.notificationId]]) {
      await db.execute(`INSERT INTO notification_deliveries(
        delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at
      ) VALUES(?,?,?,'pending',0,NULL,NULL,NULL,?,?)`, [deliveryId, notificationId, registration.subscriptionId, timestamp, timestamp]);
    }
    const pushClient = {
      setVapidDetails: () => {},
      sendNotification: async () => { throw Object.assign(new Error("blocked"), { code: "PUSH_ENDPOINT_PRIVATE_ADDRESS" }); },
    };
    const result = await withPushEnvironment(() => processPush(db, { pushClient }));
    assert.equal(result.deviceExpired, 1);
    assert.equal((await db.one("SELECT status FROM push_subscriptions WHERE subscription_id=?", [registration.subscriptionId])).status, "inactive");
    const deliveries = (await db.all("SELECT status,error_code FROM notification_deliveries WHERE subscription_id=? ORDER BY delivery_id", [registration.subscriptionId])).map((row) => ({ ...row }));
    assert.deepEqual(deliveries, [
      { status: "expired", error_code: "PUSH_ENDPOINT_PRIVATE_ADDRESS" },
      { status: "expired", error_code: "PUSH_ENDPOINT_PRIVATE_ADDRESS" },
    ]);
  } finally {
    db.close();
  }
});

test("payload Web Push normal tidak membawa detail finansial dari queue server", async () => {
  const db = await createSqliteTestDatabase();
  const endpoint = "https://fcm.googleapis.com/fcm/send/privacy-device";
  const calls = [];
  const pushClient = {
    setVapidDetails: () => {},
    sendNotification: async (_subscription, payload) => calls.push(JSON.parse(payload)),
  };
  try {
    await seedUsers(db);
    await register(db, owner, endpoint);
    await queueNotification(db, {
      userId: owner.user_id,
      type: "manual_reminder",
      title: "Cek BCA Utama",
      body: "Sisa Rp99.999.999 untuk Dana Darurat.",
      targetPath: "/target",
      dedupeKey: "privacy:manual-reminder",
    });
    const result = await withPushEnvironment(() => processPush(db, { pushClient }));
    assert.equal(result.sent, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]).sort(), ["notificationId", "notificationType", "targetPath"]);
    const serialized = JSON.stringify(calls[0]);
    for (const sensitive of ["BCA Utama", "Rp99.999.999", "Dana Darurat"]) assert.equal(serialized.includes(sensitive), false);
  } finally {
    db.close();
  }
});

test("retry multi-perangkat hanya mengulang delivery yang gagal dan tidak menggandakan perangkat sukses", async () => {
  const db = await createSqliteTestDatabase();
  const endpointA = "https://fcm.googleapis.com/fcm/send/device-a";
  const endpointB = "https://updates.push.services.mozilla.com/wpush/v2/device-b";
  try {
    await seedUsers(db);
    await register(db, owner, endpointA);
    await register(db, owner, endpointB);
    const queued = await queueNotification(db, {
      userId: owner.user_id,
      type: "budget_threshold",
      title: "Pengingat keuangan",
      body: "Periksa aplikasi.",
      targetPath: "/perencanaan/kantong",
      dedupeKey: "multi-device:owner",
    });

    const firstCalls = [];
    const firstClient = {
      setVapidDetails: () => {},
      sendNotification: async (subscription, payload, options) => {
        firstCalls.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
        if (subscription.endpoint === endpointB) throw Object.assign(new Error("temporary"), { statusCode: 503 });
      },
    };
    const first = await withPushEnvironment(() => processPush(db, { pushClient: firstClient }));
    assert.equal(first.claimed, 1);
    assert.equal(first.sent, 0);
    assert.equal(first.failed, 1);
    assert.equal(first.partial, 1);
    assert.equal(firstCalls.length, 2);
    assert.ok(firstCalls.every((call) => Object.keys(call.payload).sort().join(",") === "notificationId,notificationType,targetPath"));
    assert.ok(firstCalls.every((call) => call.payload.notificationType === "budget_threshold" && call.payload.targetPath === "/perencanaan/kantong"));
    assert.ok(firstCalls.every((call) => !JSON.stringify(call.payload).includes("Pengingat keuangan") && !JSON.stringify(call.payload).includes("Periksa aplikasi.")));
    assert.ok(firstCalls.every((call) => call.options.timeout === 8_000));
    assert.ok(firstCalls.every((call) => typeof call.options.agent?.options?.lookup === "function"));
    assert.equal((await db.one("SELECT status FROM notification_queue WHERE notification_id=?", [queued.notificationId])).status, "failed");

    const secondCalls = [];
    const secondClient = {
      setVapidDetails: () => {},
      sendNotification: async (subscription) => { secondCalls.push(subscription.endpoint); },
    };
    const second = await withPushEnvironment(() => processPush(db, { pushClient: secondClient }));
    assert.equal(second.sent, 1);
    assert.deepEqual(secondCalls, [endpointB]);
    assert.equal((await db.one("SELECT status FROM notification_queue WHERE notification_id=?", [queued.notificationId])).status, "sent");

    const deliveries = (await db.all(`SELECT s.endpoint,d.status,d.attempt_count
      FROM notification_deliveries d JOIN push_subscriptions s ON s.subscription_id=d.subscription_id
      WHERE d.notification_id=? ORDER BY s.endpoint`, [queued.notificationId])).map((row) => ({ ...row }));
    assert.deepEqual(deliveries, [
      { endpoint: endpointA, status: "sent", attempt_count: 1 },
      { endpoint: endpointB, status: "sent", attempt_count: 2 },
    ]);
  } finally {
    db.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createSessionCookie } from "../../api/_lib/security.js";
import {
  createRegisteredSession,
  resolveRegisteredSession,
  revokeSessionFromRequest,
  sessionVerifierHash,
} from "../../api/_lib/sessionRegistry.js";
import { listOwnSessions, revokeAllOwnSessions, revokeOwnSession } from "../../api/_lib/services/sessions.js";
import { deactivateUser, upsertUser } from "../../api/_lib/services/users.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const originalEnv = {
  ALLOWED_USERS_JSON: process.env.ALLOWED_USERS_JSON,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

const restoreEnv = () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

test.afterEach(restoreEnv);

const seedUsers = async (db) => {
  const now = new Date().toISOString();
  const owner = { user_id: "u-owner", firebase_uid: "uid-owner", email: "owner@gmail.com", name: "Owner", role: "owner", status: "active", row_version: 1, created_at: now, updated_at: now };
  const member = { user_id: "u-member", firebase_uid: "uid-member", email: "member@gmail.com", name: "Member", role: "member", status: "active", row_version: 1, created_at: now, updated_at: now };
  for (const user of [owner, member]) {
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", Object.values(user));
  }
  return { owner, member };
};

const setup = async () => {
  process.env.SESSION_SECRET = "session-registry-test-secret-at-least-32-chars";
  process.env.ALLOWED_USERS_JSON = JSON.stringify([
    { email: "owner@gmail.com", role: "administrator" },
    { email: "member@gmail.com", role: "member" },
  ]);
  const db = await createSqliteTestDatabase();
  const users = await seedUsers(db);
  return { db, ...users };
};

const issue = async (db, actor, userAgent = "Mozilla/5.0 Chrome/126.0 Windows NT 10.0") => createRegisteredSession(db, {
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name, role: actor.role },
  request: { headers: { "user-agent": userAgent } },
  requestId: `session-test-${actor.user_id}-${Date.now()}`,
  photoURL: "https://lh3.googleusercontent.com/avatar",
});

const cookieRequest = (credential) => ({ headers: { cookie: createSessionCookie(credential).split(";")[0] } });

const contextFor = (actor, sessionId, payload = {}, action = "sessions.listOwn") => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name, role: actor.role, sessionId },
  payload,
  action,
  requestId: `context-${Date.now()}`,
  allowedUsers: [
    { email: "owner@gmail.com", role: "owner" },
    { email: "member@gmail.com", role: "member" },
  ],
});

test("registry menyimpan hash verifier saja dan resolver memakai user aktif canonical; env allowlist hanya bootstrap", async () => {
  const { db, owner } = await setup();
  try {
    const issued = await issue(db, owner);
    const stored = await db.one("SELECT verifier_hash,device_label,client_family FROM user_sessions WHERE session_id=?", [issued.credential.sessionId]);
    assert.equal(stored.verifier_hash, sessionVerifierHash(issued.credential.sessionSecret));
    assert.equal(stored.verifier_hash.length, 64);
    assert.notEqual(stored.verifier_hash, issued.credential.sessionSecret);
    assert.doesNotMatch(JSON.stringify(stored), /Mozilla|Windows NT 10\.0/);
    assert.match(stored.device_label, /Chrome/);

    const resolved = await resolveRegisteredSession(db, cookieRequest(issued.credential));
    assert.equal(resolved.email, owner.email);
    assert.equal(resolved.role, "owner");
    assert.equal(resolved.sessionId, issued.credential.sessionId);

    process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: owner.email, role: "member" }]);
    const afterBootstrapConfigChange = await resolveRegisteredSession(db, cookieRequest(issued.credential));
    assert.equal(afterBootstrapConfigChange.role, "owner");

    await db.execute("UPDATE users SET status=\'inactive\',row_version=row_version+1 WHERE user_id=?", [owner.user_id]);
    assert.equal(await resolveRegisteredSession(db, cookieRequest(issued.credential)), null);
  } finally {
    db.close();
  }
});

test("logout hanya mencabut session bila verifier credential cocok", async () => {
  const { db, owner } = await setup();
  try {
    const issued = await issue(db, owner);
    const forged = { ...issued.credential, sessionSecret: "forged-session-secret" };
    assert.equal((await revokeSessionFromRequest(db, cookieRequest(forged))).revoked, false);
    assert.equal((await db.one("SELECT revoked_at FROM user_sessions WHERE session_id=?", [issued.credential.sessionId])).revoked_at, null);

    assert.equal((await revokeSessionFromRequest(db, cookieRequest(issued.credential))).revoked, true);
    assert.notEqual((await db.one("SELECT revoked_at FROM user_sessions WHERE session_id=?", [issued.credential.sessionId])).revoked_at, null);
    assert.equal(await resolveRegisteredSession(db, cookieRequest(issued.credential)), null);
  } finally {
    db.close();
  }
});

test("list dan revoke session bersifat actor-scoped sehingga IDOR antar pengguna ditolak", async () => {
  const { db, owner, member } = await setup();
  try {
    const ownerSession = await issue(db, owner);
    const memberSession = await issue(db, member, "Mozilla/5.0 Safari/605.1 iPhone");
    const ownerContext = contextFor(owner, ownerSession.credential.sessionId);
    const listed = await listOwnSessions(db, ownerContext);
    assert.deepEqual(listed.items.map((item) => item.session_id), [ownerSession.credential.sessionId]);
    assert.equal(listed.items[0].is_current, true);

    await assert.rejects(
      revokeOwnSession(db, { ...ownerContext, action: "sessions.revokeOwn", payload: { session_id: memberSession.credential.sessionId } }),
      (error) => error.code === "SESSION_NOT_FOUND" && error.status === 404,
    );
    assert.equal((await db.one("SELECT revoked_at FROM user_sessions WHERE session_id=?", [memberSession.credential.sessionId])).revoked_at, null);
  } finally {
    db.close();
  }
});

test("revoke all hanya mencabut session actor sendiri dan menandai current session", async () => {
  const { db, owner, member } = await setup();
  try {
    const first = await issue(db, owner);
    await issue(db, owner, "Mozilla/5.0 Firefox/128.0 Linux");
    const other = await issue(db, member);
    const result = await revokeAllOwnSessions(db, { ...contextFor(owner, first.credential.sessionId), action: "sessions.revokeAllOwn" });
    assert.equal(result.revokedCount, 2);
    assert.equal(result.revokedCurrent, true);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM user_sessions WHERE user_id=? AND revoked_at IS NULL", [owner.user_id])).count), 0);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM user_sessions WHERE session_id=? AND revoked_at IS NULL", [other.credential.sessionId])).count), 1);
  } finally {
    db.close();
  }
});

test("perubahan role mencabut session aktif user dan mencatat audit security", async () => {
  const { db, owner, member } = await setup();
  try {
    await issue(db, member);
    process.env.ALLOWED_USERS_JSON = JSON.stringify([
      { email: owner.email, role: "administrator" },
      { email: member.email, role: "administrator" },
    ]);
    const next = await upsertUser(db, {
      actor: owner,
      signedActor: { uid: owner.firebase_uid, email: owner.email, role: owner.role },
      action: "users.upsert",
      requestId: "role-change",
      rowVersion: member.row_version,
      payload: { email: member.email, name: member.name, role: "owner", row_version: member.row_version },
      allowedUsers: [{ email: owner.email, role: "owner" }, { email: member.email, role: "owner" }],
    });
    assert.equal(next.role, "owner");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM user_sessions WHERE user_id=? AND revoked_at IS NULL", [member.user_id])).count), 0);
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='session.revoke.role_change' AND entity_id=?", [member.user_id]));
  } finally {
    db.close();
  }
});

test("deaktivasi user mencabut session aktif dalam lifecycle yang sama dan diaudit", async () => {
  const { db, owner, member } = await setup();
  try {
    await issue(db, member);
    const next = await deactivateUser(db, {
      actor: owner,
      signedActor: { uid: owner.firebase_uid, email: owner.email, role: owner.role },
      action: "users.deactivate",
      requestId: "deactivate-user",
      rowVersion: member.row_version,
      payload: { user_id: member.user_id, row_version: member.row_version, reason: "Akses perangkat tidak lagi diperlukan" },
      allowedUsers: [{ email: owner.email, role: "owner" }, { email: member.email, role: "member" }],
    });
    assert.equal(next.status, "inactive");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM user_sessions WHERE user_id=? AND revoked_at IS NULL", [member.user_id])).count), 0);
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='session.revoke.deactivation' AND entity_id=?", [member.user_id]));
  } finally {
    db.close();
  }
});

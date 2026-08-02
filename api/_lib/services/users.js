import { appendAudit } from "./audit.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "./core.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const resolveActor = async (db, signedActor) => {
  const email = String(signedActor.email || "").trim().toLowerCase();
  let user = await db.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  if (!user) {
    const countRow = await db.one(`SELECT
      (SELECT COUNT(*) FROM users) AS users_count,
      (SELECT COUNT(*) FROM accounts) + (SELECT COUNT(*) FROM transactions) + (SELECT COUNT(*) FROM categories) AS business_count`);
    if (signedActor.role !== "owner" || Number(countRow?.users_count || 0) || Number(countRow?.business_count || 0)) {
      throw appError("IDENTITY_NOT_PROVISIONED", "Akun sudah diizinkan pada Vercel tetapi belum ditambahkan ke database oleh owner.", 403);
    }
    const timestamp = nowIso();
    user = {
      user_id: uuid(), firebase_uid: signedActor.uid, email, name: sanitizeText(signedActor.name || email, 120),
      role: "owner", status: "active", row_version: 1, created_at: timestamp, updated_at: timestamp,
    };
    await db.transaction(async (tx) => {
      await tx.execute(`INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`, Object.values(user));
      await appendAudit(tx, {
        actor: user,
        action: "bootstrap.owner",
        requestId: signedActor.requestId || `bootstrap:${user.user_id}`,
      }, { entityType: "user", entityId: user.user_id, next: publicRow(user) });
    });
  } else {
    if (user.status !== "active") throw appError("ACCOUNT_INACTIVE", "Akun dinonaktifkan.", 403);
    if (user.role !== signedActor.role) throw appError("ROLE_MISMATCH", "Role database tidak sesuai dengan allowlist Vercel.", 403);
    if (user.firebase_uid && user.firebase_uid !== signedActor.uid) throw appError("IDENTITY_CONFLICT", "Email sudah terikat ke identitas Firebase lain.", 409);
    if (!user.firebase_uid) {
      const result = await db.execute("UPDATE users SET firebase_uid = ?, row_version = row_version + 1, updated_at = ? WHERE user_id = ? AND firebase_uid IS NULL", [signedActor.uid, nowIso(), user.user_id]);
      if (result.rowsAffected !== 1) throw appError("IDENTITY_CONFLICT", "Identitas pengguna berubah saat proses login.", 409);
      user = await db.one("SELECT * FROM users WHERE user_id = ?", [user.user_id]);
    }
  }
  return publicRow(user);
};

export const listUsers = async (db, context) => {
  assertOwner(context.actor);
  const rows = await db.all("SELECT user_id,email,name,role,status,row_version,created_at,updated_at FROM users ORDER BY role DESC, email");
  return { items: rows.map((row) => ({ ...publicRow(row), is_current: row.user_id === context.actor.user_id })) };
};

export const upsertUser = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "member");
  if (!EMAIL_PATTERN.test(email)) throw appError("INVALID_EMAIL", "Email anggota tidak valid.", 400);
  if (!["owner", "member"].includes(role)) throw appError("INVALID_ROLE", "Role anggota tidak valid.", 400);
  const allowed = context.allowedUsers?.find((item) => item.email === email);
  if (!allowed || allowed.role !== role) throw appError("ALLOWLIST_MISMATCH", "Email dan role harus sama dengan ALLOWED_USERS_JSON di Vercel.", 409);
  const current = await db.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  const timestamp = nowIso();
  if (current) {
    assertVersion(current, context.rowVersion ?? payload.row_version);
    const next = { ...current, name: sanitizeText(payload.name || current.name || email, 120), role, status: "active", row_version: Number(current.row_version) + 1, updated_at: timestamp };
    const result = await db.execute("UPDATE users SET name=?,role=?,status='active',row_version=?,updated_at=? WHERE user_id=? AND row_version=?", [next.name, role, next.row_version, timestamp, current.user_id, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Data anggota berubah. Muat ulang.", 409);
    await appendAudit(db, context, { entityType: "user", entityId: current.user_id, previous: publicRow(current), next: publicRow(next) });
    return publicRow(next);
  }
  const next = { user_id: uuid(), firebase_uid: null, email, name: sanitizeText(payload.name || email, 120), role, status: "active", row_version: 1, created_at: timestamp, updated_at: timestamp };
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", Object.values(next));
  await appendAudit(db, context, { entityType: "user", entityId: next.user_id, next: publicRow(next) });
  return publicRow(next);
};

export const deactivateUser = async (db, context) => {
  assertOwner(context.actor);
  const current = await db.one("SELECT * FROM users WHERE user_id = ?", [context.payload?.user_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Anggota aktif tidak ditemukan.", 404);
  if (current.user_id === context.actor.user_id) throw appError("SELF_DEACTIVATE_DENIED", "Owner tidak dapat menonaktifkan dirinya sendiri.", 409);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  if (current.role === "owner") {
    const owners = await db.one("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND status='active'");
    if (Number(owners?.count || 0) <= 1) throw appError("LAST_OWNER", "Minimal satu owner aktif harus tersedia.", 409);
  }
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM accounts WHERE owner_user_id=? AND status='active') AS accounts,
    (SELECT COUNT(*) FROM envelope_rules WHERE owner_user_id=? AND status='active') AS envelopes,
    (SELECT COUNT(*) FROM recurring_rules WHERE owner_user_id=? AND status='active') AS recurring,
    (SELECT COUNT(*) FROM savings_goals WHERE owner_user_id=? AND status='active') AS goals`, [current.user_id, current.user_id, current.user_id, current.user_id]);
  if (Object.values(dependencies || {}).some((value) => Number(value) > 0)) throw appError("USER_HAS_ACTIVE_DATA", "Anggota masih memiliki data personal aktif. Arsipkan atau pindahkan data terlebih dahulu.", 409, dependencies);
  const next = { ...current, status: "inactive", row_version: Number(current.row_version) + 1, updated_at: nowIso() };
  await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE user_id=? AND status='active'", [next.updated_at, current.user_id]);
  await db.execute("UPDATE notification_queue SET status='dead_letter',last_attempt_at=? WHERE user_id=? AND status IN ('pending','processing','failed')", [next.updated_at, current.user_id]);
  const result = await db.execute("UPDATE users SET status='inactive',row_version=?,updated_at=? WHERE user_id=? AND row_version=?", [next.row_version, next.updated_at, current.user_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Data anggota berubah. Muat ulang.", 409);
  await appendAudit(db, context, { entityType: "user", entityId: current.user_id, previous: publicRow(current), next: publicRow(next) });
  return publicRow(next);
};

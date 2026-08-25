import { appendAudit } from "./audit.js";
import { findBootstrapUser, isValidEmail, trustedProfilePhotoUrl } from "../security.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "./core.js";
import { revokeUserSessions } from "../sessionRegistry.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const userPublicProjection = (user, { identityStatus = null } = {}) => {
  if (!user) return null;
  const { firebase_uid: _privateFirebaseUid, ...safeUser } = user;
  return publicRow(identityStatus ? { ...safeUser, identity_status: identityStatus } : safeUser);
};

const identityAuditProjection = (user, identityStatus) => ({
  user_id: user.user_id,
  email: user.email,
  role: user.role,
  status: user.status,
  identity_status: identityStatus,
  row_version: Number(user.row_version || 0),
});

const assertCanonicalActor = (user, signedActor) => {
  if (!user) throw appError("IDENTITY_NOT_PROVISIONED", "Akun Google ini belum terdaftar di Saldo Bersama. Hubungi Administrator.", 403);
  if (user.status !== "active") throw appError("ACCOUNT_INACTIVE", "Akun dinonaktifkan.", 403);
  if (user.role !== signedActor.role) throw appError("ROLE_MISMATCH", "Role session tidak sesuai dengan role pengguna aktif. Silakan login kembali.", 403);
  if (user.firebase_uid && user.firebase_uid !== signedActor.uid) throw appError("IDENTITY_CONFLICT", "Email sudah terikat ke identitas Firebase lain.", 409);
};

const bootstrapOwnerInTransaction = async (tx, signedActor, email) => {
  const existing = await tx.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  if (existing) return existing;
  if (signedActor.role !== "owner") {
    throw appError("IDENTITY_NOT_PROVISIONED", "Akun Google ini belum terdaftar di Saldo Bersama. Hubungi Administrator.", 403);
  }

  const timestamp = nowIso();
  const candidate = {
    user_id: uuid(), firebase_uid: signedActor.uid, email, name: sanitizeText(signedActor.name || email, 120),
    photo_url: trustedProfilePhotoUrl(signedActor.photoURL), role: "owner", status: "active", row_version: 1, created_at: timestamp, updated_at: timestamp,
  };
  const result = await tx.execute(`INSERT INTO users(user_id,firebase_uid,email,name,photo_url,role,status,row_version,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?
    WHERE NOT EXISTS (SELECT 1 FROM users)
      AND NOT EXISTS (SELECT 1 FROM accounts)
      AND NOT EXISTS (SELECT 1 FROM transactions)
      AND NOT EXISTS (SELECT 1 FROM categories)
    ON CONFLICT DO NOTHING`, Object.values(candidate));

  if (result.rowsAffected === 1) {
    await appendAudit(tx, {
      actor: candidate,
      action: "bootstrap.owner",
      requestId: signedActor.requestId || `bootstrap:${candidate.user_id}`,
    }, { entityType: "user", entityId: candidate.user_id, next: userPublicProjection(candidate, { identityStatus: "linked" }) });
    return candidate;
  }

  const canonical = await tx.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  if (canonical) return canonical;
  throw appError("IDENTITY_NOT_PROVISIONED", "Bootstrap Administrator hanya tersedia pada database kosong untuk akun bootstrap yang diizinkan.", 403);
};

const bootstrapOwner = async (db, signedActor, email) => db.transaction((tx) => bootstrapOwnerInTransaction(tx, signedActor, email));

const bindFirebaseIdentityInTransaction = async (tx, user, signedActor) => {
  const previous = identityAuditProjection(user, "pending");
  const result = await tx.execute(
    `UPDATE users SET firebase_uid = ?, row_version = row_version + 1, updated_at = ?
      WHERE user_id = ? AND firebase_uid IS NULL AND status = 'active' AND role = ?
        AND NOT EXISTS (SELECT 1 FROM users AS bound_identity WHERE bound_identity.firebase_uid = ? AND bound_identity.user_id <> ?)`,
    [signedActor.uid, nowIso(), user.user_id, signedActor.role, signedActor.uid, user.user_id],
  );
  const canonical = await tx.one("SELECT * FROM users WHERE user_id = ?", [user.user_id]);
  assertCanonicalActor(canonical, signedActor);
  if (result.rowsAffected !== 1 && !canonical?.firebase_uid) {
    const boundElsewhere = await tx.one("SELECT user_id FROM users WHERE firebase_uid = ? AND user_id <> ?", [signedActor.uid, user.user_id]);
    if (boundElsewhere) throw appError("IDENTITY_CONFLICT", "Identitas Firebase sudah terikat ke pengguna lain.", 409);
    throw appError("IDENTITY_CONFLICT", "Identitas pengguna berubah saat proses login.", 409);
  }
  if (result.rowsAffected === 1) {
    await appendAudit(tx, {
      actor: canonical,
      action: "identity.firebase.bind",
      requestId: signedActor.requestId || `identity-bind:${canonical.user_id}:${canonical.row_version}`,
    }, {
      entityType: "user",
      entityId: canonical.user_id,
      previous,
      next: identityAuditProjection(canonical, "linked"),
    });
  }
  return canonical;
};

const bindFirebaseIdentity = async (db, user, signedActor) => db.transaction(async (tx) => {
  const canonical = await tx.one("SELECT * FROM users WHERE user_id = ?", [user.user_id]);
  assertCanonicalActor(canonical, signedActor);
  if (canonical.firebase_uid) return canonical;
  return bindFirebaseIdentityInTransaction(tx, canonical, signedActor);
});

const bootstrapOwnerAllowed = (email) => findBootstrapUser(email)?.role === "owner";

const syncTrustedProfilePhoto = async (db, user, verifiedIdentity) => {
  const photoUrl = trustedProfilePhotoUrl(verifiedIdentity?.photoURL);
  if (String(user?.photo_url || "") === photoUrl) return user;
  const timestamp = nowIso();
  const result = await db.execute(
    "UPDATE users SET photo_url=?,row_version=row_version+1,updated_at=? WHERE user_id=? AND status='active'",
    [photoUrl, timestamp, user.user_id],
  );
  if (result.rowsAffected !== 1) throw appError("IDENTITY_CONFLICT", "Profil pengguna berubah saat proses login.", 409);
  return db.one("SELECT * FROM users WHERE user_id=?", [user.user_id]);
};

export const resolveLoginIdentity = async (db, verifiedIdentity, { requestId = "" } = {}) => {
  const email = normalizeEmail(verifiedIdentity?.email);
  if (!isValidEmail(email)) throw appError("ACCOUNT_NOT_ALLOWED", "Akun Google ini tidak memiliki email terverifikasi yang dapat digunakan.", 403);

  let user = await db.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  if (!user) {
    if (!bootstrapOwnerAllowed(email)) {
      throw appError("ACCOUNT_NOT_ALLOWED", "Akun Google ini belum mendapat akses ke Saldo Bersama.", 403);
    }
    user = await bootstrapOwner(db, { ...verifiedIdentity, email, role: "owner", requestId }, email);
  }

  const signedActor = { ...verifiedIdentity, email, role: user.role, requestId };
  assertCanonicalActor(user, signedActor);
  if (!user.firebase_uid) user = await bindFirebaseIdentity(db, user, signedActor);
  user = await syncTrustedProfilePhoto(db, user, verifiedIdentity);
  return userPublicProjection(user);
};

export const resolveActor = async (db, signedActor) => {
  const email = normalizeEmail(signedActor.email);
  let user = await db.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  if (!user) {
    if (signedActor.role !== "owner" || !bootstrapOwnerAllowed(email)) {
      throw appError("IDENTITY_NOT_PROVISIONED", "Akun Google ini belum terdaftar di Saldo Bersama. Hubungi Administrator.", 403);
    }
    user = await bootstrapOwner(db, signedActor, email);
  }
  assertCanonicalActor(user, signedActor);
  if (!user.firebase_uid) user = await bindFirebaseIdentity(db, user, signedActor);
  return userPublicProjection(user);
};

export const listUsers = async (db, context) => {
  assertOwner(context.actor);
  const rows = await db.all(`SELECT user_id,email,name,photo_url,role,status,row_version,created_at,updated_at,
    CASE WHEN firebase_uid IS NULL THEN 'pending' ELSE 'linked' END AS identity_status
    FROM users ORDER BY role DESC, email`);
  return { items: rows.map((row) => ({ ...publicRow(row), photoURL: row.photo_url || "", is_current: row.user_id === context.actor.user_id })) };
};

const assertRoleChangeSafe = async (db, context, current, nextRole) => {
  if (current.role === nextRole) return;
  if (current.user_id === context.actor.user_id) {
    throw appError("SELF_ROLE_CHANGE_DENIED", "Administrator tidak dapat mengubah role akunnya sendiri. Gunakan Administrator lain untuk perubahan role.", 409);
  }
  if (current.role === "owner" && nextRole === "member") {
    const owners = await db.one("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND status='active'");
    if (Number(owners?.count || 0) <= 1) throw appError("LAST_OWNER", "Minimal satu Administrator aktif harus tersedia.", 409);
  }
};

export const upsertUser = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const email = normalizeEmail(payload.email);
  const role = String(payload.role || "member");
  if (!isValidEmail(email)) throw appError("INVALID_EMAIL", "Email pengguna tidak valid.", 400);
  if (!["owner", "member"].includes(role)) throw appError("INVALID_ROLE", "Role pengguna tidak valid.", 400);
  const current = await db.one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]);
  const timestamp = nowIso();
  if (current) {
    if (current.status === "inactive") throw appError("USER_REACTIVATION_REQUIRED", "Pengguna nonaktif harus dipulihkan melalui tindakan reaktivasi eksplisit.", 409, { userId: current.user_id });
    assertVersion(current, context.rowVersion ?? payload.row_version);
    await assertRoleChangeSafe(db, context, current, role);
    const next = { ...current, name: sanitizeText(payload.name || current.name || email, 120), role, row_version: Number(current.row_version) + 1, updated_at: timestamp };
    const result = await db.execute("UPDATE users SET name=?,role=?,row_version=?,updated_at=? WHERE user_id=? AND row_version=? AND status='active'", [next.name, role, next.row_version, timestamp, current.user_id, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Data pengguna berubah. Muat ulang.", 409);
    if (current.role !== role) {
      const revokedCount = await revokeUserSessions(db, current.user_id, "role_change");
      await appendAudit(db, context, {
        action: "session.revoke.role_change",
        entityType: "user",
        entityId: current.user_id,
        next: { revokedCount, previousRole: current.role, nextRole: role },
      });
    }
    await appendAudit(db, context, {
      entityType: "user",
      entityId: current.user_id,
      previous: userPublicProjection(current, { identityStatus: current.firebase_uid ? "linked" : "pending" }),
      next: userPublicProjection(next, { identityStatus: next.firebase_uid ? "linked" : "pending" }),
    });
    return userPublicProjection(next, { identityStatus: next.firebase_uid ? "linked" : "pending" });
  }
  const next = { user_id: uuid(), firebase_uid: null, email, name: sanitizeText(payload.name || email, 120), photo_url: "", role, status: "active", row_version: 1, created_at: timestamp, updated_at: timestamp };
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,photo_url,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(next));
  const publicNext = userPublicProjection(next, { identityStatus: "pending" });
  await appendAudit(db, context, { entityType: "user", entityId: next.user_id, next: publicNext });
  return publicNext;
};

export const deactivateUser = async (db, context) => {
  assertOwner(context.actor);
  const reason = sanitizeText(context.payload?.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penonaktifan pengguna wajib diisi.", 400);
  const current = await db.one("SELECT * FROM users WHERE user_id = ?", [context.payload?.user_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Pengguna aktif tidak ditemukan.", 404);
  if (current.user_id === context.actor.user_id) throw appError("SELF_DEACTIVATE_DENIED", "Administrator tidak dapat menonaktifkan dirinya sendiri.", 409);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  if (current.role === "owner") {
    const owners = await db.one("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND status='active'");
    if (Number(owners?.count || 0) <= 1) throw appError("LAST_OWNER", "Minimal satu Administrator aktif harus tersedia.", 409);
  }
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM accounts WHERE owner_user_id=? AND status='active') AS accounts,
    (SELECT COUNT(*) FROM envelope_rules WHERE owner_user_id=? AND status='active') AS envelopes,
    (SELECT COUNT(*) FROM envelope_rules WHERE assignee_user_id=? AND status='active') AS assigned_envelopes,
    (SELECT COUNT(*) FROM budgets WHERE owner_user_id=? AND status='active') AS budgets,
    (SELECT COUNT(*) FROM recurring_rules WHERE owner_user_id=? AND status='active') AS recurring,
    (SELECT COUNT(*) FROM savings_goals WHERE owner_user_id=? AND status='active') AS goals`, [current.user_id, current.user_id, current.user_id, current.user_id, current.user_id, current.user_id]);
  if (Object.values(dependencies || {}).some((value) => Number(value) > 0)) throw appError("USER_HAS_ACTIVE_DATA", "Pengguna masih memiliki data personal, kebutuhan personal, atau Alokasi Dana aktif. Arsipkan atau pindahkan data terlebih dahulu.", 409, dependencies);
  const next = { ...current, status: "inactive", row_version: Number(current.row_version) + 1, updated_at: nowIso() };
  await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE user_id=? AND status='active'", [next.updated_at, current.user_id]);
  await db.execute(`UPDATE notification_deliveries SET status='dead_letter',locked_by=NULL,error_code='USER_INACTIVE',updated_at=?
    WHERE notification_id IN (SELECT notification_id FROM notification_queue WHERE user_id=?) AND status IN ('pending','processing','failed')`, [next.updated_at, current.user_id]);
  await db.execute("UPDATE notification_queue SET status='dead_letter',last_attempt_at=?,locked_by=NULL WHERE user_id=? AND status IN ('pending','processing','failed')", [next.updated_at, current.user_id]);
  const result = await db.execute("UPDATE users SET status='inactive',row_version=?,updated_at=? WHERE user_id=? AND row_version=?", [next.row_version, next.updated_at, current.user_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Data pengguna berubah. Muat ulang.", 409);
  const revokedCount = await revokeUserSessions(db, current.user_id, "user_deactivated");
  await appendAudit(db, context, {
    action: "session.revoke.deactivation",
    entityType: "user",
    entityId: current.user_id,
    next: { revokedCount, reason },
  });
  await appendAudit(db, context, {
    entityType: "user",
    entityId: current.user_id,
    previous: userPublicProjection(current, { identityStatus: current.firebase_uid ? "linked" : "pending" }),
    next: { ...userPublicProjection(next, { identityStatus: next.firebase_uid ? "linked" : "pending" }), deactivation_reason: reason },
  });
  return userPublicProjection(next, { identityStatus: next.firebase_uid ? "linked" : "pending" });
};

export const reactivateUser = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan reaktivasi pengguna wajib diisi.", 400);
  const current = await db.one("SELECT * FROM users WHERE user_id = ?", [payload.user_id]);
  if (!current || current.status !== "inactive") throw appError("NOT_FOUND", "Pengguna nonaktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const next = { ...current, status: "active", row_version: Number(current.row_version) + 1, updated_at: nowIso() };
  const result = await db.execute("UPDATE users SET status='active',row_version=?,updated_at=? WHERE user_id=? AND row_version=? AND status='inactive'", [next.row_version, next.updated_at, current.user_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Data pengguna berubah. Muat ulang.", 409);
  await appendAudit(db, context, {
    entityType: "user",
    entityId: current.user_id,
    previous: userPublicProjection(current, { identityStatus: current.firebase_uid ? "linked" : "pending" }),
    next: { ...userPublicProjection(next, { identityStatus: next.firebase_uid ? "linked" : "pending" }), reactivation_reason: reason },
  });
  return userPublicProjection(next, { identityStatus: next.firebase_uid ? "linked" : "pending" });
};

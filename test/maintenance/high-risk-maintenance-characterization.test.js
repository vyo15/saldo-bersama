import assert from "node:assert/strict";
import test from "node:test";
import { createTechnicalBackup } from "../../api/_lib/services/maintenance/backup.js";
import { applyImport, previewImport } from "../../api/_lib/services/maintenance/import.js";
import { applyRestore } from "../../api/_lib/services/maintenance/restore.js";
import { canonicalJson, nowIso } from "../../api/_lib/services/core.js";
import { digest } from "../../api/_lib/services/maintenance/shared.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "maintenance-owner",
  firebase_uid: "firebase-maintenance-owner",
  email: "maintenance-owner@example.com",
  name: "Maintenance Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};
const member = { ...owner, user_id: "maintenance-member", firebase_uid: "firebase-maintenance-member", email: "member@example.com", role: "member" };

const context = (actor, action, payload = {}, idempotencyKey = `${action}:character`) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  action,
  payload,
  requestId: `maintenance:${action}`,
  idempotencyKey,
  rowVersion: null,
  allowedUsers: [
    { email: owner.email, role: "owner" },
    { email: member.email, role: "member" },
  ],
});

const seedUser = async (db, user) => {
  const timestamp = nowIso();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, 1, timestamp, timestamp],
  );
};

const seedBackup = async (db, { backupId, fileId = "drive-file", status = "verified", checksum = "checksum" }) => {
  await db.execute(
    "INSERT INTO backup_runs(backup_id,backup_type,external_file_id,file_name,schema_version,status,checksum,created_by,created_at,verified_at,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [backupId, "manual", fileId, `${backupId}.json.gz`, 7, status, checksum, owner.user_id, nowIso(), status === "verified" ? nowIso() : null, null],
  );
};

test("backup replay menggunakan idempotency identity dan member tidak dapat membuat backup", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await assert.rejects(
      () => createTechnicalBackup(db, context(member, "backup.create"), { type: "manual" }),
      (error) => error.code === "OWNER_ONLY",
    );

    const idempotencyKey = "backup-characterization-key";
    const material = `${owner.user_id}:backup.create:manual:${idempotencyKey}`;
    const backupId = `bkp_${digest(material).slice(0, 32)}`;
    await seedBackup(db, { backupId, fileId: "existing-drive-file", checksum: "existing-checksum" });
    const result = await createTechnicalBackup(db, context(owner, "backup.create", {}, idempotencyKey), { type: "manual", audit: false });
    assert.deepEqual(result, {
      backupId,
      fileId: "existing-drive-file",
      fileName: `${backupId}.json.gz`,
      checksum: "existing-checksum",
      status: "verified",
      replayed: true,
    });
  } finally {
    db.close();
  }
});

test("import preview/apply fail closed pada ukuran, confirmation, expiry, fingerprint, dan replay", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await assert.rejects(
      () => previewImport(db, context(owner, "import.preview", { records: [] })),
      (error) => error.code === "INVALID_IMPORT",
    );
    await assert.rejects(
      () => previewImport(db, context(owner, "import.preview", { records: Array.from({ length: 51 }, () => ({})) })),
      (error) => error.code === "INVALID_IMPORT",
    );
    await assert.rejects(
      () => applyImport(db, context(owner, "import.apply", { previewToken: "missing" })),
      (error) => error.code === "CONFIRMATION_REQUIRED",
    );
    await assert.rejects(
      () => applyImport(db, context(owner, "import.apply", { confirmation: "IMPORT TRANSAKSI", previewToken: "missing" })),
      (error) => error.code === "IMPORT_PREVIEW_EXPIRED",
    );

    await db.execute(
      "INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["expired-import", owner.user_id, "[]", digest(canonicalJson([])), "{}", "pending", null, null, "2000-01-01T00:00:00.000Z", nowIso()],
    );
    await assert.rejects(
      () => applyImport(db, context(owner, "import.apply", { confirmation: "IMPORT TRANSAKSI", previewToken: "expired-import" })),
      (error) => error.code === "IMPORT_PREVIEW_EXPIRED",
    );

    await db.execute(
      "INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["changed-import", owner.user_id, "[]", "wrong-fingerprint", "{}", "pending", null, null, "2099-01-01T00:00:00.000Z", nowIso()],
    );
    await assert.rejects(
      () => applyImport(db, context(owner, "import.apply", { confirmation: "IMPORT TRANSAKSI", previewToken: "changed-import" })),
      (error) => error.code === "IMPORT_PREVIEW_CHANGED",
    );

    const replayResult = { applied: 2, transactionIds: ["t1", "t2"], safetyBackupId: "safe" };
    await db.execute(
      "INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["applied-import", owner.user_id, "[]", digest(canonicalJson([])), "{}", "applied", canonicalJson(replayResult), nowIso(), "2099-01-01T00:00:00.000Z", nowIso()],
    );
    assert.deepEqual(
      await applyImport(db, context(owner, "import.apply", { confirmation: "IMPORT TRANSAKSI", previewToken: "applied-import" })),
      replayResult,
    );
  } finally {
    db.close();
  }
});

test("restore apply mewajibkan confirmation dan dapat replay hasil preview applied tanpa side effect eksternal", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await assert.rejects(
      () => applyRestore(db, context(owner, "restore.apply", { previewToken: "missing" })),
      (error) => error.code === "CONFIRMATION_REQUIRED",
    );
    await assert.rejects(
      () => applyRestore(db, context(owner, "restore.apply", { confirmation: "RESTORE SALDO BERSAMA", acknowledged: true, reason: "Uji restore aman", previewToken: "missing" })),
      (error) => error.code === "RESTORE_PREVIEW_EXPIRED",
    );

    await seedBackup(db, { backupId: "restore-backup", fileId: "restore-drive-file" });
    const replayResult = { restored: true, backupId: "restore-backup", safetyBackupId: "safety", checksum: "checksum" };
    await db.execute(
      "INSERT INTO restore_previews(preview_id,backup_id,actor_id,checksum,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["applied-restore", "restore-backup", owner.user_id, "checksum", "{}", "applied", canonicalJson(replayResult), nowIso(), "2099-01-01T00:00:00.000Z", nowIso()],
    );
    assert.deepEqual(
      await applyRestore(db, context(owner, "restore.apply", { confirmation: "RESTORE SALDO BERSAMA", acknowledged: true, reason: "Uji replay restore", previewToken: "applied-restore" })),
      replayResult,
    );
  } finally {
    db.close();
  }
});

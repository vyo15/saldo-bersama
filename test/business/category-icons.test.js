import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const OWNER_ID = "category-icon-owner";
const OWNER_UID = "firebase-category-icon-owner";
const OWNER_EMAIL = "category-icons@example.com";
const signedActor = { uid: OWNER_UID, email: OWNER_EMAIL, name: "Category Icon Owner", role: "owner" };

const seedOwner = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [OWNER_ID, OWNER_UID, OWNER_EMAIL, "Category Icon Owner", "owner", "active", 1, now, now],
  );
};

const dispatch = (db, action, payload, rowVersion = null) => dispatchAction({
  signedActor,
  action,
  payload,
  rowVersion,
  requestId: `category-icon:${action}:${crypto.randomUUID()}`,
  idempotencyKey: `category-icon:${action}:${crypto.randomUUID()}`,
  database: db,
});

test("backend memberi default, menerima katalog icon, dan menolak key icon bebas", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);

    const defaultCategory = await dispatch(db, "categories.create", {
      name: "Belanja default icon",
      transaction_type: "expense",
      nature: "variable",
    });
    assert.equal(defaultCategory.icon, "shopping");

    const weddingCategory = await dispatch(db, "categories.create", {
      name: "Tabungan nikah",
      transaction_type: "expense",
      nature: "savings",
      icon: "wedding_ring",
    });
    assert.equal(weddingCategory.icon, "wedding_ring");

    const updated = await dispatch(db, "categories.update", {
      category_id: weddingCategory.category_id,
      name: weddingCategory.name,
      nature: weddingCategory.nature,
      icon: "savings",
      row_version: weddingCategory.row_version,
    }, weddingCategory.row_version);
    assert.equal(updated.icon, "savings");
    assert.equal(updated.row_version, weddingCategory.row_version + 1);

    await assert.rejects(
      () => dispatch(db, "categories.create", {
        name: "Icon tidak valid",
        transaction_type: "expense",
        nature: "other",
        icon: "<svg onload=alert(1)>",
      }),
      (error) => error?.code === "INVALID_CATEGORY_ICON",
    );
  } finally {
    db.close();
  }
});

test("katalog icon frontend dan whitelist backend tidak drift", async () => {
  const [frontendSource, backendSource] = await Promise.all([
    readFile(new URL("../../frontend/src/features/transactions/transactionPresentation.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/services/masterData.js", import.meta.url), "utf8"),
  ]);
  const frontendBlock = frontendSource.match(/CATEGORY_ICON_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const backendBlock = backendSource.match(/const CATEGORY_ICONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const frontendKeys = [...frontendBlock.matchAll(/key: "([a-z_]+)"/g)].map((match) => match[1]).sort();
  const backendKeys = [...backendBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();
  assert.ok(frontendKeys.length >= 20);
  assert.deepEqual(backendKeys, frontendKeys);
});

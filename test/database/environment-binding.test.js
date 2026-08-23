import assert from "node:assert/strict";
import test from "node:test";
import { bindDatabaseEnvironment } from "../../scripts/db-bind-environment.mjs";
import { assertDatabaseReady, invalidateSchemaCache, readSchemaStatus } from "../../api/_lib/db/schema.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const withEnvironment = async (values, callback) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    invalidateSchemaCache();
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    invalidateSchemaCache();
  }
};

test("database environment binding bersifat idempotent dan menolak cross-environment rebind", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const initial = await db.one("SELECT value FROM system_config WHERE key='database_environment'");
    assert.equal(initial?.value, "unbound");

    const first = await bindDatabaseEnvironment({ database: db, environment: "development" });
    assert.deepEqual(first, { environment: "development", changed: true });

    const second = await bindDatabaseEnvironment({ database: db, environment: "development" });
    assert.deepEqual(second, { environment: "development", changed: false });

    await assert.rejects(
      bindDatabaseEnvironment({ database: db, environment: "production" }),
      (error) => error?.code === "DATABASE_ENVIRONMENT_REBIND_DENIED"
        && error.current === "development"
        && error.target === "production",
    );

    const current = await db.one("SELECT value FROM system_config WHERE key='database_environment'");
    assert.equal(current?.value, "development");
  } finally {
    db.close();
  }
});

test("schema runtime fail closed bila binding database tidak cocok dengan environment runtime", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await bindDatabaseEnvironment({ database: db, environment: "development" });

    await withEnvironment({ DATABASE_ENVIRONMENT: "development", VERCEL_ENV: "development" }, async () => {
      const status = await readSchemaStatus(db, { force: true });
      assert.equal(status.ready, true);
      assert.equal(status.environmentReady, true);
      await assert.doesNotReject(assertDatabaseReady(db));
    });

    await withEnvironment({ DATABASE_ENVIRONMENT: "production", VERCEL_ENV: "production" }, async () => {
      const status = await readSchemaStatus(db, { force: true });
      assert.equal(status.ready, false);
      assert.equal(status.environmentReady, false);
      assert.equal(status.databaseEnvironment, "development");
      await assert.rejects(
        assertDatabaseReady(db),
        (error) => error?.code === "DATABASE_ENVIRONMENT_MISMATCH" && error?.status === 503,
      );
    });
  } finally {
    db.close();
  }
});

test("database environment binding menolak nilai selain development/production", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await assert.rejects(
      bindDatabaseEnvironment({ database: db, environment: "preview" }),
      (error) => error?.code === "DATABASE_ENVIRONMENT_INVALID",
    );
  } finally {
    db.close();
  }
});

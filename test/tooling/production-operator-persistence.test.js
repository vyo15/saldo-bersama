import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  persistProductionOperatorProfile,
  readProductionOperatorStore,
  restoreProductionOperatorProfile,
} from "../../scripts/production-operator-profile.mjs";

const makeRoot = async (prefix) => mkdtemp(path.join(os.tmpdir(), prefix));
const operatorSource = (url = "libsql://prod.example", token = "readonly-token") => [
  "DATABASE_ENVIRONMENT=production",
  `TURSO_DATABASE_URL=${url}`,
  `TURSO_AUTH_TOKEN=${token}`,
  "SESSION_SECRET=must-not-copy",
  "GOOGLE_OAUTH_CLIENT_SECRET=must-not-copy",
  "VAPID_PRIVATE_KEY=must-not-copy",
  "",
].join("\n");

test("per-device store hanya menyimpan tiga operator key dan tidak menyimpan runtime secret", async () => {
  const projectRoot = await makeRoot("saldo-project-");
  const home = await makeRoot("saldo-home-");
  const storePath = path.join(home, ".saldo-bersama", "production-operator.env");
  await writeFile(path.join(projectRoot, ".env.production.local"), operatorSource());

  await persistProductionOperatorProfile({ projectRoot, storePath, logger: { log() {} } });
  const source = await readFile(storePath, "utf8");
  assert.match(source, /DATABASE_ENVIRONMENT=production/);
  assert.match(source, /TURSO_DATABASE_URL=libsql:\/\/prod\.example/);
  assert.match(source, /TURSO_AUTH_TOKEN=readonly-token/);
  assert.doesNotMatch(source, /^(?:SESSION_SECRET|GOOGLE_OAUTH_CLIENT_SECRET|VITE_VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=/m);
});

test("checkout baru pada perangkat sama memulihkan operator profile otomatis", async () => {
  const firstRoot = await makeRoot("saldo-project-first-");
  const secondRoot = await makeRoot("saldo-project-second-");
  const home = await makeRoot("saldo-home-");
  const storePath = path.join(home, ".saldo-bersama", "production-operator.env");
  await writeFile(path.join(firstRoot, ".env.production.local"), operatorSource());
  await persistProductionOperatorProfile({ projectRoot: firstRoot, storePath, logger: { log() {} } });

  const result = await restoreProductionOperatorProfile({ projectRoot: secondRoot, storePath, logger: { log() {} } });
  assert.equal(result.restored, true);
  const restored = await readFile(path.join(secondRoot, ".env.production.local"), "utf8");
  assert.match(restored, /TURSO_DATABASE_URL=libsql:\/\/prod\.example/);
  assert.match(restored, /TURSO_AUTH_TOKEN=readonly-token/);
  assert.doesNotMatch(restored, /^(?:SESSION_SECRET|GOOGLE_OAUTH_CLIENT_SECRET|VITE_VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=/m);
});

test("operator profile checkout yang sudah valid tidak ditimpa store lama", async () => {
  const projectRoot = await makeRoot("saldo-project-");
  const home = await makeRoot("saldo-home-");
  const storePath = path.join(home, ".saldo-bersama", "production-operator.env");
  await writeFile(path.join(projectRoot, ".env.production.local"), operatorSource("libsql://new.example", "new-token"));
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, operatorSource("libsql://old.example", "old-token"));

  const result = await restoreProductionOperatorProfile({ projectRoot, storePath, logger: { log() {} } });
  assert.equal(result.restored, false);
  assert.equal(result.reason, "local-ready");
  const source = await readFile(path.join(projectRoot, ".env.production.local"), "utf8");
  assert.match(source, /libsql:\/\/new\.example/);
  assert.match(source, /TURSO_AUTH_TOKEN=new-token/);
});

test("placeholder Sensitive pada store ditolak fail-closed", async () => {
  const home = await makeRoot("saldo-home-");
  const storePath = path.join(home, "production-operator.env");
  await writeFile(storePath, [
    "DATABASE_ENVIRONMENT=production",
    "TURSO_DATABASE_URL=[SENSITIVE]",
    "TURSO_AUTH_TOKEN=[SENSITIVE]",
    "",
  ].join("\n"));
  await assert.rejects(
    readProductionOperatorStore({ storePath }),
    (error) => error?.code === "PRODUCTION_OPERATOR_PROFILE_INVALID",
  );
});

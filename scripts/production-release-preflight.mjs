import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkProductionOperatorEnvironment } from "./production-runtime.mjs";
import { checkProductionDatabaseProfile } from "./production-database-preflight.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const checkProductionReleasePreflight = async ({
  root = projectRoot,
  environmentChecker = checkProductionOperatorEnvironment,
  databaseChecker = checkProductionDatabaseProfile,
  logger = console,
} = {}) => {
  await environmentChecker({ cwd: root, logger });
  try {
    const schema = await databaseChecker({ root, logger: { log: () => {} } });
    logger.log?.(`Production release preflight: schema v${schema.version}; binding=${schema.databaseEnvironment}; read-only PASS`);
    return schema;
  } catch (error) {
    if (error?.code === "PRODUCTION_DATABASE_NOT_READY") {
      const schema = error.schema || {};
      throw Object.assign(new Error(
        `Production DB belum kompatibel dengan source yang akan dipush (schema v${schema.version ?? "?"}/${schema.expectedVersion ?? "?"}, binding=${schema.databaseEnvironment || "unknown"}). `
        + "Push dibatalkan agar runtime baru tidak terdeploy sebelum database siap. Buat backup Production terverifikasi, jalankan `npm run db:migrate -- production`, lalu `npm run db:integrity -- production`, dan ulangi `git push origin main`.",
      ), { code: "PRODUCTION_RELEASE_SCHEMA_NOT_READY", schema });
    }
    throw error;
  }
};

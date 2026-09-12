import { runRemoteProductionDatabaseOperation } from "./remote-production-database-operation.mjs";

export const checkProductionReleasePreflight = async ({
  remoteIntegrityRunner = runRemoteProductionDatabaseOperation,
  logger = console,
} = {}) => {
  try {
    const result = await remoteIntegrityRunner({ operation: "integrity" });
    logger.log?.("Production release preflight: staged Vercel Production integrity PASS");
    return { ready: true, operation: "integrity", remote: true, ...result };
  } catch (error) {
    if (error?.code === "PRODUCTION_RELEASE_SCHEMA_NOT_READY") throw error;
    throw Object.assign(
      new Error(
        "Production DB belum kompatibel atau integrity check remote gagal. Push dibatalkan agar runtime baru tidak terdeploy sebelum database siap. "
        + "Jalankan `npm run prod:update` untuk menyelaraskan backup, schema, integrity, dan runtime Production, lalu ulangi `git push origin main`. "
        + "Operasi memakai staged Vercel Production build sehingga secret Sensitive tetap berada di Vercel.",
      ),
      { cause: error, code: "PRODUCTION_RELEASE_SCHEMA_NOT_READY", remoteCode: error?.code || null },
    );
  }
};

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  persistProductionOperatorProfile,
  productionOperatorStorePath,
  restoreProductionOperatorProfile,
} from "./production-operator-profile.mjs";

export const recoverProductionDatabaseProfile = async ({
  root = process.cwd(),
  logger = console,
} = {}) => {
  const storePath = productionOperatorStorePath();
  const restored = await restoreProductionOperatorProfile({ projectRoot: root, storePath, logger });
  if (restored.restored || restored.reason === "local-ready") {
    if (restored.reason === "local-ready") {
      await persistProductionOperatorProfile({ projectRoot: root, storePath, logger });
      logger.log?.("Production operator profile lokal sudah valid dan disimpan untuk checkout berikutnya pada perangkat ini.");
    } else {
      logger.log?.("Production operator profile berhasil dipulihkan dari trusted per-device store.");
    }
    return { ...restored, storePath };
  }

  throw Object.assign(new Error(
    "Trusted Production operator profile perangkat belum tersedia. Isi TURSO_DATABASE_URL + TURSO_AUTH_TOKEN read-only Production di .env.production.local satu kali, lalu jalankan `npm run prod`; setelah preflight sukses profile perangkat akan disimpan otomatis."
  ), {
    code: "PRODUCTION_OPERATOR_SETUP_REQUIRED",
    storePath,
  });
};

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  recoverProductionDatabaseProfile().catch((error) => {
    console.error(error?.message || "Recovery Production operator profile gagal.");
    process.exitCode = 1;
  });
}

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cleanEnvironmentText, writeEnvironmentFileAtomic } from "./clean-local-environment.mjs";
import {
  DEFAULT_VERCEL_PROJECT,
  ensureVercelLogin,
  ensureVercelProject,
  runVercelCommand,
} from "./bootstrap-development-env.mjs";
import { buildProductionProfileTemplate } from "./production-local-profile.mjs";
import { PRODUCTION_SYNC_ENV_KEYS, parseEnvironmentText } from "./runtime-environment.mjs";

export const PRODUCTION_ENV_FILE = ".env.production.local";
const DEVELOPMENT_ENV_FILE = ".env.local";
const REQUIRED_DATABASE_KEYS = Object.freeze([
  "DATABASE_ENVIRONMENT",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
]);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const unavailable = (value) => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "[SENSITIVE]" || normalized.includes("[SENSITIVE]");
};

const serializeValue = (value) => String(value ?? "").replace(/[\r\n]+/g, "");

const assertSuccessful = (result, code, message) => {
  if (result?.code === 0) return;
  throw Object.assign(new Error(message), { code, exitCode: result?.code ?? null });
};

const readOptionalEnvironment = async (file) => {
  const source = await readFile(file, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  return { source, values: parseEnvironmentText(source) };
};

const concreteValue = (values = {}, key) => (
  Object.hasOwn(values, key) && !unavailable(values[key]) ? values[key] : null
);

const concreteRemoteValue = ({ runtime = {}, pulled = {}, key }) => {
  if (Object.hasOwn(runtime, key) && !unavailable(runtime[key])) return runtime[key];
  if (Object.hasOwn(pulled, key) && !unavailable(pulled[key])) return pulled[key];
  return null;
};

export const mergeProductionEnvironment = ({
  development = {},
  existing = {},
  pulled = {},
  runtime = {},
} = {}) => {
  // DATABASE_ENVIRONMENT adalah marker non-secret. Hasil `env pull --environment=production`
  // menjadi authority karena scope-nya eksplisit dan tidak boleh dikalahkan oleh dotenv
  // lokal yang mungkin ikut dimuat oleh `vercel env run`. Runtime hanya menjadi fallback
  // ketika pull benar-benar tidak menyediakan marker.
  const pulledMarker = concreteValue(pulled, "DATABASE_ENVIRONMENT");
  const runtimeMarker = concreteValue(runtime, "DATABASE_ENVIRONMENT");
  const authoritativeMarker = pulledMarker ?? runtimeMarker;
  if (authoritativeMarker && String(authoritativeMarker).trim().toLowerCase() !== "production") {
    throw Object.assign(
      new Error(`Vercel Production memakai DATABASE_ENVIRONMENT=${String(authoritativeMarker).trim()}; sinkronisasi ditolak.`),
      {
        code: "VERCEL_PRODUCTION_MARKER_MISMATCH",
        markerSource: pulledMarker !== null ? "production-pull" : "production-runtime",
      },
    );
  }
  if (!authoritativeMarker) {
    throw Object.assign(
      new Error("Vercel Production belum menyediakan DATABASE_ENVIRONMENT=production. Tambahkan marker ini pada Vercel Production sebelum operasi database."),
      { code: "VERCEL_PRODUCTION_MARKER_MISSING" },
    );
  }

  const runtimeMarkerMismatch = runtimeMarker !== null
    && String(runtimeMarker).trim().toLowerCase() !== "production";
  // Bila explicit Production pull sudah benar tetapi runtime capture masih membawa marker
  // lain, seluruh runtime capture dianggap terkontaminasi dan tidak boleh memasok secret.
  const trustedRuntime = pulledMarker !== null && runtimeMarkerMismatch ? {} : runtime;

  const seed = parseEnvironmentText(buildProductionProfileTemplate({ development }));
  const values = {};
  const unresolvedRemoteSensitive = [];

  for (const key of PRODUCTION_SYNC_ENV_KEYS) {
    const runtimeHas = Object.hasOwn(trustedRuntime, key);
    const pulledHas = Object.hasOwn(pulled, key);
    const remoteConcrete = concreteRemoteValue({ runtime: trustedRuntime, pulled, key });
    if (remoteConcrete !== null) {
      values[key] = remoteConcrete;
      continue;
    }

    const remoteSensitive = (runtimeHas && String(trustedRuntime[key] || "").includes("[SENSITIVE]"))
      || (pulledHas && String(pulled[key] || "").includes("[SENSITIVE]"));
    const existingValue = String(existing[key] ?? "").trim();
    if (remoteSensitive && existingValue && !unavailable(existingValue)) {
      values[key] = existingValue;
      continue;
    }
    if (remoteSensitive) unresolvedRemoteSensitive.push(key);

    if (pulledHas || runtimeHas) {
      values[key] = "";
      continue;
    }
    if (existingValue && !unavailable(existingValue)) {
      values[key] = existingValue;
      continue;
    }
    values[key] = seed[key] ?? "";
  }

  values.DATABASE_ENVIRONMENT = "production";
  const source = `${[
    "# Saldo Bersama — Vercel Production mirror untuk workstation tepercaya",
    "# Disinkronkan otomatis dari project Vercel yang terhubung. Jangan commit/zip/chat file ini.",
    "# Nilai [SENSITIVE] dari export biasa dipulihkan lewat `vercel env run` bila Vercel CLI mengizinkannya; cache lokal concrete dipertahankan bila perlu.",
    "",
    ...PRODUCTION_SYNC_ENV_KEYS.map((key) => `${key}=${serializeValue(values[key])}`),
    "",
  ].join("\n")}\n`;
  const cleaned = cleanEnvironmentText(source);
  return {
    text: cleaned.text,
    values: parseEnvironmentText(cleaned.text),
    unresolvedRemoteSensitive: [...new Set(unresolvedRemoteSensitive)].sort(),
    runtimeCaptureRejected: Boolean(pulledMarker !== null && runtimeMarkerMismatch),
  };
};

const pullProductionEnvironment = async ({ cwd, target, runner }) => {
  const result = await runner({
    cwd,
    args: ["env", "pull", target, "--environment=production", "--yes", "--no-color"],
    stdio: "inherit",
  });
  assertSuccessful(result, "VERCEL_PRODUCTION_ENV_PULL_FAILED", "Environment Production gagal ditarik dari Vercel.");
};

const captureProductionRuntimeEnvironment = async ({ cwd, target, runner }) => {
  const captureScript = path.relative(cwd, path.join(cwd, "scripts", "capture-production-environment.mjs"));
  // Jangan mewariskan key aplikasi dari shell parent. Pada workstation, proses parent
  // bisa berasal dari `npm run dev`/dotenv Development; Vercel Production harus menjadi
  // satu-satunya authority untuk key-key aplikasi saat capture runtime.
  const sanitizedProcessEnvironment = { ...process.env };
  for (const key of PRODUCTION_SYNC_ENV_KEYS) delete sanitizedProcessEnvironment[key];
  const result = await runner({
    cwd,
    args: ["env", "run", "-e", "production", "--", "node", captureScript, target],
    stdio: "inherit",
    env: sanitizedProcessEnvironment,
  });
  if (result.code !== 0) return { captured: false, exitCode: result.code };
  return { captured: true, exitCode: 0 };
};

export const ensureProductionEnvironment = async ({
  projectRoot: root = projectRoot,
  projectName = DEFAULT_VERCEL_PROJECT,
  requiredKeys = REQUIRED_DATABASE_KEYS,
  runner = runVercelCommand,
  logger = console,
} = {}) => {
  if (!root) throw new TypeError("projectRoot wajib diisi.");
  const productionPath = path.join(root, PRODUCTION_ENV_FILE);
  const developmentPath = path.join(root, DEVELOPMENT_ENV_FILE);
  const pullPath = path.join(root, `.env.production.vercel-${process.pid}-${Date.now()}.tmp`);
  const runtimePath = path.join(root, `.env.production.runtime-${process.pid}-${Date.now()}.tmp`);

  const [existingState, developmentState] = await Promise.all([
    readOptionalEnvironment(productionPath),
    readOptionalEnvironment(developmentPath),
  ]);

  try {
    logger.log?.("Memperbarui environment canonical dari Vercel Production...");
    await ensureVercelLogin({ cwd: root, runner });
    await ensureVercelProject({ cwd: root, projectName, runner, environment: "production" });

    await pullProductionEnvironment({ cwd: root, target: pullPath, runner });
    const pulledState = await readOptionalEnvironment(pullPath);

    // `env pull` dapat menyamarkan Sensitive. `env run` dicoba sebagai jalur runtime.
    // Vercel CLI juga dapat membaca `.env.local`; sembunyikan seluruh mirror dotenv lokal
    // selama capture agar Development/stale Production tidak mengalahkan scope `-e production`.
    await Promise.all([
      rm(developmentPath, { force: true }),
      rm(productionPath, { force: true }),
    ]);
    let runtimeCapture;
    let runtimeState;
    try {
      runtimeCapture = await captureProductionRuntimeEnvironment({ cwd: root, target: runtimePath, runner });
      runtimeState = runtimeCapture.captured
        ? await readOptionalEnvironment(runtimePath)
        : { source: "", values: {} };
    } finally {
      if (developmentState.source) await writeEnvironmentFileAtomic(developmentPath, developmentState.source);
      else await rm(developmentPath, { force: true }).catch(() => undefined);
      if (existingState.source) await writeEnvironmentFileAtomic(productionPath, existingState.source);
      else await rm(productionPath, { force: true }).catch(() => undefined);
    }

    const merged = mergeProductionEnvironment({
      development: developmentState.values,
      existing: existingState.values,
      pulled: pulledState.values,
      runtime: runtimeState.values,
    });
    await writeEnvironmentFileAtomic(productionPath, merged.text);

    if (merged.runtimeCaptureRejected) {
      logger.warn?.("Runtime capture Vercel Production membawa marker non-production dan diabaikan; hanya hasil explicit Production pull/cache Production yang dipercaya.");
    }

    const missing = requiredKeys.filter((key) => unavailable(merged.values[key]));
    if (missing.length) {
      const sensitiveNote = merged.unresolvedRemoteSensitive.length
        ? ` Sensitive yang belum dapat dipulihkan oleh CLI: ${merged.unresolvedRemoteSensitive.join(", ")}.`
        : "";
      throw Object.assign(
        new Error(`Vercel Production belum memberikan key wajib untuk operasi ini: ${missing.join(", ")}.${sensitiveNote}`),
        { code: "VERCEL_PRODUCTION_ENV_INCOMPLETE", missing, unresolvedRemoteSensitive: merged.unresolvedRemoteSensitive },
      );
    }

    logger.log?.(`Environment Production terbaru berhasil ditarik dari Vercel dan disimpan sebagai ${PRODUCTION_ENV_FILE}.`);
    if (!runtimeCapture.captured) {
      logger.warn?.("`vercel env run` tidak tersedia; sinkronisasi memakai hasil `vercel env pull` dan cache concrete lokal yang aman.");
    }
    return {
      source: "vercel-production",
      productionPath,
      missing: [],
      unresolvedRemoteSensitive: merged.unresolvedRemoteSensitive,
      runtimeCaptureRejected: merged.runtimeCaptureRejected,
    };
  } finally {
    await Promise.all([
      rm(pullPath, { force: true }).catch(() => undefined),
      rm(runtimePath, { force: true }).catch(() => undefined),
    ]);
    // `vercel link` dapat menyisipkan VERCEL_OIDC_TOKEN ke .env.local. Jalur
    // Production tidak boleh mengubah profile Development, jadi pulihkan snapshot
    // Development persis seperti sebelum sinkronisasi Production.
    if (developmentState.source) {
      await writeEnvironmentFileAtomic(developmentPath, developmentState.source);
    } else {
      await rm(developmentPath, { force: true }).catch(() => undefined);
    }
  }
};

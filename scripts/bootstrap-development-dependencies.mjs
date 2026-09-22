import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

export const DEVELOPMENT_DEPENDENCY_PROBES = Object.freeze([
  "vite",
  "react",
  "@fontsource-variable/manrope",
  "@firebase/app",
  "@firebase/auth",
]);

export const DEVELOPMENT_DEPENDENCY_RESOLVE_TARGETS = Object.freeze({
  "@firebase/app": "@firebase/app/package.json",
  "@firebase/auth": "@firebase/auth/package.json",
});

const FRESH_RESOLVE_SCRIPT = String.raw`
const { createRequire } = require("node:module");
const [frontendPackage, encodedProbes] = process.argv.slice(1);
const probes = JSON.parse(encodedProbes);
const requireFromFrontend = createRequire(frontendPackage);
const missing = [];
for (const [dependency, target] of probes) {
  try { requireFromFrontend.resolve(target); }
  catch { missing.push(dependency); }
}
process.stdout.write(JSON.stringify(missing));
`;

export const probeDevelopmentDependencies = (
  projectRoot,
  { runFreshNode = spawnSync } = {},
) => {
  const frontendPackage = path.join(projectRoot, "frontend", "package.json");
  const probes = DEVELOPMENT_DEPENDENCY_PROBES.map((dependency) => [
    dependency,
    DEVELOPMENT_DEPENDENCY_RESOLVE_TARGETS[dependency] || dependency,
  ]);
  const result = runFreshNode(
    process.execPath,
    ["-e", FRESH_RESOLVE_SCRIPT, frontendPackage, JSON.stringify(probes)],
    {
      cwd: projectRoot,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result?.error) throw result.error;
  if (result?.status !== 0) {
    const detail = String(result?.stderr || result?.stdout || "").trim();
    throw Object.assign(
      new Error(`Probe dependency development gagal dijalankan${detail ? `: ${detail}` : "."}`),
      { code: "DEVELOPMENT_DEPENDENCY_PROBE_FAILED", exitCode: result?.status ?? 1 },
    );
  }

  try {
    const parsed = JSON.parse(String(result.stdout || "[]"));
    return Array.isArray(parsed) ? parsed : DEVELOPMENT_DEPENDENCY_PROBES.slice();
  } catch (error) {
    throw Object.assign(
      new Error(`Hasil probe dependency development tidak valid: ${error.message}`),
      { code: "DEVELOPMENT_DEPENDENCY_PROBE_INVALID" },
    );
  }
};

export const runNpmCi = ({ cwd }) => new Promise((resolve, reject) => {
  const npmExecPath = String(process.env.npm_execpath || "").trim();
  const executable = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const args = npmExecPath ? [npmExecPath, "ci", "--include=dev"] : ["ci", "--include=dev"];
  const child = spawn(executable, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
  });

  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) return resolve();
    reject(Object.assign(
      new Error("Instalasi dependency otomatis gagal. Periksa koneksi npm dan package-lock.json, lalu jalankan kembali npm run dev."),
      { code: "DEVELOPMENT_DEPENDENCY_INSTALL_FAILED", exitCode: code },
    ));
  });
});

export const ensureDevelopmentDependencies = async ({
  projectRoot,
  probe = probeDevelopmentDependencies,
  installer = runNpmCi,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");

  const missingBefore = probe(projectRoot);
  if (!missingBefore.length) return { source: "installed", installed: false, missing: [] };

  console.log(`Dependency development belum tersedia (${missingBefore.join(", ")}). Menjalankan npm ci --include=dev otomatis...`);
  await installer({ cwd: projectRoot });

  // Probe kedua sengaja memakai proses Node baru. Di beberapa kombinasi Node/Windows,
  // resolver dapat mempertahankan cache negatif dari probe sebelum npm ci sehingga
  // package yang sebenarnya sudah terpasang terbaca masih hilang.
  const missingAfter = probe(projectRoot);
  if (missingAfter.length) {
    throw Object.assign(
      new Error(`Dependency tetap belum lengkap setelah npm ci --include=dev: ${missingAfter.join(", ")}.`),
      { code: "DEVELOPMENT_DEPENDENCY_INCOMPLETE", missing: missingAfter },
    );
  }

  return { source: "npm-ci", installed: true, missing: [] };
};

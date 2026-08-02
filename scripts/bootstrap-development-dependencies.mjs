import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

export const DEVELOPMENT_DEPENDENCY_PROBES = Object.freeze([
  "vite",
  "react",
  "@mantine/core",
]);

const unresolvedDependencies = (projectRoot) => {
  const frontendPackage = path.join(projectRoot, "frontend", "package.json");
  const requireFromFrontend = createRequire(frontendPackage);
  return DEVELOPMENT_DEPENDENCY_PROBES.filter((dependency) => {
    try {
      requireFromFrontend.resolve(dependency);
      return false;
    } catch {
      return true;
    }
  });
};

export const runNpmCi = ({ cwd }) => new Promise((resolve, reject) => {
  const npmExecPath = String(process.env.npm_execpath || "").trim();
  const executable = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const args = npmExecPath ? [npmExecPath, "ci"] : ["ci"];
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
  probe = unresolvedDependencies,
  installer = runNpmCi,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");

  const missingBefore = probe(projectRoot);
  if (!missingBefore.length) return { source: "installed", installed: false, missing: [] };

  console.log(`Dependency development belum tersedia (${missingBefore.join(", ")}). Menjalankan npm ci otomatis...`);
  await installer({ cwd: projectRoot });

  const missingAfter = probe(projectRoot);
  if (missingAfter.length) {
    throw Object.assign(
      new Error(`Dependency tetap belum lengkap setelah npm ci: ${missingAfter.join(", ")}.`),
      { code: "DEVELOPMENT_DEPENDENCY_INCOMPLETE", missing: missingAfter },
    );
  }

  return { source: "npm-ci", installed: true, missing: [] };
};

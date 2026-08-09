import { spawnSync } from "node:child_process";
import process from "node:process";

const env = {
  ...process.env,
  VITE_GOOGLE_CLIENT_ID: "ci-browser-smoke.apps.googleusercontent.com",
  VITE_FIREBASE_API_KEY: "ci-browser-smoke-public-key",
};

const npmExecPath = String(process.env.npm_execpath || "").trim();
const useNpmCli = Boolean(npmExecPath);
const executable = useNpmCli
  ? process.execPath
  : process.platform === "win32"
    ? String(process.env.ComSpec || "cmd.exe")
    : "npm";
const args = useNpmCli
  ? [npmExecPath, "run", "build", "--workspace", "saldo-bersama-frontend"]
  : process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run build --workspace saldo-bersama-frontend"]
    : ["run", "build", "--workspace", "saldo-bersama-frontend"];

const result = spawnSync(executable, args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  windowsHide: true,
  shell: false,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Build browser-test siap dengan public fixture env non-rahasia.");

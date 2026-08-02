import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const windowsPath = (base, suffix) => base ? `${base}\\${suffix}` : null;

export const chromiumCandidatesFor = ({
  platform = process.platform,
  env = process.env,
} = {}) => {
  if (platform === "win32") {
    return [
      env.CHROMIUM_BIN,
      windowsPath(env.PROGRAMFILES, "Google\\Chrome\\Application\\chrome.exe"),
      windowsPath(env["PROGRAMFILES(X86)"], "Google\\Chrome\\Application\\chrome.exe"),
      windowsPath(env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
      windowsPath(env.PROGRAMFILES, "Microsoft\\Edge\\Application\\msedge.exe"),
      windowsPath(env["PROGRAMFILES(X86)"], "Microsoft\\Edge\\Application\\msedge.exe"),
      windowsPath(env.LOCALAPPDATA, "Microsoft\\Edge\\Application\\msedge.exe"),
      windowsPath(env.PROGRAMFILES, "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      windowsPath(env["PROGRAMFILES(X86)"], "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      windowsPath(env.LOCALAPPDATA, "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      "chrome.exe",
      "msedge.exe",
      "brave.exe",
    ].filter(Boolean);
  }

  if (platform === "darwin") {
    return [
      env.CHROMIUM_BIN,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "chromium",
      "google-chrome",
      "microsoft-edge",
      "brave-browser",
    ].filter(Boolean);
  }

  return [
    env.CHROMIUM_BIN,
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "microsoft-edge",
    "microsoft-edge-stable",
    "brave-browser",
  ].filter(Boolean);
};

export const commandExists = (command, { platform = process.platform } = {}) => {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  const probe = spawnSync(
    platform === "win32" ? "where.exe" : "sh",
    platform === "win32" ? [command] : ["-lc", `command -v ${JSON.stringify(command)}`],
    { stdio: "ignore" },
  );
  return probe.status === 0;
};

export const resolveChromiumBinary = ({
  platform = process.platform,
  env = process.env,
  exists = (candidate) => commandExists(candidate, { platform }),
} = {}) => chromiumCandidatesFor({ platform, env }).find(exists) || null;

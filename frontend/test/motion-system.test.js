import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const srcRoot = new URL("../src/", import.meta.url);
const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

const collect = async (directoryUrl, extensions) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    if (entry.isDirectory()) files.push(...await collect(url, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push({ url, source: await readFile(url, "utf8") });
  }
  return files;
};

test("motion token semantic menjadi satu source of truth tanpa hard-coded timing baru", async () => {
  const [tokens, cssFiles] = await Promise.all([
    read("src/styles/tokens.css"),
    collect(srcRoot, [".css"]),
  ]);
  for (const token of [
    "--motion-instant", "--motion-fast", "--motion-standard", "--motion-emphasized",
    "--motion-control", "--motion-feedback", "--motion-dialog", "--motion-sheet",
    "--motion-celebration", "--motion-decorative", "--motion-spinner", "--motion-loading",
    "--motion-stagger-0", "--motion-stagger-1", "--motion-stagger-6",
    "--ease-standard", "--ease-enter", "--ease-exit",
  ]) assert.match(tokens, new RegExp(`${token}:`));

  const hardCoded = [];
  const timingPattern = /\b(?:animation(?:-duration|-delay)?|transition(?:-duration|-delay)?)\s*:[^;\n]*\b\d*\.?\d+(?:ms|s)\b/i;
  for (const file of cssFiles) {
    for (const [index, line] of file.source.split("\n").entries()) {
      if (!timingPattern.test(line)) continue;
      if (line.includes("animation-duration: .01ms !important") && line.includes("transition-duration: .01ms !important")) continue;
      hardCoded.push(`${file.url.pathname}:${index + 1}:${line.trim()}`);
    }
  }
  assert.deepEqual(hardCoded, []);
});

test("motion runtime menghormati reduced-motion dan tidak menghidupkan kembali layout animation", async () => {
  const [jsFiles, cssFiles, motion, hook] = await Promise.all([
    collect(srcRoot, [".js", ".jsx"]),
    collect(srcRoot, [".css"]),
    read("src/shared/motion.js"),
    read("src/hooks/useReducedMotion.js"),
  ]);
  const js = jsFiles.map((file) => file.source).join("\n");
  const css = cssFiles.map((file) => file.source).join("\n");

  assert.doesNotMatch(js, /behavior\s*:\s*["']smooth["']/);
  assert.match(motion, /preferredScrollBehavior/);
  assert.match(motion, /prefersReducedMotion\(\) \? "auto" : "smooth"/);
  assert.match(motion, /semanticMotionDurationMs/);
  assert.match(motion, /getComputedStyle\(document\.documentElement\)/);
  assert.match(hook, /APP_MEDIA\.reducedMotion/);
  assert.doesNotMatch(css, /transition\s*:[^;]*(?:width|height)/);
  assert.doesNotMatch(css, /(?:login-money-fall|fatal-error-fly|success-money-fall|success-brand-pulse)[^;]*infinite/);
});

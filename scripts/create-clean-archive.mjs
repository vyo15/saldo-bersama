import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.argv[2] || "../saldo-bersama-clean.zip");
const archivePrefix = "saldo-bersama/";

const ignoredSegments = new Set([
  ".git",
  ".vercel",
  ".sites-runtime",
  ".vinext",
  ".wrangler",
  ".vite",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".firebase",
  ".turbo",
  ".parcel-cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "blob-report",
  "temp",
  "tmp",
  "cache",
  "logs",
]);

const forbiddenFilePatterns = [
  /^\.env$/i,
  /^\.env\..+/i,
  /^\.clasp\.json$/i,
  /firebase-adminsdk-.*\.json$/i,
  /service-account.*\.json$/i,
  /credentials.*\.json$/i,
  /client[_-]secret.*\.json$/i,
  /private-key/i,
  /\.(?:pem|p12|pfx|key|crt|cer)$/i,
  /\.(?:log|tmp|temp|bak|zip|rar|7z)$/i,
];

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });

const shouldCopy = (source) => {
  const relative = path.relative(root, source);
  if (!relative) return true;

  const segments = relative.split(path.sep);
  if (segments.some((segment) => ignoredSegments.has(segment))) return false;

  const name = path.basename(source);
  if (name === ".env.example") return true;
  if (forbiddenFilePatterns.some((pattern) => pattern.test(name))) return false;

  return path.resolve(source) !== output;
};

const auditStaging = async (directory, relative = "") => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const rel = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (ignoredSegments.has(entry.name)) {
        throw new Error(`Packaging menyertakan folder terlarang: ${rel}`);
      }
      files.push(...await auditStaging(path.join(directory, entry.name), rel));
    } else if (entry.isFile()) {
      if (entry.name !== ".env.example" && forbiddenFilePatterns.some((pattern) => pattern.test(entry.name))) {
        throw new Error(`Packaging menyertakan file terlarang: ${rel}`);
      }
      files.push(rel);
    }
  }
  return files;
};

run(process.execPath, [path.join(root, "scripts", "validate-source-tree.mjs")]);

await mkdir(path.dirname(output), { recursive: true });
await rm(output, { force: true });

const staging = await mkdtemp(path.join(os.tmpdir(), "saldo-bersama-source-"));
const project = path.join(staging, "saldo-bersama");

try {
  await cp(root, project, {
    recursive: true,
    filter: shouldCopy,
  });
  const stagedFiles = await auditStaging(project);
  if (!stagedFiles.includes(".env.example")) {
    throw new Error("Packaging wajib menyertakan .env.example.");
  }

  run("git", ["init", "-q"], { cwd: project });
  run("git", ["add", "-A"], { cwd: project });
  run(
    "git",
    [
      "-c",
      "user.name=Saldo Bersama Packager",
      "-c",
      "user.email=packager@localhost",
      "commit",
      "-qm",
      "Package clean source",
    ],
    { cwd: project },
  );
  const committedFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
    cwd: project,
    encoding: "utf8",
  }).split(/\r?\n/).filter(Boolean);
  if (!committedFiles.includes(".env.example")) {
    throw new Error("Commit packaging untuk ZIP wajib menyertakan .env.example.");
  }
  run(
    "git",
    [
      "archive",
      "--format=zip",
      `--prefix=${archivePrefix}`,
      `--output=${output}`,
      "HEAD",
    ],
    { cwd: project },
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}

await access(output);
console.log(`Source ZIP bersih dibuat: ${output}`);

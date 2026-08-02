import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVE_IGNORED_SEGMENTS, FORBIDDEN_ARCHIVE_FILE_PATTERNS, MAX_SOURCE_ARCHIVE_BYTES } from "./artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.argv[2] || "../saldo-bersama-clean.zip");
const archivePrefix = "saldo-bersama/";

const ignoredSegments = ARCHIVE_IGNORED_SEGMENTS;
const forbiddenFilePatterns = FORBIDDEN_ARCHIVE_FILE_PATTERNS;

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
let stagedFileCount = 0;

try {
  await cp(root, project, {
    recursive: true,
    filter: shouldCopy,
  });
  const stagedFiles = await auditStaging(project);
  stagedFileCount = stagedFiles.length;
  if (!stagedFiles.includes(".env.example")) {
    throw new Error("Packaging wajib menyertakan .env.example.");
  }

  run("git", ["init", "-q"], { cwd: project });
  run("git", ["-c", "core.safecrlf=false", "add", "-A"], { cwd: project });
  // Vercel CLI dapat menambahkan aturan `.env*` ke .gitignore. Template aman ini
  // tetap wajib masuk commit staging tanpa melonggarkan guard untuk file env lain.
  run("git", ["-c", "core.safecrlf=false", "add", "-f", "--", ".env.example"], { cwd: project });
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
const outputStat = await stat(output);
if (outputStat.size > MAX_SOURCE_ARCHIVE_BYTES) {
  await rm(output, { force: true });
  throw new Error(`Source ZIP melebihi batas ${MAX_SOURCE_ARCHIVE_BYTES} byte: ${outputStat.size} byte.`);
}
console.log(`Source ZIP bersih dibuat: ${output}`);
console.log(`Isi canonical: ${stagedFileCount} file; ukuran ZIP: ${outputStat.size} byte.`);

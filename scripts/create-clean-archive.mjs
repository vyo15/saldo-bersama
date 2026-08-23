import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHIVE_IGNORED_SEGMENTS,
  FORBIDDEN_ARCHIVE_FILE_PATTERNS,
  LOCAL_ONLY_FILE_PATTERNS,
  MAX_SOURCE_ARCHIVE_BYTES,
  isCleanSourceArchiveFilename,
  isCanonicalSourceFile,
} from "./artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = path.resolve(root, "../saldo-bersama-clean.zip");
const archivePrefix = "saldo-bersama/";

const ignoredSegments = ARCHIVE_IGNORED_SEGMENTS;
const forbiddenFilePatterns = FORBIDDEN_ARCHIVE_FILE_PATTERNS;
const localOnlyFilePatterns = LOCAL_ONLY_FILE_PATTERNS;

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });

const pathExists = async (candidate) => access(candidate).then(() => true, () => false);

const assertRegularFile = async (candidate, label) => {
  const info = await lstat(candidate);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} harus berupa regular file, bukan symlink atau directory: ${candidate}`);
  }
  return info;
};

const shouldCopy = (source, excludedOutputs) => {
  const relative = path.relative(root, source);
  if (!relative) return true;

  const segments = relative.split(path.sep);
  if (segments.some((segment) => ignoredSegments.has(segment))) return false;

  const name = path.basename(source);
  if (name === ".env.example") return true;
  if (localOnlyFilePatterns.some((pattern) => pattern.test(name))) return false;
  if (forbiddenFilePatterns.some((pattern) => pattern.test(name))) return false;

  return !excludedOutputs.has(path.resolve(source));
};


const addStagingFiles = async (project, extraFiles = {}) => {
  for (const [relative, content] of Object.entries(extraFiles || {})) {
    const normalized = String(relative || "").replaceAll("\\", "/").replace(/^\.\//, "");
    if (!normalized || normalized.startsWith("../") || path.posix.isAbsolute(normalized) || !isCanonicalSourceFile(normalized)) {
      throw new Error(`File tambahan packaging tidak canonical: ${relative}`);
    }
    const target = path.resolve(project, ...normalized.split("/"));
    if (!target.startsWith(`${path.resolve(project)}${path.sep}`)) {
      throw new Error(`File tambahan packaging keluar dari staging project: ${relative}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, String(content ?? ""), "utf8");
  }
};

const auditStaging = async (directory, relative = "") => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const rel = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Packaging tidak boleh mengikuti symlink: ${rel}`);
    }
    if (entry.isDirectory()) {
      if (ignoredSegments.has(entry.name)) {
        throw new Error(`Packaging menyertakan folder terlarang: ${rel}`);
      }
      files.push(...await auditStaging(path.join(directory, entry.name), rel));
    } else if (entry.isFile()) {
      if (entry.name !== ".env.example" && localOnlyFilePatterns.some((pattern) => pattern.test(entry.name))) {
        throw new Error(`Packaging menyertakan file local-only: ${rel}`);
      }
      if (entry.name !== ".env.example" && forbiddenFilePatterns.some((pattern) => pattern.test(entry.name))) {
        throw new Error(`Packaging menyertakan file terlarang: ${rel}`);
      }
      if (!isCanonicalSourceFile(rel)) {
        throw new Error(`Packaging menyertakan file source non-canonical: ${rel}`);
      }
      files.push(rel);
    }
  }
  return files;
};

export const replaceArchiveAtomically = async (temporaryOutput, output) => {
  await assertRegularFile(temporaryOutput, "Archive sementara");
  const outputExists = await pathExists(output);
  let backup = null;

  if (outputExists) {
    await assertRegularFile(output, "Archive lama");
    backup = path.join(path.dirname(output), `.${path.basename(output)}.previous-${randomUUID()}`);
    await rename(output, backup);
  }

  try {
    await rename(temporaryOutput, output);
  } catch (error) {
    if (backup && await pathExists(backup)) {
      await rename(backup, output);
    }
    throw error;
  }

  if (backup) await rm(backup, { force: true });
};

export const cleanupLegacyCleanArchives = async (directory, keepOutput) => {
  const keep = path.resolve(keepOutput);
  const removed = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!isCleanSourceArchiveFilename(entry.name)) continue;

    const candidate = path.resolve(directory, entry.name);
    if (candidate === keep) continue;
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Cleanup archive menolak target non-file atau symlink: ${candidate}`);
    }

    await rm(candidate, { force: true });
    removed.push(candidate);
  }

  return removed;
};

export const createCleanArchive = async (args = [], { extraFiles = {} } = {}) => {
  const customOutput = Boolean(args[0]);
  const output = path.resolve(root, args[0] || defaultOutput);
  const outputDirectory = path.dirname(output);
  const temporaryOutput = path.join(outputDirectory, `.${path.basename(output)}.building-${randomUUID()}`);
  const excludedOutputs = new Set([output, temporaryOutput].map((candidate) => path.resolve(candidate)));

  run(process.execPath, [path.join(root, "scripts", "validate-source-tree.mjs")]);
  await mkdir(outputDirectory, { recursive: true });

  const staging = await mkdtemp(path.join(os.tmpdir(), "saldo-bersama-source-"));
  const project = path.join(staging, "saldo-bersama");
  let stagedFileCount = 0;

  try {
    await cp(root, project, {
      recursive: true,
      filter: (source) => shouldCopy(source, excludedOutputs),
    });
    await addStagingFiles(project, extraFiles);
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
        `--output=${temporaryOutput}`,
        "HEAD",
      ],
      { cwd: project },
    );
  } catch (error) {
    await rm(temporaryOutput, { force: true });
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  try {
    const temporaryStat = await assertRegularFile(temporaryOutput, "Archive sementara");
    if (temporaryStat.size > MAX_SOURCE_ARCHIVE_BYTES) {
      throw new Error(`Source ZIP melebihi batas ${MAX_SOURCE_ARCHIVE_BYTES} byte: ${temporaryStat.size} byte.`);
    }

    await replaceArchiveAtomically(temporaryOutput, output);
    const removed = customOutput ? [] : await cleanupLegacyCleanArchives(outputDirectory, output);
    const outputStat = await stat(output);

    console.log(`Source ZIP bersih dibuat: ${output}`);
    console.log(`Isi canonical: ${stagedFileCount} file; ukuran ZIP: ${outputStat.size} byte.`);
    if (removed.length > 0) {
      console.log(`Archive clean lama dihapus: ${removed.map((item) => path.basename(item)).join(", ")}.`);
    }
    return { output, stagedFileCount, size: outputStat.size, removed };
  } catch (error) {
    await rm(temporaryOutput, { force: true });
    throw error;
  }
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await createCleanArchive(process.argv.slice(2));

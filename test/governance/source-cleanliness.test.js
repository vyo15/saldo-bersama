import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const IMAGE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg", ".svg"]);
const toPosixPath = (value) => value.split(path.sep).join("/");

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return [absolute];
  }));
  return nested.flat();
};

const sourceFiles = async () => {
  const roots = ["frontend/src", "frontend/test", "api", "scripts", "test", "apps-script"];
  const groups = await Promise.all(roots.map((relative) => walk(path.join(root, relative))));
  return groups.flat().filter((file) => CODE_EXTENSIONS.has(path.extname(file)));
};

test("named export langsung memiliki consumer repository agar dead helper tidak menumpuk", async () => {
  const files = await sourceFiles();
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const corpus = sources.join("\n");
  const declaration = /\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  const orphaned = [];

  for (let index = 0; index < files.length; index += 1) {
    for (const match of sources[index].matchAll(declaration)) {
      const name = match[1];
      const occurrences = corpus.match(new RegExp(`\\b${name}\\b`, "g"))?.length || 0;
      if (occurrences === 1) orphaned.push(`${toPosixPath(path.relative(root, files[index]))}:${name}`);
    }
  }

  assert.deepEqual(orphaned, []);
});

test("asset visual aplikasi memiliki referensi source yang nyata", async () => {
  const sourceRoot = path.join(root, "frontend", "src");
  const publicRoot = path.join(root, "frontend", "public");
  const assetRoots = [path.join(sourceRoot, "assets"), path.join(publicRoot, "login", "assets")];
  const sourceCandidates = [...await walk(sourceRoot), ...await walk(publicRoot)]
    .filter((file) => !IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()) && ![".woff", ".woff2", ".ico"].includes(path.extname(file).toLowerCase()));
  const corpus = (await Promise.all(sourceCandidates.map((file) => readFile(file, "utf8").catch(() => "")))).join("\n");
  const assets = (await Promise.all(assetRoots.map((directory) => walk(directory)))).flat()
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const orphaned = assets.filter((file) => {
    const reference = file.startsWith(sourceRoot)
      ? toPosixPath(path.relative(sourceRoot, file))
      : path.basename(file);
    return !corpus.includes(reference);
  }).map((file) => toPosixPath(path.relative(root, file)));

  assert.deepEqual(orphaned, []);
});

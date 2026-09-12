import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lineCount = (text) => text.split(/\r?\n/).length;
const source = (relative) => readFile(path.join(root, relative), "utf8");

const collectRuntimeFiles = async (relative) => {
  const directory = path.join(root, relative);
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) output.push(...await collectRuntimeFiles(child));
    else if (entry.isFile() && /\.(?:js|jsx)$/.test(entry.name)) output.push(child);
  }
  return output;
};

const REVIEW_THRESHOLD = 400;
const REVIEWED_EXCEPTIONS = new Map([
  ["api/session.js", { maxLines: 420, reason: "auth/session security boundary; refactor hanya pada pekerjaan auth terpisah" }],
  ["api/_lib/services/reporting/dashboard/readModel.js", { maxLines: 460, reason: "cohesive SQL dashboard read-model; pemecahan query akan menambah coupling tanpa boundary domain baru" }],
  ["frontend/src/components/common/SelectionField.jsx", { maxLines: 455, reason: "shared accessible selection primitive; overlay, keyboard, trigger, dan panel berbagi state machine yang sama" }],
]);

test("runtime source tidak menumbuhkan god-file baru tanpa review dan growth ceiling", async () => {
  const files = [...await collectRuntimeFiles("api"), ...await collectRuntimeFiles("frontend/src")];
  for (const file of files) {
    const lines = lineCount(await source(file));
    const exception = REVIEWED_EXCEPTIONS.get(file);
    if (exception) {
      assert.ok(exception.reason.length >= 24, `${file} wajib punya alasan exception yang konkret`);
      assert.ok(lines <= exception.maxLines, `${file} melewati reviewed growth ceiling ${exception.maxLines}: ${lines}`);
      continue;
    }
    assert.ok(lines <= REVIEW_THRESHOLD, `${file} ${lines} baris melewati review threshold ${REVIEW_THRESHOLD}; ekstrak berdasarkan responsibility atau dokumentasikan exception`);
  }
});

test("facade backend hasil decomposition tetap tipis", async () => {
  const limits = new Map([
    ["api/_lib/services/finance.js", 30],
    ["api/_lib/services/investments.js", 30],
    ["api/_lib/services/reminders.js", 30],
    ["api/_lib/services/planning/budgets.js", 30],
    ["api/jobs.js", 140],
  ]);
  for (const [file, maxLines] of limits) {
    const text = await source(file);
    assert.ok(lineCount(text) <= maxLines, `${file} harus tetap orchestration/facade tipis <= ${maxLines} baris`);
  }
});

test("frontend shell hasil refactor tidak mengambil kembali responsibility yang sudah diekstrak", async () => {
  const limits = new Map([
    ["frontend/src/features/dashboard/components/DesktopFinanceDashboard.jsx", 140],
    ["frontend/src/features/accounts/components/MobileAccountsExperience.jsx", 170],
    ["frontend/src/features/categories/CategoriesPage.jsx", 330],
  ]);
  for (const [file, maxLines] of limits) {
    const text = await source(file);
    assert.ok(lineCount(text) <= maxLines, `${file} melewati shell growth ceiling ${maxLines}`);
  }
});

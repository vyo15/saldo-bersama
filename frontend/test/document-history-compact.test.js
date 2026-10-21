import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const repo = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, repo), "utf8");

const superseded = [
  "docs/FILTER_TEAL_STABLE_PATCH_2026-10-13.md",
  "docs/MOTION_UX_CHANGELOG_2026-10-13.md",
  "docs/SMART_DELETE_COVERAGE_2026-10-16.md",
  "docs/SMART_DELETE_COVERAGE_MATRIX_2026-10-16.md",
];

test("superseded dated UI reports consolidated into one historic prevention log", async () => {
  for (const path of superseded) {
    await assert.rejects(access(new URL(path, repo)), { code: "ENOENT" }, `Archive report is not active: ${path}`);
  }
  const [log, index, lifecycle, policy] = await Promise.all([
    read("docs/history/COMPLETED_UI_REGRESSION_LOG.md"), read("docs/INDEX.md"),
    read("docs/DOCUMENT_LIFECYCLE.md"), read("docs/SMART_DELETE_FLOW.md"),
  ]);
  assert.match(log, /21 Okt 2026[^\n]*Menu `···`/);
  assert.match(log, /complexity 25/);
  assert.match(index, /history\/COMPLETED_UI_REGRESSION_LOG\.md/);
  assert.match(lifecycle, /akar sebab → regression guard/);
  assert.match(policy, /Status:\*\* Canonical/);
  assert.doesNotMatch(index, /`SMART_DELETE_COVERAGE_2026-10-16\.md`/);
});

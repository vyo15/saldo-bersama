import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/features/goals");

// Architectural test: keep the substantial card UI out of the 8 KiB-gzip route chunk.
// The measured byte ceiling is enforced separately by scripts/check-build-budget.mjs.
test("Target route loads the card display as one parallel, cacheable chunk", async () => {
  const [page, cards] = await Promise.all([
    readFile(path.join(src, "GoalsPage.jsx"), "utf8"),
    readFile(path.join(src, "components/GoalCards.jsx"), "utf8"),
  ]);

  assert.doesNotMatch(page, /import\s*\{[^}]*\bGoal(?:Grid|Summary)\b[^}]*\}\s*from\s*["']\.\/components\/GoalCards\.jsx["']/s);
  assert.equal((page.match(/import\(["']\.\/components\/GoalCards\.jsx["']\)/g) || []).length, 1,
    "the shared card module should only be requested once");
  assert.match(page, /const\s+\w+\s*=\s*import\(["']\.\/components\/GoalCards\.jsx["']\)/,
    "begin loading the presentation chunk alongside the route, not after API data becomes ready");
  assert.match(page, /\blazy\s*\(\s*\(\)\s*=>[^;]*\bGoalGrid\b/s);
  assert.match(page, /\blazy\s*\(\s*\(\)\s*=>[^;]*\bGoalSummary\b/s);
  assert.match(page, /<Suspense\s+fallback=\{<NativePageSkeleton\s+kind="goals"/);
  assert.match(page, /<GoalGrid\s+items=\{items\}\s+actions=\{actions\}/);
  assert.match(page, /<GoalSummary\s+items=\{items\}/);
  assert.match(cards, /export\s*\{\s*GoalGrid,\s*GoalSummary\s*\}/);
});

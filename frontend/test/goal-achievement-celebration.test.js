import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { goalAchievementPresentation } from "../src/features/goals/goalAchievement.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");

const goal = (overrides = {}) => ({
  goal_id: "goal-1",
  name: "Liburan Bali",
  goal_type: "savings",
  current_amount: 6_700_000,
  target_amount: 10_000_000,
  ...overrides,
});

test("setoran target biasa menghasilkan postcard motivasi dari hasil server", () => {
  const presentation = goalAchievementPresentation({
    goalBefore: goal(),
    goalAfter: goal({ current_amount: 6_800_000 }),
    amount: 100_000,
  });

  assert.equal(presentation.kind, "deposit");
  assert.equal(presentation.progressPercent, 68);
  assert.equal(presentation.remainingAmount, 3_200_000);
  assert.match(presentation.title, /Liburan Bali makin dekat/);
  assert.match(presentation.art, /liburan\.webp/);
});

test("milestone memakai progress hasil server dan nominal deposit, bukan snapshot UI yang mungkin stale", () => {
  const presentation = goalAchievementPresentation({
    goalBefore: goal({ current_amount: 1_000_000 }),
    goalAfter: goal({ current_amount: 5_000_000 }),
    amount: 100_000,
  });

  assert.equal(presentation.kind, "milestone");
  assert.equal(presentation.milestone, 50);
  assert.equal(presentation.currentAmount, 5_000_000);
});

test("crossing milestone memakai milestone tertinggi yang benar tanpa mengubah nominal canonical", () => {
  const presentation = goalAchievementPresentation({
    goalBefore: goal({ current_amount: 4_900_000 }),
    goalAfter: goal({ current_amount: 7_600_000 }),
    amount: 2_700_000,
  });

  assert.equal(presentation.kind, "milestone");
  assert.equal(presentation.milestone, 75);
  assert.equal(presentation.amount, 2_700_000);
  assert.equal(presentation.currentAmount, 7_600_000);
  assert.equal(presentation.progressPercent, 76);
});

test("target 100 persen dirayakan sebagai nominal penuh tanpa menyamakan status lifecycle completed", () => {
  const presentation = goalAchievementPresentation({
    goalBefore: goal({ current_amount: 9_900_000 }),
    goalAfter: goal({ current_amount: 10_000_000, status: "active" }),
    amount: 100_000,
  });

  assert.equal(presentation.kind, "reached");
  assert.equal(presentation.progressPercent, 100);
  assert.equal(presentation.remainingAmount, 0);
  assert.match(presentation.kicker, /100% terkumpul/);
  assert.doesNotMatch(presentation.kicker, /selesai/i);
});

test("dana darurat memakai copy suportif yang tidak mengubah kondisi finansial menjadi lelucon", () => {
  const presentation = goalAchievementPresentation({
    goalBefore: goal({ name: "Dana Darurat", goal_type: "emergency_fund", current_amount: 1_000_000 }),
    goalAfter: goal({ name: "Dana Darurat", goal_type: "emergency_fund", current_amount: 1_100_000 }),
    amount: 100_000,
  });

  assert.match(presentation.title, /Dana Darurat makin kuat/);
  assert.match(presentation.message, /ruang aman keuangan/i);
  assert.doesNotMatch(`${presentation.title} ${presentation.message}`, /boros|saldo tinggal|jangan sampai putus/i);
});

test("Goal achievement tampil setelah server sukses, finite, non-blocking, dan tidak menggandakan toast proses", async () => {
  const [page, component, css, feedback] = await Promise.all([
    source("src/features/goals/GoalsPage.jsx"),
    source("src/features/goals/components/GoalAchievementPostcard.jsx"),
    source("src/features/goals/components/GoalAchievementPostcard.module.css"),
    source("src/components/feedback/FeedbackProvider.jsx"),
  ]);

  assert.match(page, /const result = await requestMoveGoal/);
  assert.match(page, /movementType === "deposit" && result\?\.goal/);
  assert.match(page, /setAchievement\(\{ goalBefore, goalAfter: result\.goal, amount \}\)/);
  assert.match(page, /GoalAchievementPostcard/);
  assert.match(component, /role="status"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /setTimeout\(\(\) => onClose\?\.\(\), duration\)/);
  assert.doesNotMatch(component, /<button|useFocusTrap/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /goal-achievement-rise/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.postcard \{[\s\S]*transform:\s*translateX\(-50%\)/);
  const localProcessActions = feedback.match(/const LOCAL_PROCESS_ACTIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.match(localProcessActions, /"goals\.move"/);
});

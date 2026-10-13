import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { finishMotionPhase } from "../src/shared/motion.js";

const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

const withBrowserTimers = (callback) => {
  const previous = globalThis.window;
  globalThis.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    matchMedia: () => ({ matches: false }),
  };
  try { return callback(); } finally { globalThis.window = previous; }
};

test("motion phase moves on only after the correct transition, once", () => withBrowserTimers(() => {
  const target = new EventTarget();
  let called = 0;
  const cancel = finishMotionPhase(target, { property: "transform", durationMs: 400, onFinish: () => { called += 1; } });
  const otherProperty = new Event("transitionend");
  Object.defineProperty(otherProperty, "propertyName", { value: "opacity" });
  target.dispatchEvent(otherProperty);
  assert.equal(called, 0);
  const rightProperty = new Event("transitionend");
  Object.defineProperty(rightProperty, "propertyName", { value: "transform" });
  target.dispatchEvent(rightProperty);
  target.dispatchEvent(rightProperty);
  assert.equal(called, 1);
  cancel();
}));

test("cancelled motion phase never triggers a stale callback", () => withBrowserTimers(() => {
  const target = new EventTarget();
  let called = 0;
  const cancel = finishMotionPhase(target, { durationMs: 400, onFinish: () => { called += 1; } });
  cancel();
  const end = new Event("transitionend");
  Object.defineProperty(end, "propertyName", { value: "transform" });
  target.dispatchEvent(end);
  assert.equal(called, 0);
}));

test("CSS and JS use semantic tokens for exit and collapse", async () => {
  const [tokens, modal, notification, row, sheet, presence] = await Promise.all([
    read("styles/tokens.css"), read("components/common/Modal.module.css"),
    read("features/notifications/NotificationsPage.module.css"), read("features/notifications/NotificationRow.jsx"),
    read("components/common/useMobileSwipeDismiss.js"), read("components/common/useModalPresence.js"),
  ]);
  for (const token of ["dialog-exit", "sheet-exit", "swipe-exit", "swipe-collapse"]) {
    assert.match(tokens, new RegExp(`--motion-${token}:`));
  }
  assert.match(modal, /mobile-sheet-out var\(--motion-sheet-exit\)/);
  assert.match(modal, /modal-dialog-out var\(--motion-dialog-exit\)/);
  assert.match(notification, /grid-template-rows var\(--motion-swipe-collapse\)/);
  assert.match(notification, /transform var\(--motion-swipe-exit\)/);
  assert.match(row, /finishMotionPhase\(rowRef.current/);
  assert.match(row, /finishMotionPhase\(itemRef.current\?\.parentElement/);
  assert.match(sheet, /finishMotionPhase\(containerRef.current/);
  assert.match(presence, /if \(prefersReducedMotion\(\)\)/);
});

test("notification swipes are inert on vertical gesture and keyboard focus is retained", async () => {
  const [row, page, modal, goal, responsive] = await Promise.all([
    read("features/notifications/NotificationRow.jsx"),
    read("features/notifications/NotificationsPage.jsx"),
    read("components/common/Modal.jsx"),
    read("features/goals/components/GoalAchievementPostcard.jsx"),
    read("styles/responsive.css"),
  ]);
  assert.match(row, /Math\.abs\(deltaY\) > DIRECTION_LOCK_PX/);
  assert.match(row, /document\.activeElement === rowRef\.current/);
  assert.match(row, /aria-keyshortcuts="Delete"/);
  assert.match(page, /dismissAnnouncement/);
  assert.match(modal, /!discardGuard\?\.dirty/);
  assert.match(modal, /useModalPresence\(open, swipeExitFinishedRef\)/);
  assert.match(goal, /presentation.kind !== "deposit"/);
  assert.match(goal, /onClick=\{onClose\}/);
  assert.doesNotMatch(responsive, /transition: left var\(--motion-feedback\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { positionActionMenu } from "../src/components/common/actionMenuPosition.js";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const rect = (top, bottom, right = 340) => ({ top, bottom, right });

// Geometry tests exercise bottom navigation avoidance, rather than snapshotting JSX.
test("menu Target near bottom navigation opens above and remains fully reachable", () => {
  const menu = positionActionMenu({ anchor: rect(451, 495), panelWidth: 232, panelHeight: 244, viewportWidth: 360, viewportHeight: 640, navigationTop: 568 });
  assert.equal(menu.placement, "above");
  assert.ok(menu.top >= 8 && menu.top + 244 <= 451 - 6);
  assert.ok(menu.left >= 8 && menu.left + menu.width <= 352);
});

test("menu at top opens below, aligned to trigger", () => {
  const menu = positionActionMenu({ anchor: rect(58, 102), panelWidth: 240, panelHeight: 166, viewportWidth: 390, viewportHeight: 844, navigationTop: 772 });
  assert.equal(menu.placement, "below");
  assert.equal(menu.top, 108);
});

test("menu near right edge / 320px screen stays horizontally visible", () => {
  const menu = positionActionMenu({ anchor: rect(250, 294, 315), panelWidth: 250, panelHeight: 180, viewportWidth: 320, viewportHeight: 568, navigationTop: 496 });
  assert.equal(menu.left, 62);
  assert.equal(menu.left + menu.width, 312);
});

test("menu with many actions uses scrollable maximum height rather than overflowing viewport", () => {
  const menu = positionActionMenu({ anchor: rect(124, 168), panelWidth: 240, panelHeight: 600, viewportWidth: 320, viewportHeight: 500, navigationTop: 428 });
  assert.equal(menu.placement, "below");
  assert.ok(menu.maxHeight < 600);
  assert.ok(menu.top + menu.maxHeight <= 428);
});

test("menu usable region ignores bottom nav when absent on desktop", () => {
  const menu = positionActionMenu({ anchor: rect(850, 894, 1120), panelWidth: 224, panelHeight: 186, viewportWidth: 1440, viewportHeight: 950 });
  assert.equal(menu.placement, "above");
  assert.ok(menu.top + 186 <= 850);
});

test("all list-card overflow actions share the fixed viewport-aware popover", async () => {
  const menu = await source("components/common/ActionOverflowMenu.jsx");
  assert.match(menu, /createPortal\(/);
  assert.match(menu, /\.mobile-navigation/);
  assert.match(menu, /positionActionMenu\(/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /event\.target/);
  for (const path of ["features/goals/components/GoalCards.jsx", "features/commitments/CommitmentsPage.jsx", "features/shopping/ShoppingPage.jsx", "features/wishlist/WishlistPage.jsx", "features/transactions/components/TransactionActions.jsx", "features/settings/MembersSettingsPage.jsx"]) {
    assert.match(await source(path), /<ActionOverflowMenu/, `${path} must use the canonical overflow`);
  }
});

test("Atur Dana shortcut to Target advertises an explicit deterministic return", async () => {
  const [links, goals] = await Promise.all([source("features/allocations/AllocationOverviewLayer.jsx"), source("features/goals/GoalsPage.jsx")]);
  assert.match(links, /to: "\/target"/);
  assert.match(links, /state=\{tone === "goal" \? \{ fromAturDana: true \} : undefined\}/);
  assert.match(goals, /location\.state\?\.fromAturDana === true \? <ContextBack to="\/perencanaan\/kantong" label="Atur Dana"/);
  assert.doesNotMatch(goals, /navigate\(-1\)/);
});

test("Wishlist archive/dialog refactor preserves outcome-unknown retry and guarded actions", async () => {
  const page = await source("features/wishlist/WishlistPage.jsx");
  assert.match(page, /const retryOnly = Boolean\(target && attempted && mutation\.outcomeUnknown\)/);
  assert.match(page, /if \(!mutation\.busy && !retryOnly\) onClose\(\)/);
  assert.match(page, /onConfirm=\{onConfirm\}/);
  assert.match(page, /changeWishlistState\(/);
  assert.match(page, /setItemVisibility\(/);
});

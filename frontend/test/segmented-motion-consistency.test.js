import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = async (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

test("Transaksi quick chips animate one teal sliding indicator with colored icons and labels", async () => {
  const [jsx, css] = await Promise.all([
    source("features/transactions/components/MobileTransactionHistory.jsx"),
    source("features/transactions/components/MobileTransactionHistory.module.css"),
  ]);
  assert.match(jsx, /data-active-type=\{filters\.type\}/);
  assert.match(jsx, /aria-pressed=\{active\}/);
  assert.match(css, /\.typeScroller::before/);
  assert.match(css, /data-active-type="expense"[^}]*translateX\(100%\)/);
  assert.match(css, /data-active-type="income"[^}]*translateX\(200%\)/);
  assert.match(css, /\.typeScroller::before\s*\{[^}]*background:\s*var\(--primary-soft\)/);
  assert.doesNotMatch(css, /\.typeScroller\[data-active-type="(?:income|expense)"\]::before\s*\{[^}]*background\s*:/);
  assert.match(css, /\.typeChipActive\[data-tone="expense"\]\s*\{\s*color:\s*var\(--negative\)/);
  assert.match(css, /\.typeChipActive\[data-tone="income"\]\s*\{\s*color:\s*var\(--positive\)/);
  assert.match(css, /\.typeScroller:not\(\[data-active-type="all"\]\):not/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.typeScroller::before/);
  assert.match(css, /@media \(min-width: 391px\) and \(max-width: 430px\)[\s\S]*\.typeChipLabelShort \{ display: inline; \}/);
});

test("Other segmented filters inherit semantics only where meaning is clear", async () => {
  const [component, sharedStyles, shopping, recurring, member] = await Promise.all([
    source("components/common/QuickSegmentedFilter.jsx"),
    source("components/common/QuickSegmentedFilter.module.css"),
    source("features/shopping/ShoppingPage.jsx"),
    source("features/recurring/RecurringSchedule.jsx"),
    source("features/settings/components/MemberActivityPanel.jsx"),
  ]);
  assert.match(component, /data-active-tone=\{options\[activeIndex\]\?\.tone \|\| "neutral"\}/);
  assert.match(sharedStyles, /\.root::before\s*\{[^}]*background:\s*var\(--primary-soft\);/);
  assert.doesNotMatch(sharedStyles, /--selection-bg|background:\s*var\(--positive-soft\);\s*--selection-ink/);
  assert.match(shopping, /value: "done"[^}]*tone: "positive"/);
  assert.match(recurring, /id === "attention" \? "warning" : "neutral"/);
  assert.match(member, /value: "income"[^}]*tone: "income"/);
  assert.match(member, /value: "expense"[^}]*tone: "expense"/);
});

test("other page filters slide teal background without changing status surfaces", async () => {
  const [notifications, notificationCss, allocation, allocationCss, wishlistCss] = await Promise.all([
    source("features/notifications/NotificationsPage.jsx"),
    source("features/notifications/NotificationsPage.module.css"),
    source("features/allocations/AllocationPlanningDetail.jsx"),
    source("features/allocations/AllocationDetail.module.css"),
    source("features/wishlist/WishlistPage.module.css"),
  ]);
  assert.match(notifications, /data-active-index=\{FILTERS\.findIndex/);
  assert.match(notificationCss, /\.filters::before\s*\{[^}]*background:\s*var\(--primary-soft\);/);
  assert.match(notificationCss, /\.filter\[data-active="true"\]\s*\{[^}]*background:\s*transparent;/);
  assert.match(notificationCss, /\.filters\[data-active-index="1"\]::before\s*\{[^}]*translateX/);
  assert.match(notificationCss, /prefers-reduced-motion:\s*reduce[\s\S]*\.filters::before/);
  assert.match(allocation, /data-active-index=\{needFilter === "all" \? 0 : needFilter === "attention" \? 1 : 2\}/);
  assert.match(allocationCss, /\.allocation-needs-filter::before\s*\{[^}]*background:\s*var\(--primary-soft\);/);
  assert.match(allocationCss, /\.allocation-needs-filter__button\.is-active\s*\{[^}]*background:\s*transparent;/);
  assert.match(allocationCss, /--needs-segment-gap:\s*3px;/);
  assert.match(allocationCss, /prefers-reduced-motion:\s*reduce[\s\S]*\.allocation-needs-filter::before/);
  assert.match(wishlistCss, /\.scopeFilters::before\{[^}]*background:var\(--primary-soft\)/);
});

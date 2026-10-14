import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("login and success artwork reuse exactly the six canonical note pigments", async () => {
  const [tokens, login, overlay] = await Promise.all([
    source("styles/tokens.css"), source("features/auth/LoginPage.module.css"),
    source("components/feedback/FinancialSuccessOverlay.module.css"),
  ]);
  for (const color of ["red", "blue", "green", "purple", "gold", "mint"]) {
    assert.match(tokens, new RegExp(`--art-note-${color}: linear-gradient\\(135deg, #[\\da-f]{6}, #[\\da-f]{6}\\);`));
    assert.match(login, new RegExp(`\\.login-money-note--${color} \\{ background: var\\(--art-note-${color}\\); \\}`));
    assert.match(overlay, new RegExp(`\\.money_${color} \\{ background: var\\(--art-note-${color}\\); \\}`));
  }
  assert.match(login, /background: var\(--art-spark-gold\)/);
  assert.match(login, /prefers-reduced-motion: reduce/);
  assert.match(overlay, /prefers-reduced-motion: reduce/);
});

test("semantic feedback stays borderless but preserves meaningful status and legible body", async () => {
  const [badge, notice] = await Promise.all([
    source("components/common/StatusBadge.module.css"), source("components/common/CompactNotice.module.css"),
  ]);
  for (const tone of ["info", "warning", "danger"]) {
    assert.match(notice, new RegExp(`\\.${tone} \\{[^}]*border-color: transparent;`));
  }
  assert.match(notice, /\.success \{[^}]*border-color: transparent;/);
  assert.match(notice, /\.body \{[^}]*color: var\(--text-soft\)/);
  assert.match(badge, /\.active \{ border-color: transparent;/);
  for (const tone of ["info", "warning", "danger", "neutral"]) {
    assert.match(badge, new RegExp(`\\.${tone} \\{ border-color: transparent;`));
  }
});

test("notification list is compact with one mobile surface rule and fully accessible actions", async () => {
  const [css, jsx, row, segmented] = await Promise.all([
    source("features/notifications/NotificationsPage.module.css"),
    source("features/notifications/NotificationsPage.jsx"),
    source("features/notifications/NotificationRow.jsx"),
    source("components/common/QuickSegmentedFilter.module.css"),
  ]);
  assert.equal((css.match(/\.group \{ margin-top: 8px; \}/g) || []).length, 1);
  assert.equal((css.match(/\.readAll \{ width:/g) || []).length, 1);
  assert.match(css, /\.list \{ overflow: hidden; border-radius: var\(--radius-surface\); background: var\(--surface\); \}/);
  assert.match(css, /\.filters::before \{[^}]*var\(--primary-soft\)/);
  assert.match(css, /\.row:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.filters::before/);
  assert.match(jsx, /data-notification-filter="true"/);
  assert.match(jsx, /aria-pressed=\{filter === item.id\}/);
  assert.match(row, /aria-keyshortcuts="Delete"/);
  assert.match(row, /onClick=\{onClick\}/);
  assert.match(segmented, /\.root::before \{[\s\S]*?z-index: 0;/);
  assert.match(segmented, /\.segment \{[\s\S]*?z-index: 1;/);
});

test("transaction review guidance follows Need relationship instead of an unavailable manual Allocation picker", async () => {
  const transactions = await source("features/transactions/TransactionsPage.jsx");
  assert.match(transactions, /Alokasi Dana mengikuti hubungan Kebutuhan tersebut/);
  assert.doesNotMatch(transactions, /Alokasi Dana tetap dapat dipilih manual/);
});

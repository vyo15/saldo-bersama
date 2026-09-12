import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDashboardBootstrap, normalizeDashboardOverview } from "../src/features/dashboard/dashboardResilience.js";

test("dashboard menormalkan payload overview parsial tanpa mengubah field finansial yang tersedia", () => {
  const normalized = normalizeDashboardOverview({
    periodKey: "2026-09",
    cashFlow: { income: 1_500_000, expense: 400_000 },
    accountBalances: null,
    alerts: { invalid: true },
    recentTransactions: undefined,
  });

  assert.equal(normalized.periodKey, "2026-09");
  assert.deepEqual(normalized.accountBalances, []);
  assert.deepEqual(normalized.alerts, []);
  assert.deepEqual(normalized.recentTransactions, []);
  assert.deepEqual(normalized.envelopes, []);
  assert.deepEqual(normalized.cashFlow, {
    income: 1_500_000,
    expense: 400_000,
    refund: 0,
    net: 1_100_000,
  });
});

test("dashboard bootstrap menormalkan koleksi transisional agar lookup tidak crash", () => {
  const normalized = normalizeDashboardBootstrap({
    user: { user_id: "u1" },
    accounts: null,
    categories: { invalid: true },
    members: undefined,
  });
  assert.deepEqual(normalized.accounts, []);
  assert.deepEqual(normalized.categories, []);
  assert.deepEqual(normalized.members, []);
  assert.equal(normalized.user.user_id, "u1");
});

test("dashboard desktop tidak dereference cashFlow tanpa guard dan memakai boundary route lokal", async () => {
  const [page, desktop] = await Promise.all([
    readFile(new URL("../src/features/dashboard/DashboardPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/dashboard/components/DesktopFinanceDashboard.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /class DashboardRenderBoundary extends Component/);
  assert.match(page, /DASHBOARD_RENDER_ERROR/);
  assert.doesNotMatch(desktop, /overview\.cashFlow\.income/);
  assert.doesNotMatch(desktop, /overview\.cashFlow\.expense/);
});


test("dashboard desktop membawa creator resolver ke model transaksi dan fallback tidak dapat crash", async () => {
  const [model, transactions] = await Promise.all([
    readFile(new URL("../src/features/dashboard/components/desktopDashboardModel.js", import.meta.url), "utf8"),
    readFile(new URL("../src/features/dashboard/components/DesktopDashboardTransactions.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(model, /const \{ accountBalances, categoryLookup, recentTransactions, expenseByCategory, transactionCreatorLabel \} = viewModel/);
  assert.match(model, /selectedTransaction,\s*transactionCreatorLabel,/);
  assert.match(transactions, /typeof transactionCreatorLabel === "function"/);
  assert.match(transactions, /: "Anggota keluarga"/);
  assert.match(transactions, /dicatat \{creatorLabel\}/);
  assert.doesNotMatch(transactions, /dicatat \{transactionCreatorLabel\(item\)\}/);
});

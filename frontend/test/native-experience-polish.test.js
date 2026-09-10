import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveUnsavedDraftClose } from "../src/hooks/useUnsavedChangesGuard.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("native skeleton memakai geometri per-domain dan bukan placeholder angka finansial", async () => {
  const [source, css] = await Promise.all([
    read("src/components/feedback/NativePageSkeleton.jsx"),
    read("src/components/feedback/NativePageSkeleton.css"),
  ]);
  for (const name of ["DashboardSkeleton", "AccountsSkeleton", "TransactionsSkeleton", "PlanningSkeleton", "GoalsSkeleton", "InvestmentsSkeleton", "ReportsSkeleton", "ReconciliationSkeleton", "SettingsSkeleton"]) {
    assert.match(source, new RegExp(`const ${name} =`));
  }
  assert.match(css, /native-skeleton__account-stage/);
  assert.match(css, /native-skeleton__planning-grid/);
  assert.match(css, /native-skeleton__chart/);
  assert.doesNotMatch(source, /Rp\s*0|Rp0/);
});

test("Batal eksplisit membuang draft langsung sedangkan dismiss tidak sengaja tetap guarded", async () => {
  assert.equal(resolveUnsavedDraftClose({ dirty: true, intent: "cancel" }), "close");
  assert.equal(resolveUnsavedDraftClose({ dirty: true, intent: "dismiss" }), "confirm");
  assert.equal(resolveUnsavedDraftClose({ dirty: false, intent: "dismiss" }), "close");
  assert.equal(resolveUnsavedDraftClose({ dirty: true, blocked: true, intent: "cancel" }), "blocked");

  const guardedForms = [
    "src/features/accounts/components/AccountEditorDialogs.jsx",
    "src/features/categories/CategoriesPage.jsx",
    "src/features/goals/components/GoalDialogs.jsx",
    "src/features/recurring/RecurringDialogs.jsx",
    "src/features/budgets/BudgetDialogLayer.jsx",
    "src/features/settings/MembersSettingsPage.jsx",
    "src/features/allocations/AllocationDialogLayer.jsx",
    "src/features/investments/InvestmentDialog.jsx",
    "src/features/investments/InvestmentSetupDialog.jsx",
  ];
  for (const file of guardedForms) {
    const source = await read(file);
    assert.match(source, /discardAndClose/, `${file} harus memiliki jalur Batal eksplisit tanpa konfirmasi kedua`);
  }
});

test("form besar memakai dirty guard canonical dalam Modal yang sama tanpa nested focus trap", async () => {
  const files = [
    "src/features/accounts/components/AccountEditorDialogs.jsx",
    "src/features/categories/CategoriesPage.jsx",
    "src/features/goals/components/GoalDialogs.jsx",
    "src/features/recurring/RecurringDialogs.jsx",
    "src/features/budgets/BudgetDialogLayer.jsx",
    "src/features/settings/MembersSettingsPage.jsx",
    "src/features/allocations/AllocationDialogLayer.jsx",
    "src/features/investments/InvestmentDialog.jsx",
    "src/features/investments/InvestmentSetupDialog.jsx",
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /useUnsavedChangesGuard/);
    assert.match(source, /discardGuard=\{guard\}/);
    assert.match(source, /discardSubject=/);
    assert.doesNotMatch(source, /UnsavedChangesPrompt/);
  }
  const modal = await read("src/components/common/Modal.jsx");
  assert.match(modal, /const discardOpen = Boolean\(discardGuard\?\.promptOpen\)/);
  assert.match(modal, /guard\.confirmDiscard/);
  assert.match(modal, /Buang perubahan yang belum disimpan\?/);
  assert.match(modal, /Kembali ke form/);
  assert.doesNotMatch(modal, /ConfirmationModal/);
});

test("network lifecycle membedakan degraded offline dan recovery tanpa mengubah HTTP error menjadi offline", async () => {
  const [transport, hook, banner] = await Promise.all([
    read("src/services/api/transport.js"),
    read("src/hooks/useNetworkStatus.js"),
    read("src/components/pwa/OfflineBanner.jsx"),
  ]);
  assert.match(transport, /publishNetworkHealth\("online"\)/);
  assert.match(transport, /navigator\.onLine === false \? "offline" : "degraded"/);
  assert.match(hook, /\["online", "degraded", "offline"\]/);
  assert.match(hook, /degraded: state\.status === "degraded"/);
  assert.match(banner, /Koneksi tidak stabil/);
});

test("install dan offline warmup menunggu engagement serta menghormati koneksi hemat data", async () => {
  const [install, prefetch, routes] = await Promise.all([
    read("src/hooks/useInstallPrompt.js"),
    read("src/hooks/useRoutePrefetch.js"),
    read("src/app/routeModules.js"),
  ]);
  assert.match(install, /MIN_SESSION_MS = 30_000/);
  assert.match(install, /MIN_INTERACTIONS = 3/);
  assert.match(install, /visitsRef\.current >= 2/);
  assert.match(install, /showPrompt = engaged && !installed/);
  assert.match(prefetch, /connection\.saveData/);
  assert.match(prefetch, /slow-2g/);
  assert.match(prefetch, /preloadOfflineWarmRoutes/);
  assert.match(routes, /OFFLINE_WARM_PATHS/);
  assert.doesNotMatch(routes, /\/api\//);
});

test("micro continuity menjaga nominal final langsung dan motion reduced-motion safe", async () => {
  const [money, components, progress] = await Promise.all([
    read("src/components/common/Money.jsx"),
    read("src/styles/components.css"),
    read("src/components/common/ProgressBar.module.css"),
  ]);
  assert.match(money, /formatRupiah\(value\)/);
  assert.match(money, /money--updated-/);
  assert.doesNotMatch(money, /requestAnimationFrame|setInterval/);
  assert.match(components, /\[data-native-enter\]/);
  assert.match(components, /@keyframes native-item-enter/);
  assert.match(components, /prefers-reduced-motion: reduce[^}]*\}\s*\[data-native-enter\]|prefers-reduced-motion: reduce\) \{ \[data-native-enter\]/s);
  assert.match(progress, /transition: inline-size var\(--motion-standard\) var\(--ease-standard\)/);
  assert.match(progress, /prefers-reduced-motion: reduce/);
});

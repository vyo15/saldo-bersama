import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveUnsavedDraftClose } from "../src/hooks/useUnsavedChangesGuard.js";
import { createModalHistoryCoordinator } from "../src/components/common/modalHistoryCoordinator.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const createHistoryHarness = () => {
  const timers = new Map();
  let timerId = 0;
  const states = [{}];
  let index = 0;
  let backCalls = 0;
  const win = {
    location: { href: "https://example.test/investasi" },
    history: {
      get state() { return states[index]; },
      pushState(state) { states.splice(index + 1); states.push(state); index += 1; },
      replaceState(state) { states[index] = state; },
      back() { backCalls += 1; if (index > 0) index -= 1; },
    },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  return {
    win,
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
    backCalls: () => backCalls,
    currentState: () => win.history.state,
  };
};


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
    "src/features/categories/CategoryDialogs.jsx",
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
    "src/features/categories/CategoryDialogs.jsx",
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

test("handoff modal menjaga overlay berikutnya dapat dibuka ulang tanpa refresh atau history race", () => {
  const harness = createHistoryHarness();
  const coordinator = createModalHistoryCoordinator(harness.win);

  coordinator.reserve("manage");
  harness.flush();
  assert.equal(harness.currentState().__saldoModalId, "manage");

  coordinator.release("manage");
  coordinator.reserve("opening-position");
  harness.flush();
  assert.equal(harness.backCalls(), 0);
  assert.equal(harness.currentState().__saldoModalId, "opening-position");
  assert.equal(coordinator.owns("opening-position"), true);

  coordinator.release("opening-position");
  harness.flush();
  assert.equal(harness.backCalls(), 1);

  coordinator.reserve("manage-again");
  harness.flush();
  assert.equal(harness.currentState().__saldoModalId, "manage-again");
  assert.equal(coordinator.owns("manage-again"), true);
});

test("Modal canonical menjadi satu-satunya pemilik history overlay dan focus lock aman saat handoff", async () => {
  const [modal, coordinator, focusTrap] = await Promise.all([
    read("src/components/common/Modal.jsx"),
    read("src/components/common/modalHistoryCoordinator.js"),
    read("src/hooks/useFocusTrap.js"),
  ]);
  assert.match(modal, /getModalHistoryCoordinator/);
  assert.doesNotMatch(modal, /window\.history\.pushState/);
  assert.match(coordinator, /replaceState/);
  assert.match(coordinator, /releaseTimer/);
  assert.match(focusTrap, /bodyClassLocks/);
  assert.match(focusTrap, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/);

  const featureFiles = [
    "src/features/investments/InvestmentOverview.jsx",
    "src/features/investments/InvestmentDialog.jsx",
    "src/features/accounts/components/AccountEditorDialogs.jsx",
    "src/features/categories/CategoriesPage.jsx",
    "src/features/goals/components/GoalDialogs.jsx",
    "src/features/recurring/RecurringDialogs.jsx",
    "src/features/budgets/BudgetDialogLayer.jsx",
    "src/features/allocations/AllocationDialogLayer.jsx",
    "src/features/settings/MembersSettingsPage.jsx",
  ];
  for (const file of featureFiles) {
    const source = await read(file);
    assert.doesNotMatch(source, /history\.(?:pushState|back)|addEventListener\(["']popstate["']/, `${file} tidak boleh memiliki lifecycle history modal sendiri`);
  }
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

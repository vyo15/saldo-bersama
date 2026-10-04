import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const source = (relativePath) => readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

const collectSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(full);
    if (![".js", ".jsx"].includes(extname(entry.name))) return [];
    return [{ path: full.replaceAll("\\", "/"), text: await readFile(full, "utf8") }];
  }));
  return nested.flat();
};

test("hierarki navigasi mobile punya parent deterministic tanpa membuat Back universal", async () => {
  const [navigation, mobileNavigation, contextBack] = await Promise.all([
    source("config/navigation.js"),
    source("components/navigation/MobileNavigation.jsx"),
    source("components/navigation/ContextBack.jsx"),
  ]);

  assert.match(navigation, /CONTEXTUAL_NAVIGATION_PARENTS[\s\S]*"\/notifikasi"[\s\S]*to: "\/"[\s\S]*label: "Beranda"/);
  assert.match(navigation, /CONTEXTUAL_NAVIGATION_PARENTS[\s\S]*"\/rekonsiliasi"[\s\S]*to: "\/rekening"[\s\S]*label: "Rekening"/);
  assert.match(navigation, /export const contextualNavigationParent/);
  assert.match(navigation, /"\/notifikasi"[\s\S]*area: "global"/);
  assert.match(navigation, /if \(current === "\/notifikasi"\) return "";/);
  assert.match(navigation, /id: "application", label: "Aplikasi", items: pickNavigation\("\/notifikasi", "\/pengaturan"\)/);
  assert.match(navigation, /current === "\/perencanaan" \|\| current\.startsWith\("\/perencanaan\/"\)/);
  assert.match(navigation, /current === "\/transaksi" \|\| current\.startsWith\("\/transaksi\/"\)/);
  assert.match(mobileNavigation, /const activeArea = mobileNavigationArea\(location\.pathname\)/);
  assert.match(mobileNavigation, /activeArea === "more"/);
  assert.match(contextBack, /FiChevronLeft/);
  assert.match(contextBack, /`Kembali ke \$\{label\}`/);
});

test("Notifikasi dan Pastikan Saldo Sesuai memakai contextual return yang aman", async () => {
  const [notifications, reconciliation, appShell] = await Promise.all([
    source("features/notifications/NotificationsPage.jsx"),
    source("features/reconciliations/ReconciliationsPage.jsx"),
    source("layouts/AppShell.jsx"),
  ]);

  assert.match(notifications, /contextualNavigationParent\(location\.pathname\)/);
  assert.match(notifications, /safeInternalNavigationTarget\(location\.state\?\.returnTo, notificationParent\.to\)/);
  assert.match(notifications, /<ContextBack[\s\S]*to=\{returnTo\}[\s\S]*label=\{returnLabel\}/);
  assert.doesNotMatch(notifications, /navigate\(-1\)/);

  assert.match(appShell, /const notificationReturnTo = location\.pathname === "\/notifikasi" \? "\/" : `\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`/);
  assert.match(appShell, /state=\{to === "\/notifikasi" \? \{ returnTo: notificationReturnTo \} : undefined\}/);

  assert.match(reconciliation, /contextualNavigationParent\("\/rekonsiliasi"\)/);
  assert.match(reconciliation, /attentionSource === "notification-center"[\s\S]*"\/notifikasi"/);
  assert.match(reconciliation, /attentionSource === "dashboard"[\s\S]*"\/"/);
  assert.match(reconciliation, /<ContextBack[\s\S]*to=\{returnTarget\.to\}[\s\S]*label=\{returnTarget\.label\}/);
  assert.match(reconciliation, /state=\{accountEntry && requestedAccountId \? \{ accountId: requestedAccountId \} : undefined\}/);
});

test("detail Alokasi masuk history URL dan Back menutup detail sebelum meninggalkan Atur Dana", async () => {
  const [workspace, routeState, detail, attention] = await Promise.all([
    source("features/allocations/AllocationsWorkspace.jsx"),
    source("features/allocations/allocationWorkspaceUiState.js"),
    source("features/allocations/AllocationPlanningDetail.jsx"),
    source("features/allocations/allocationAttentionNavigation.js"),
  ]);

  assert.match(routeState, /new URLSearchParams\(location\.search\)\.get\("allocation"\)/);
  assert.match(routeState, /params\.set\("allocation", String\(ruleId\)\)/);
  assert.match(routeState, /params\.delete\("allocation"\)/);
  assert.match(routeState, /const search = params\.toString\(\);[\s\S]*navigate\(\{ pathname: location\.pathname, search: search \? `\?\$\{search\}` : "", hash: location\.hash \}, \{ replace, state: null \}\)/);
  assert.match(workspace, /setDetailRuleId\("", \{ replace: true \}\)/);
  assert.match(detail, /<ContextBack[\s\S]*onClick=\{onBack\}[\s\S]*label="Alokasi Dana"/);
  assert.match(attention, /consumeAttention\(\);[\s\S]*applyAttentionDetail\(\{/);
});

test("overlay memakai Modal canonical: root ditutup ×, subview kembali ←, system Back dikoordinasikan satu tempat", async () => {
  const [modal, memberActivity, reconciliationResolution] = await Promise.all([
    source("components/common/Modal.jsx"),
    source("features/settings/components/MemberActivityPanel.jsx"),
    source("features/reconciliations/components/ReconciliationResolution.jsx"),
  ]);

  assert.match(modal, /CloseIcon = FiX/);
  assert.match(modal, /subview \? FiArrowLeft : CloseIcon/);
  assert.match(modal, /window\.history\.back\(\)/);
  assert.match(memberActivity, /import Modal from/);
  assert.match(memberActivity, /<Modal[\s\S]*title="Aktivitas anggota"/);
  assert.doesNotMatch(memberActivity, /createPortal|useFocusTrap|popstate/);
  assert.match(reconciliationResolution, /import Modal from/);
  assert.match(reconciliationResolution, /<Modal[\s\S]*title=\{props\.result\.matched \? "Saldo sudah sesuai" : "Ada selisih saldo"\}/);
  assert.doesNotMatch(reconciliationResolution, /createPortal|useFocusTrap|popstate/);
});

test("scroll restoration membedakan parent active-state dan posisi tab utama", async () => {
  const [navigation, restoration] = await Promise.all([
    source("config/navigation.js"),
    source("hooks/useMobileTabScrollRestoration.js"),
  ]);

  assert.match(navigation, /if \(current === "\/"\) return "\/";/);
  assert.match(navigation, /if \(current === "\/perencanaan" \|\| current\.startsWith\("\/perencanaan\/"\)\) return "\/perencanaan";/);
  assert.match(navigation, /if \(current === "\/transaksi" \|\| current\.startsWith\("\/transaksi\/"\)\) return "\/transaksi";/);
  assert.doesNotMatch(navigation.match(/export const mobilePrimaryScrollKey[\s\S]*?\n\};/)?.[0] || "", /notifikasi/);
  assert.match(restoration, /const previousPrimaryKey = mobilePrimaryScrollKey\(previousLocation\.pathname\)/);
  assert.match(restoration, /primaryTabScrollPositions\.set\(previousPrimaryKey, previousTop\)/);
  assert.match(restoration, /navigationType === "POP"/);
});

test("halaman biasa tidak memakai history Back generik di luar coordinator Modal", async () => {
  const files = await collectSourceFiles(sourceRoot);
  const navigateBack = files.filter((file) => /navigate\(\s*-1\s*\)/.test(file.text));
  assert.deepEqual(navigateBack.map((file) => file.path), []);

  const rawHistoryBack = files.filter((file) => /window\.history\.back\(\)/.test(file.text));
  assert.equal(rawHistoryBack.length, 1);
  assert.match(rawHistoryBack[0].path, /components\/common\/Modal\.jsx$/);
});

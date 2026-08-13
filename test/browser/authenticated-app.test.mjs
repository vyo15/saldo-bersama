import assert from "node:assert/strict";
import { test } from "node:test";
import { startBrowserAppServer, startChromium, openBrowserPage, setViewport, waitForAppRoute } from "./helpers/app-runtime.mjs";
import { waitFor } from "./helpers/cdp.mjs";
import { createAuthenticatedGatewayResponses, memberSession, ownerSession } from "./helpers/authenticated-fixture.mjs";

const routeCases = Object.freeze([
  ["/anggaran", "Anggaran"],
  ["/alokasi", "Alokasi dana"],
  ["/tagihan", "Jadwal rutin"],
  ["/target", "Target"],
  ["/laporan", "Laporan"],
  ["/rekening", "Rekening"],
  ["/rekonsiliasi", "Cocokkan Saldo"],
  ["/kategori", "Kategori transaksi"],
  ["/pengaturan", "Pengaturan"],
]);

const secondaryRoutes = new Set(["/anggaran", "/alokasi", "/tagihan", "/target", "/rekening", "/rekonsiliasi", "/kategori", "/pengaturan"]);

const mobileRouteReadySelectors = Object.freeze({
  "/rekening": '[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]',
});

const authenticatedFixturePeriod = "2026-08";

const visibleExpression = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
})()`;

const waitForElementMotionToSettle = (page, selector, description) => waitFor(
  () => page.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    return element.getAnimations().every((animation) => animation.playState !== "running" && animation.playState !== "pending");
  })()`),
  { description: `${description} selesai dianimasikan` },
);

const readPageState = (page) => page.evaluate(`(() => {
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  return {
    pathname: location.pathname,
    heading: document.querySelector("main h1")?.textContent?.replace(/\\s+/g, " ").trim() || "",
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    error: [...document.querySelectorAll("[role='alert']")].map((element) => element.textContent || "").find((text) => /gagal|error|tidak tersedia/i.test(text)) || "",
    mobileNavigationVisible: visible(document.querySelector(".mobile-navigation")),
    mobileMoreVisible: visible(document.querySelector(".mobile-navigation__more")),
    mobileMoreActive: document.querySelector(".mobile-navigation__more")?.classList.contains("active") || false,
    mobileMoreCurrent: document.querySelector(".mobile-navigation__more")?.getAttribute("aria-current") || "",
    desktopLogoutVisible: visible(document.querySelector(".desktop-logout-button")),
  };
})()`);

const navigateAndAssert = async (page, origin, pathname, expectedHeading, { mobile = true, readySelector = null } = {}) => {
  page.clearDiagnostics?.();
  await page.send("Page.navigate", { url: `${origin}${pathname}` });
  const capabilitySelector = readySelector || (mobile ? mobileRouteReadySelectors[pathname] || null : null);
  await waitForAppRoute(page, pathname, { heading: expectedHeading, readySelector: capabilitySelector });
  const state = await readPageState(page);
  assert.equal(state.pathname, pathname);
  assert.equal(state.heading, expectedHeading, `Heading route ${pathname} harus konsisten.`);
  assert.ok(state.overflow <= 1, `Route ${pathname} tidak boleh overflow horizontal (${state.overflow}px).`);
  assert.equal(state.error, "", `Route ${pathname} tidak boleh menampilkan error fixture: ${state.error}`);
  if (mobile) {
    assert.equal(state.mobileNavigationVisible, true, `Navigasi mobile harus terlihat pada ${pathname}.`);
    if (secondaryRoutes.has(pathname)) {
      assert.equal(state.mobileMoreActive, true, `Lainnya harus aktif pada route sekunder ${pathname}.`);
      assert.equal(state.mobileMoreCurrent, "page", `Lainnya harus membawa aria-current pada ${pathname}.`);
    }
  }
};

const assertAuthenticatedRoutePreflight = async (page, origin) => {
  await navigateAndAssert(page, origin, "/transaksi", "Transaksi", { mobile: true });
  const period = await page.evaluate(`document.querySelector('input[aria-label="Periode transaksi"]')?.value || ""`);
  assert.equal(period, authenticatedFixturePeriod, "Route Transaksi langsung harus memiliki periode fixture yang valid.");
  await page.evaluate(`document.querySelector('button[aria-label^="Buka filter lainnya"]')?.click()`);
  await waitFor(() => page.evaluate(`Boolean(document.querySelector('[role="dialog"] select[aria-label="Filter rekening"]'))`), { description: "filter lanjutan transaksi terbuka" });
  const transactionState = await page.evaluate(`({
    account: document.querySelector('[role="dialog"] select[aria-label="Filter rekening"]')?.value || "",
    creator: document.querySelector('[role="dialog"] select[aria-label="Filter pencatat"]')?.value || "",
  })`);
  assert.equal(transactionState.account, "all", "Route Transaksi langsung tanpa state harus aman dan tidak memaksakan rekening.");
  assert.equal(transactionState.creator, "all", "Route Transaksi langsung tanpa state harus aman dan tidak memaksakan pencatat.");
  await page.evaluate(`document.querySelector('[role="dialog"] button[aria-label="Tutup dialog"]')?.click()`);
  await waitFor(() => page.evaluate(`!document.querySelector('[role="dialog"]')`), { description: "filter lanjutan transaksi ditutup" });
  await navigateAndAssert(page, origin, "/", "Ringkasan Keuangan", { mobile: true });
};

await test("authenticated owner: seluruh route, dashboard capability, filter, detail, dan privacy tersedia pada mobile serta desktop", { timeout: 90_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    appServer = await startBrowserAppServer({
      session: ownerSession,
      gatewayResponses: createAuthenticatedGatewayResponses(ownerSession),
    });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/`, { width: 390, height: 844 });
    await waitForAppRoute(page, "/", { heading: "Ringkasan Keuangan" });
    await assertAuthenticatedRoutePreflight(page, appServer.origin);

    const dashboard = await page.evaluate(`(() => {
      const text = document.body.textContent || "";
      const visible = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      return {
        heading: document.querySelector("main h1")?.textContent?.trim() || "",
        dailySafeSpend: text.includes("Batas aman per hari"),
        unallocated: text.includes("Dana belum dialokasikan"),
        privacy: visible(".mobile-finance-hero button[aria-label*='nominal']"),
        filter: visible(".mobile-dashboard-filter-button"),
        insights: Boolean(document.querySelector(".mobile-finance-insights")),
        transaction: visible(".mobile-transaction-item"),
        attentionTrigger: visible(".mobile-attention-trigger"),
        attentionHeight: document.querySelector(".mobile-attention-trigger")?.getBoundingClientRect().height || 0,
      };
    })()`);
    assert.equal(dashboard.heading, "Ringkasan Keuangan");
    assert.equal(dashboard.dailySafeSpend, true);
    assert.equal(dashboard.unallocated, true);
    assert.equal(dashboard.privacy, true);
    assert.equal(dashboard.filter, true);
    assert.equal(dashboard.insights, true);
    assert.equal(dashboard.transaction, true);
    assert.equal(dashboard.attentionTrigger, true, "Dashboard mobile harus mengekspos ringkasan Perlu perhatian.");
    assert.ok(dashboard.attentionHeight <= 82, `Ringkasan Perlu perhatian harus compact, tinggi aktual ${dashboard.attentionHeight}px.`);
    await page.evaluate("document.querySelector('.mobile-attention-trigger')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Perlu perhatian'"),
      { description: "bottom sheet Perlu perhatian" },
    );
    const attentionSheet = await page.evaluate(`(() => ({
      itemCount: document.querySelectorAll('.mobile-attention-item').length,
      actions: [...document.querySelectorAll('.mobile-attention-action')].map((item) => item.textContent.trim()),
      hasInstruction: (document.querySelector('[role=dialog]')?.textContent || '').includes('Yang perlu dilakukan'),
    }))()`);
    assert.ok(attentionSheet.itemCount >= 4, "Bottom sheet harus menampilkan seluruh peringatan yang dapat ditindaklanjuti.");
    assert.equal(attentionSheet.hasInstruction, true, "Setiap peringatan harus menjelaskan tindakan berikutnya.");
    assert.ok(attentionSheet.actions.includes("Pilih alokasi"));
    assert.ok(attentionSheet.actions.includes("Cek saldo sekarang"));
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "bottom sheet perhatian ditutup" });
    const mobileScrollState = await page.evaluate(`(() => {
      const htmlStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      return {
        scrollbarWidth: htmlStyle.scrollbarWidth,
        htmlOverflowY: htmlStyle.overflowY,
        bodyOverflowY: bodyStyle.overflowY,
      };
    })()`);
    assert.equal(mobileScrollState.scrollbarWidth, "none", "Scrollbar mobile harus disembunyikan tanpa mengunci dokumen.");
    assert.notEqual(mobileScrollState.htmlOverflowY, "hidden", "Scroll vertikal html tidak boleh dikunci.");
    assert.notEqual(mobileScrollState.bodyOverflowY, "hidden", "Scroll vertikal body tidak boleh dikunci.");

    await page.evaluate("document.querySelector('.mobile-dashboard-filter-button').click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Filter transaksi dashboard'"),
      { description: "dialog filter dashboard mobile" },
    );
    assert.equal(await page.evaluate("Boolean(document.querySelector('[role=dialog] form'))"), true);
    const dashboardFilterOverflow = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const body = dialog?.querySelector('.modal__body');
      return {
        dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 999,
        body: body ? body.scrollWidth - body.clientWidth : 999,
        overflowX: body ? getComputedStyle(body).overflowX : '',
      };
    })()`);
    assert.ok(dashboardFilterOverflow.dialog <= 1 && dashboardFilterOverflow.body <= 1, `Dialog filter tidak boleh memiliki overflow horizontal: ${JSON.stringify(dashboardFilterOverflow)}`);
    assert.equal(dashboardFilterOverflow.overflowX, "hidden", "Body modal harus menutup overflow horizontal tanpa mengunci scroll vertikal.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "dialog filter ditutup" });

    await page.evaluate("document.querySelector('.mobile-transaction-item').click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Detail transaksi'"),
      { description: "dialog detail transaksi mobile" },
    );
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('txn-expense-1') || false"), true);
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "dialog detail ditutup" });

    for (const [pathname, heading] of routeCases) {
      await navigateAndAssert(page, appServer.origin, pathname, heading, { mobile: true });
    }

    await page.evaluate("document.querySelector('.mobile-navigation__more')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Menu lainnya'"),
      { description: "menu lainnya mobile" },
    );
    const mobileMenuGroups = await page.evaluate("[...document.querySelectorAll('.mobile-menu-section h3')].map((item) => item.textContent.trim())");
    assert.deepEqual(mobileMenuGroups, ["Perencanaan", "Data keuangan", "Kontrol saldo", "Aplikasi"]);
    const mobileMenuState = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const text = dialog?.textContent || '';
      return {
        themeDuplicate: Boolean(dialog?.querySelector('.mobile-menu-theme')) || /Dark mode|Light mode/i.test(text),
        quickAddDuplicate: [...(dialog?.querySelectorAll('button') || [])].some((button) => button.textContent.trim() === 'Tambah transaksi'),
        reconciliationRoute: Boolean(dialog?.querySelector('a[href="/rekonsiliasi"]')),
        logoutInFooter: Boolean(dialog?.querySelector('.mobile-menu-footer button')),
      };
    })()`);
    assert.equal(mobileMenuState.themeDuplicate, false, "Menu lainnya tidak boleh menduplikasi dark/light toggle.");
    assert.equal(mobileMenuState.quickAddDuplicate, false, "Menu lainnya tidak boleh menduplikasi aksi Tambah transaksi dari navigasi utama.");
    assert.equal(mobileMenuState.reconciliationRoute, true, "Rekonsiliasi harus tersedia pada grup Kontrol saldo.");
    assert.equal(mobileMenuState.logoutInFooter, true, "Logout mobile harus tersedia pada footer menu.");
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.getAttribute('data-mobile-swipe-to-close')"), "true", "Menu lainnya harus mengaktifkan swipe-to-dismiss secara eksplisit.");
    await waitFor(() => page.evaluate("document.activeElement?.classList.contains('mobile-menu-link') || false"), { description: "focus awal Menu lainnya berada pada item menu" });
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "menu lainnya ditutup dengan tombol X" });

    await page.evaluate("document.querySelector('.mobile-navigation__more')?.click()");
    await waitFor(() => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Menu lainnya'"), { description: "menu lainnya dibuka untuk gesture" });
    await page.evaluate(`(() => {
      const header = document.querySelector('[role=dialog] .modal__header');
      const rect = header?.getBoundingClientRect();
      if (!header || !rect) return;
      const pointerId = 71;
      const x = rect.left + 48;
      const startY = rect.top + Math.min(42, rect.height / 2);
      const emit = (type, y, buttons) => header.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons }));
      emit('pointerdown', startY, 1);
      emit('pointermove', startY + 32, 1);
      emit('pointerup', startY + 32, 0);
    })()`);
    assert.equal(await page.evaluate("Boolean(document.querySelector('[role=dialog]'))"), true, "Swipe pendek harus snap back dan tidak menutup Menu lainnya.");
    await page.evaluate(`(() => {
      const header = document.querySelector('[role=dialog] .modal__header');
      const rect = header?.getBoundingClientRect();
      if (!header || !rect) return;
      const pointerId = 72;
      const x = rect.left + 48;
      const startY = rect.top + Math.min(42, rect.height / 2);
      const emit = (type, y, buttons) => header.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons }));
      emit('pointerdown', startY, 1);
      emit('pointermove', startY + 140, 1);
      emit('pointerup', startY + 140, 0);
    })()`);
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "menu lainnya ditutup dengan swipe ke bawah" });

    await navigateAndAssert(page, appServer.origin, "/tagihan", "Jadwal rutin", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('section[aria-label=\"Daftar jadwal rutin\"]'))"), true, "Daftar jadwal rutin mobile harus tetap dirender.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Pengeluaran') && document.body.textContent.includes('Pemasukan')"), true, "Pengeluaran dan pemasukan rutin harus dapat dijangkau pada mobile.");

    await navigateAndAssert(page, appServer.origin, "/anggaran", "Anggaran", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('#budget-form'))"), false, "Form anggaran tidak boleh memenuhi halaman sebelum diminta.");
    const budgetOpened = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Tambah anggaran');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert.equal(budgetOpened, true, "Owner harus memperoleh aksi Tambah anggaran pada periode aktif.");
    await waitFor(() => page.evaluate("Boolean(document.querySelector('#budget-form'))"), { description: "modal anggaran owner" });
    assert.equal(await page.evaluate(visibleExpression("#budget-form")), true, "Owner harus dapat mengelola anggaran melalui modal.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Anggaran dan pengeluaran aktual') && document.body.textContent.includes('Simpan anggaran')"), true, "Pemantauan dan form Anggaran harus tersedia pada route terpisah setelah aksi create.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "modal anggaran ditutup" });

    await navigateAndAssert(page, appServer.origin, "/laporan", "Laporan", { mobile: true });
    assert.equal(await page.evaluate("!document.body.textContent.includes('Simpan anggaran') && !document.body.textContent.includes('Arsipkan anggaran')"), true, "Laporan tidak boleh memuat mutation anggaran.");
    const reportDisclosureState = await page.evaluate(`(() => {
      const details = document.querySelector('.report-details');
      const summary = details?.querySelector('.report-details__summary');
      const content = details?.querySelector('.report-details__content');
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      return {
        detailsPresent: Boolean(details),
        summaryVisible: visible(summary),
        contentInitiallyVisible: visible(content),
        primaryPanels: [...document.querySelectorAll('.report-chart-grid > .panel')].filter(visible).length,
      };
    })()`);
    assert.deepEqual(reportDisclosureState, { detailsPresent: true, summaryVisible: true, contentInitiallyVisible: false, primaryPanels: 2 }, "Laporan mobile harus menampilkan dua insight utama dan menyimpan rincian di disclosure.");
    await page.evaluate("document.querySelector('.report-details > summary')?.click()");
    await waitFor(() => page.evaluate("document.querySelector('.report-details')?.open === true"), { description: "rincian laporan mobile terbuka" });
    assert.equal(await page.evaluate(visibleExpression(".report-details__content")), true, "Rincian laporan harus tetap dapat dijangkau setelah diminta.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("document.body.textContent.includes('Database tersambung · schema v9')"), true, "Status backend harus memakai kontrak system.health aktual.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Degraded')"), false, "Status backend siap tidak boleh salah ditampilkan sebagai Degraded.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('a[href=\"/pengaturan/notifikasi\"]')) && Boolean(document.querySelector('a[href=\"/pengaturan/anggota\"]'))"), true, "Owner harus memperoleh navigasi internal Pengaturan.");

    await setViewport(page, 366, 668);
    for (const [pathname, heading] of [["/", "Ringkasan Keuangan"], ["/transaksi", "Transaksi"], ...routeCases]) {
      await navigateAndAssert(page, appServer.origin, pathname, heading, { mobile: true });
    }

    await navigateAndAssert(page, appServer.origin, "/transaksi", "Transaksi", { mobile: true });
    const compactTransactionFilters = await page.evaluate(`(() => {
      const toolbar = document.querySelector('form[aria-label="Filter transaksi"]');
      const period = toolbar?.querySelector('input[aria-label="Periode transaksi"]');
      const type = toolbar?.querySelector('select[aria-label="Filter jenis transaksi"]');
      const more = toolbar?.querySelector('button[aria-label^="Buka filter lainnya"]');
      const advancedVisibleOutsideDialog = Boolean(toolbar?.querySelector('select[aria-label="Filter rekening"], select[aria-label="Filter kategori"], select[aria-label="Filter pencatat"]'));
      return {
        periodVisible: Boolean(period && period.getBoundingClientRect().height > 0),
        typeVisible: Boolean(type && type.getBoundingClientRect().height > 0),
        moreTouchTarget: more?.getBoundingClientRect().height || 0,
        advancedVisibleOutsideDialog,
      };
    })()`);
    assert.equal(compactTransactionFilters.periodVisible, true, "Periode harus tetap menjadi filter utama Transaksi.");
    assert.equal(compactTransactionFilters.typeVisible, true, "Jenis harus tetap menjadi filter utama Transaksi.");
    assert.ok(compactTransactionFilters.moreTouchTarget >= 43.5, `Filter lainnya harus memiliki touch target minimal 44px, ditemukan ${compactTransactionFilters.moreTouchTarget}px.`);
    assert.equal(compactTransactionFilters.advancedVisibleOutsideDialog, false, "Rekening, kategori, dan pencatat tidak boleh memenuhi toolbar utama mobile.");
    await page.evaluate(`document.querySelector('button[aria-label^="Buka filter lainnya"]')?.click()`);
    await waitFor(() => page.evaluate(`Boolean(document.querySelector('[role="dialog"] select[aria-label="Filter rekening"]'))`), { description: "dialog filter lainnya Transaksi terbuka pada mobile sempit" });
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[role="dialog"] select[aria-label="Filter alokasi"]')) && Boolean(document.querySelector('[role="dialog"] select[aria-label="Filter kategori"]')) && Boolean(document.querySelector('[role="dialog"] select[aria-label="Filter pencatat"]'))`), true, "Seluruh filter lanjutan harus tetap tersedia di dialog.");
    await page.evaluate(`document.querySelector('[role="dialog"] button[aria-label="Tutup dialog"]')?.click()`);

    await navigateAndAssert(page, appServer.origin, "/tagihan", "Jadwal rutin", { mobile: true });
    const narrowRecurringLayout = await page.evaluate(`(() => {
      const addButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Tambah jadwal');
      const period = document.querySelector('input[type="month"]');
      const summary = document.querySelector('section[aria-label="Ringkasan jadwal rutin periode ini"]');
      const schedule = document.querySelector('section[aria-label="Daftar jadwal rutin"]');
      const kindTabs = document.querySelector('[role="group"][aria-label="Jenis jadwal rutin"]');
      const navigation = document.querySelector('.mobile-navigation');
      const filterButtons = [...document.querySelectorAll('button[aria-pressed]')];
      const insideViewport = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= innerWidth + 1;
      };
      return {
        addInside: insideViewport(addButton),
        periodInside: insideViewport(period),
        summaryVisible: Boolean(summary && summary.getBoundingClientRect().height > 0),
        kindTabsVisible: Boolean(kindTabs && kindTabs.querySelectorAll('button').length === 2),
        scheduleBeforeNavigation: Boolean(schedule && navigation && schedule.getBoundingClientRect().top < navigation.getBoundingClientRect().top),
        filterTouchTargets: filterButtons.length >= 7 && filterButtons.every((button) => button.getBoundingClientRect().height >= 43.5),
      };
    })()`);
    assert.deepEqual(narrowRecurringLayout, { addInside: true, periodInside: true, summaryVisible: true, kindTabsVisible: true, scheduleBeforeNavigation: true, filterTouchTargets: true }, "Jadwal rutin 366x668 harus compact, menampilkan ringkasan dan tab jenis, tidak terpotong, serta tetap memiliki touch target aman.");

    await navigateAndAssert(page, appServer.origin, "/alokasi", "Alokasi dana", { mobile: true });
    const narrowAllocationActions = await page.evaluate(`(() => {
      const actions = document.querySelector('.allocation-header-actions');
      const refresh = document.querySelector('.allocation-refresh-action');
      const create = document.querySelector('.allocation-header-actions__primary');
      const move = [...(actions?.querySelectorAll('.button') || [])].find((button) => button.getAttribute('aria-label') === 'Pindahkan alokasi');
      return {
        actionsInside: Boolean(actions && actions.getBoundingClientRect().right <= innerWidth + 1),
        refreshTouchTarget: refresh?.getBoundingClientRect().height || 0,
        compactSingleRow: Boolean(create && move && refresh && Math.abs(create.getBoundingClientRect().top - move.getBoundingClientRect().top) <= 2 && Math.abs(move.getBoundingClientRect().top - refresh.getBoundingClientRect().top) <= 2),
      };
    })()`);
    assert.equal(narrowAllocationActions.actionsInside, true, "Aksi Alokasi harus tetap di dalam viewport sempit.");
    assert.ok(narrowAllocationActions.refreshTouchTarget >= 43.5, `Muat ulang Alokasi minimal 44px, ditemukan ${narrowAllocationActions.refreshTouchTarget}px.`);
    assert.equal(narrowAllocationActions.compactSingleRow, true, "Buat kantong, Pindahkan, dan Muat ulang harus tetap compact dalam satu baris pada mobile sempit.");

    const allocationCardInteraction = await page.evaluate(`(() => {
      const summary = document.querySelector('.allocation-summary');
      const filters = [...document.querySelectorAll('.allocation-filters button')];
      const card = document.querySelector('.allocation-card');
      const expand = card?.querySelector('.allocation-card__expand');
      const menu = card?.querySelector('.allocation-card__menu');
      const before = expand?.getAttribute('aria-expanded');
      expand?.click();
      return {
        summaryVisible: Boolean(summary && summary.getBoundingClientRect().height > 0),
        filters: filters.map((button) => button.textContent.trim()),
        menuTouchTarget: menu?.getBoundingClientRect().height || 0,
        before,
        after: expand?.getAttribute('aria-expanded'),
      };
    })()`);
    assert.equal(allocationCardInteraction.summaryVisible, true, "Ringkasan alokasi aktif harus terlihat sebelum daftar kantong.");
    assert.deepEqual(allocationCardInteraction.filters, ["Semua", "Bersama", "Saya", "Belum terpakai"], "Filter kantong aktif harus tersedia dan ringkas.");
    assert.ok(allocationCardInteraction.menuTouchTarget >= 43.5, `Menu tindakan kantong minimal 44px, ditemukan ${allocationCardInteraction.menuTouchTarget}px.`);
    assert.deepEqual([allocationCardInteraction.before, allocationCardInteraction.after], ["false", "true"], "Lihat detail harus membuka progressive disclosure tanpa navigasi baru.");

    await page.evaluate("document.querySelector('.allocation-card__menu')?.click()");
    await waitFor(() => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Belanja harian'"), { description: "action sheet kantong alokasi" });
    assert.equal(await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      return dialog?.getAttribute('data-mobile-swipe-to-close') === 'true' && dialog?.textContent?.includes('Tutup periode');
    })()`), true, "Aksi kantong mobile harus memakai swipeable action sheet dan mempertahankan Tutup periode.");
    await page.evaluate("document.querySelector('[role=dialog] [aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "action sheet alokasi tertutup" });

    await page.evaluate(`(() => {
      [...document.querySelectorAll('.allocation-filters button')].find((button) => button.textContent.trim() === 'Belum terpakai')?.click();
    })()`);
    assert.equal(await page.evaluate("document.body.textContent.includes('Tidak ada kantong yang sesuai filter.')"), true, "Filter Belum terpakai harus memperbarui daftar secara lokal tanpa mengubah data.");
    await page.evaluate(`(() => {
      [...document.querySelectorAll('.allocation-filters button')].find((button) => button.textContent.trim() === 'Semua')?.click();
    })()`);

    await navigateAndAssert(page, appServer.origin, "/target", "Target", { mobile: true });
    const compactGoalActions = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.goal-card')];
      const menus = [...document.querySelectorAll('.goal-action-menu > summary')];
      return {
        cards: cards.length,
        menus: menus.length,
        menuTouchTargets: menus.map((item) => item.getBoundingClientRect().height),
        maxDirectButtons: Math.max(0, ...cards.map((card) => card.querySelectorAll(':scope > .goal-card__actions > .button').length)),
      };
    })()`);
    assert.ok(compactGoalActions.cards > 0, "Fixture Target harus menghasilkan kartu untuk menguji action hierarchy.");
    assert.ok(compactGoalActions.menus > 0, "Target dengan aksi sekunder harus menyediakan menu Kelola.");
    assert.ok(compactGoalActions.menuTouchTargets.every((height) => height >= 43.5), `Menu Kelola Target minimal 44px, ditemukan ${JSON.stringify(compactGoalActions.menuTouchTargets)}.`);
    assert.ok(compactGoalActions.maxDirectButtons <= 1, `Kartu Target hanya boleh memiliki satu primary action langsung, ditemukan ${compactGoalActions.maxDirectButtons}.`);

    await navigateAndAssert(page, appServer.origin, "/pengaturan", "Pengaturan", { mobile: true });
    const narrowSettingsLayout = await page.evaluate(`(() => {
      const links = [...document.querySelectorAll('main nav[aria-label="Menu pengaturan"] a')];
      if (links.length < 2) return { twoColumns: false };
      const first = links[0].getBoundingClientRect();
      const second = links[1].getBoundingClientRect();
      return { twoColumns: Math.abs(first.top - second.top) <= 2 && second.left > first.left };
    })()`);
    assert.equal(narrowSettingsLayout.twoColumns, true, "Menu Pengaturan 366px harus tetap dua kolom agar tidak menjadi daftar vertikal panjang.");

    await navigateAndAssert(page, appServer.origin, "/kategori", "Kategori", { mobile: true });
    const categoryTouchTargets = await page.evaluate(`[...document.querySelectorAll('button[aria-label^="Edit kategori"], button[aria-label^="Hapus atau arsipkan kategori"]')].map((button) => button.getBoundingClientRect().height)`);
    assert.ok(categoryTouchTargets.length > 0 && categoryTouchTargets.every((height) => height >= 43.5), `Aksi kategori mobile minimal 44px, ditemukan ${JSON.stringify(categoryTouchTargets)}.`);

    await setViewport(page, 390, 844);

    await navigateAndAssert(page, appServer.origin, "/pengaturan/notifikasi", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('#notification-settings-title')) && document.body.textContent.includes('Notifikasi perangkat')"), true, "Notifikasi perangkat harus berada pada route khusus.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Uji notifikasi')"), false, "Verifikasi notifikasi harus otomatis tanpa tombol uji terpisah.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan/integrasi", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("document.querySelectorAll('h3').length >= 3 && document.body.textContent.includes('Google Sheets') && document.body.textContent.includes('Google Calendar') && document.body.textContent.includes('Google Drive')"), true, "Sheets, Calendar, dan safety backup Google Drive harus tampil pada route integrasi.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Terverifikasi') && document.body.textContent.includes('saldo-bersama-full-v9-browser.json.gz')"), true, "Tile Google Drive harus mengambil aktivitas backup terverifikasi dari backup_runs, bukan queue mirror.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan/anggota", "Pengaturan", { mobile: true });
    const memberPageState = await page.evaluate(`(() => {
      const text = document.body.textContent || "";
      return {
        title: document.querySelector('#members-settings-title')?.textContent?.replace(/\s+/g, " ").trim() || "",
        add: [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Tambah anggota'),
        activity: [...document.querySelectorAll('button')].filter((button) => button.textContent.includes('Lihat aktivitas transaksi')).length,
        legacyForm: text.includes('Tambah atau ubah akses'),
      };
    })()`);
    assert.equal(memberPageState.title, "2 Anggota", "Halaman anggota harus menampilkan jumlah akun yang dapat dikelola.");
    assert.equal(memberPageState.add, true, "Aksi tambah anggota harus tersedia tanpa menampilkan form permanen.");
    assert.ok(memberPageState.activity >= 2, "Setiap anggota harus menyediakan shortcut aktivitas transaksi.");
    assert.equal(memberPageState.legacyForm, false, "Form akses lama tidak boleh tetap memenuhi halaman utama.");

    await page.evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Tambah anggota')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Tambah anggota') || false"),
      { description: "modal tambah anggota" },
    );
    assert.equal(
      await page.evaluate("Boolean(document.querySelector('[role=dialog] input[type=email]')) && Boolean(document.querySelector('[role=dialog] select'))"),
      true,
      "Tambah anggota harus memakai dialog terfokus, bukan form permanen.",
    );
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "modal tambah anggota ditutup" });

    await page.evaluate("document.querySelector('button[aria-label=\"Aksi untuk Owner Browser\"]')?.click()");
    const currentOwnerActions = await page.evaluate(`(() => {
      const trigger = document.querySelector('button[aria-label="Aksi untuk Owner Browser"]');
      const wrap = trigger?.parentElement;
      return wrap?.textContent || "";
    })()`);
    assert.equal(currentOwnerActions.includes("Ubah akses"), true, "Owner aktif harus tetap dapat memperbarui aksesnya.");
    assert.equal(currentOwnerActions.includes("Nonaktifkan"), false, "Current owner tidak boleh diberi aksi self-deactivation di frontend.");
    await page.evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
    await waitFor(() => page.evaluate("document.querySelector('button[aria-label=\"Aksi untuk Owner Browser\"]')?.getAttribute('aria-expanded') === 'false'"), { description: "menu anggota ditutup dari klik luar" });

    await page.evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Lihat aktivitas transaksi'))?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Aktivitas anggota') || false"),
      { description: "aktivitas anggota mobile" },
    );
    const activityPeriodSet = await page.evaluate(`(() => {
      const input = document.querySelector('[role=dialog] input[type="month"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!input || !setter) return false;
      setter.call(input, ${JSON.stringify(authenticatedFixturePeriod)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(activityPeriodSet, true, "Periode fixture Aktivitas anggota harus dapat dipilih secara deterministik.");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Belanja makan mingguan') || false"),
      { description: "ledger aktivitas anggota selesai dimuat" },
    );
    const mobileActivityState = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const rect = dialog?.getBoundingClientRect();
      const text = dialog?.textContent || "";
      return {
        width: rect?.width || 0,
        viewport: innerWidth,
        ledger: text.includes('Belanja makan mingguan'),
        explanation: text.includes('siapa yang memasukkan transaksi'),
        hasOpenAll: [...(dialog?.querySelectorAll('button') || [])].some((button) => button.textContent.includes('Lihat semua di halaman Transaksi')),
      };
    })()`);
    assert.ok(Math.abs(mobileActivityState.width - mobileActivityState.viewport) <= 2, `Aktivitas anggota mobile harus full-screen, ditemukan ${mobileActivityState.width}px dari ${mobileActivityState.viewport}px.`);
    assert.equal(mobileActivityState.ledger, true, "Aktivitas anggota harus memuat transaksi dari created_by yang sesuai.");
    assert.equal(mobileActivityState.explanation, true, "UI harus menjelaskan bahwa pencatat bukan berarti pihak yang membayar.");
    assert.equal(mobileActivityState.hasOpenAll, true, "Aktivitas anggota harus dapat diteruskan ke ledger transaksi canonical.");
    page.clearDiagnostics?.();
    await page.evaluate("[...document.querySelectorAll('[role=dialog] button')].find((button) => button.textContent.includes('Lihat semua di halaman Transaksi'))?.click()");
    await waitForAppRoute(page, "/transaksi", { heading: "Transaksi" });
    const memberTransactionPeriod = await page.evaluate(`document.querySelector('input[aria-label="Periode transaksi"]')?.value || ""`);
    await page.evaluate(`document.querySelector('button[aria-label^="Buka filter lainnya"]')?.click()`);
    await waitFor(() => page.evaluate(`Boolean(document.querySelector('[role="dialog"] select[aria-label="Filter pencatat"]'))`), { description: "filter pencatat shortcut aktivitas terbuka" });
    const memberTransactionCreator = await page.evaluate(`document.querySelector('[role="dialog"] select[aria-label="Filter pencatat"]')?.value || ""`);
    assert.equal(memberTransactionCreator, "browser-owner", "Shortcut aktivitas harus menginisialisasi filter pencatat tanpa menaruh user id di URL.");
    assert.equal(memberTransactionPeriod, authenticatedFixturePeriod, "Shortcut aktivitas harus mempertahankan periode fixture yang dipilih.");
    await page.evaluate(`document.querySelector('[role="dialog"] button[aria-label="Tutup dialog"]')?.click()`);
    assert.equal(await page.evaluate("location.search"), "", "Filter aktivitas anggota tidak boleh menaruh data pengguna pada query URL.");

    for (const [path, expected] of [
      ["/pengaturan/export", "Excel lengkap"],
      ["/pengaturan/backup", "Backup manual"],
      ["/pengaturan/pemulihan", "Pemulihan data"],
      ["/pengaturan/audit", "Aktivitas terbaru"],
    ]) {
      await navigateAndAssert(page, appServer.origin, path, "Pengaturan", { mobile: true });
      assert.equal(
        await page.evaluate(`document.body.textContent.includes(${JSON.stringify(expected)})`),
        true,
        `${expected} harus dapat dijangkau pada route Pengaturan terpisah.`,
      );
    }

    await navigateAndAssert(page, appServer.origin, "/pengaturan/import", "Pengaturan", { mobile: true });
    const importFileReady = await page.evaluate(`(() => {
      const input = document.querySelector('input[type="file"]');
      if (!input) return false;
      const records = [{
        transaction_date: '2026-08-05', transaction_type: 'expense', source_account_id: 'acc-shared-bank',
        category_id: 'cat-food', amount: 125000, description: 'Browser import preview'
      }];
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(records)], 'browser-import.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(importFileReady, true, "Fixture import harus dapat mengisi file input tanpa filesystem eksternal.");
    await page.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Preview import'))?.click()`);
    await waitFor(
      () => page.evaluate(`document.body.textContent.includes('Tidak ada partial import')`),
      { description: "preview import unacceptable tampil" },
    );
    const importGuardState = await page.evaluate(`(() => ({
      hasApply: [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Terapkan import')),
      hasConfirmation: [...document.querySelectorAll('input')].some((input) => input.getAttribute('placeholder') === 'IMPORT TRANSAKSI'),
      showsInvalid: document.body.textContent.includes('Kategori import tidak valid'),
      showsImpact: document.body.textContent.includes('Total pengeluaran'),
    }))()`);
    assert.equal(importGuardState.hasApply, false, "Preview import unacceptable tidak boleh menawarkan tombol apply.");
    assert.equal(importGuardState.hasConfirmation, false, "Preview import unacceptable tidak boleh meminta frasa apply.");
    assert.equal(importGuardState.showsInvalid, true, "UI import harus menjelaskan baris invalid.");
    assert.equal(importGuardState.showsImpact, true, "UI import harus menampilkan dampak kumulatif.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan/pemulihan", "Pengaturan", { mobile: true });
    const restoreFileIdSet = await page.evaluate(`(() => {
      const input = [...document.querySelectorAll('input')].find((item) => item.closest('label')?.textContent.includes('Google Drive file ID'));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!input || !setter) return false;
      setter.call(input, 'drive-browser-backup');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(restoreFileIdSet, true, "Fixture restore harus dapat mengisi Google Drive file ID.");
    await waitFor(
      () => page.evaluate(`[...document.querySelectorAll('button')].some((button) => button.textContent.includes('Validasi dan preview') && !button.disabled)`),
      { description: "status backend restore terverifikasi" },
    );
    await page.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Validasi dan preview'))?.click()`);
    await waitFor(
      () => page.evaluate(`document.body.textContent.includes('saldo-bersama-full-v9-browser.json.gz')`),
      { description: "preview restore terverifikasi tampil" },
    );
    const restorePreviewState = await page.evaluate(`(() => ({
      hasFile: document.body.textContent.includes('saldo-bersama-full-v9-browser.json.gz'),
      hasSchema: document.body.textContent.includes('v9'),
      hasTransactions: document.body.textContent.includes('Transaksi') && document.body.textContent.includes('18'),
      hasAudit: document.body.textContent.includes('Audit log') && document.body.textContent.includes('42'),
    }))()`);
    assert.equal(restorePreviewState.hasFile, true, "Restore preview harus menampilkan nama file backup.");
    assert.equal(restorePreviewState.hasSchema, true, "Restore preview harus menampilkan schema backup.");
    assert.equal(restorePreviewState.hasTransactions, true, "Restore preview harus menampilkan jumlah transaksi.");
    assert.equal(restorePreviewState.hasAudit, true, "Restore preview harus menampilkan jumlah audit.");
    await page.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Tinjau & terapkan restore'))?.click()`);
    await waitFor(() => page.evaluate(`document.querySelector('[role="dialog"]')?.textContent?.includes('RESTORE SALDO BERSAMA') || false`), { description: "modal restore guarded terbuka" });
    const restoreGuardState = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return {
        checkboxCount: dialog?.querySelectorAll('input[type="checkbox"]').length || 0,
        hasReason: [...(dialog?.querySelectorAll('textarea') || [])].some((input) => input.closest('label')?.textContent.includes('Alasan restore')),
        hasPhrase: [...(dialog?.querySelectorAll('input') || [])].some((input) => input.getAttribute('placeholder') === 'RESTORE SALDO BERSAMA'),
        confirmDisabled: [...(dialog?.querySelectorAll('button') || [])].find((button) => button.textContent.includes('Tunggu') || button.textContent.includes('Pulihkan backup'))?.disabled ?? false,
      };
    })()`);
    assert.equal(restoreGuardState.checkboxCount, 3, "Restore full harus meminta tiga acknowledgement eksplisit.");
    assert.equal(restoreGuardState.hasReason, true, "Restore full harus meminta alasan.");
    assert.equal(restoreGuardState.hasPhrase, true, "Restore full harus meminta frasa exact.");
    assert.equal(restoreGuardState.confirmDisabled, true, "CTA restore harus terkunci sebelum syarat destructive terpenuhi.");
    await page.evaluate(`document.querySelector('[role="dialog"] button[aria-label="Tutup dialog"]')?.click()`);

    await navigateAndAssert(page, appServer.origin, "/rekening", "Rekening", { mobile: true });
    if (await page.evaluate(`document.documentElement.dataset.theme !== "light"`)) {
      await page.evaluate(`document.querySelector('button[aria-label="Aktifkan light mode"]')?.click()`);
      await waitFor(() => page.evaluate(`document.documentElement.dataset.theme === "light"`), { description: "Rekening beralih ke light mode" });
    }
    assert.equal(await page.evaluate(visibleExpression('button[aria-label="Tambah rekening"]')), true, "Owner mobile harus memiliki tombol tambah rekening.");
    assert.equal(await page.evaluate("[...document.querySelectorAll('button[aria-label^=\"Lihat detail rekening\"] span')].some((item) => item.textContent.trim() === 'Pribadi')"), true, "Badge kepemilikan rekening personal harus ringkas.");

    await setViewport(page, 351, 590);
    const readAccountFullScreenState = () => page.evaluate(`(() => {
      const stage = document.querySelector('[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]');
      const experience = stage?.closest('section')?.parentElement;
      const content = document.querySelector('.app-shell--accounts .app-content');
      const shell = document.querySelector('.app-shell--accounts');
      const navigation = document.querySelector('.mobile-navigation');
      const contentStyle = content ? getComputedStyle(content) : null;
      const experienceStyle = experience ? getComputedStyle(experience) : null;
      const experienceRect = experience?.getBoundingClientRect();
      const navigationRect = navigation?.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        shellHeight: shell?.getBoundingClientRect().height || 0,
        contentBackground: contentStyle?.backgroundImage || '',
        experienceBackground: experienceStyle?.backgroundImage || '',
        reservedGap: experienceRect && navigationRect ? navigationRect.top - experienceRect.bottom : -1,
        theme: document.documentElement.dataset.theme || '',
        contentColor: contentStyle?.color || '',
        canonicalTextColor: (() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--text)";
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })(),
        activeCardHasArtwork: Boolean([...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')].find((item) => item.getAttribute('aria-pressed') === 'true')?.querySelector('img')),
      };
    })()`);
    await waitFor(async () => {
      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      const state = await readAccountFullScreenState();
      return state.reservedGap >= -1 && state.reservedGap <= 20;
    }, { description: "ruang aman Rekening stabil setelah konten mobile selesai bertambah" });
    const accountFullScreenState = await readAccountFullScreenState();
    assert.ok(accountFullScreenState.shellHeight >= accountFullScreenState.viewportHeight - 1, "Shell Rekening harus memenuhi dynamic viewport pada layar pendek.");
    assert.notEqual(accountFullScreenState.contentBackground, "none", "Area aman di bawah konten Rekening harus memiliki background route.");
    assert.equal(accountFullScreenState.contentBackground, accountFullScreenState.experienceBackground, "Background Rekening harus berlanjut sampai ruang aman sebelum navigasi.");
    assert.ok(accountFullScreenState.reservedGap >= -1 && accountFullScreenState.reservedGap <= 20, `Ruang aman sebelum navigasi harus tetap terkontrol, ditemukan ${accountFullScreenState.reservedGap}px.`);
    assert.equal(accountFullScreenState.theme, "light", "Regression Rekening harus memvalidasi light mode secara eksplisit.");
    assert.equal(
      accountFullScreenState.contentColor,
      accountFullScreenState.canonicalTextColor,
      "Area di luar kartu Rekening harus memakai warna teks canonical light mode.",
    );
    assert.equal(accountFullScreenState.activeCardHasArtwork, true, "Light mode tidak boleh menghapus atau mengganti artwork kartu rekening aktif.");
    await setViewport(page, 390, 844);
    await page.evaluate("window.scrollTo(0, 0)");
    await waitFor(() => page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')];
      return cards.filter((card) => Number.parseFloat(getComputedStyle(card).opacity || '0') > 0.05).length >= Math.min(3, cards.length);
    })()`), { description: "tiga kartu rekening terlihat pada stack mobile" });
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]'))`), true, "Stack rekening mobile harus memakai gesture vertikal yang selaras dengan animasi tumpukan.");
    const mobileAccountInteraction = await page.evaluate(`(() => {
      const stack = document.querySelector('[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]');
      const activeCard = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')]
        .find((item) => item.getAttribute('aria-pressed') === 'true');
      return {
        stackTouchAction: stack ? getComputedStyle(stack).touchAction : '',
        activeCardTouchAction: activeCard ? getComputedStyle(activeCard).touchAction : '',
        activeName: document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim() || '',
        activeRect: activeCard ? (() => {
          const rect = activeCard.getBoundingClientRect();
          return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
        })() : null,
      };
    })()`);
    assert.equal(mobileAccountInteraction.stackTouchAction, "pan-y pinch-zoom", "Area di luar kartu aktif harus tetap membiarkan scroll vertikal dan pinch zoom.");
    assert.equal(mobileAccountInteraction.activeCardTouchAction, "pan-x pinch-zoom", "Kartu aktif harus menerima gesture vertikal tanpa memblokir pinch zoom.");
    assert.ok(mobileAccountInteraction.activeRect, "Kartu aktif harus tersedia untuk gesture browser.");
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await page.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: mobileAccountInteraction.activeRect.x, y: mobileAccountInteraction.activeRect.y }],
    });
    await page.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: mobileAccountInteraction.activeRect.x + 2, y: mobileAccountInteraction.activeRect.y - 118 }],
    });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await waitFor(
      () => page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim() !== ${JSON.stringify(mobileAccountInteraction.activeName)}`),
      { description: "swipe vertikal mengganti rekening aktif" },
    );

    const accountAfterVerticalSwipe = await page.evaluate(`(() => {
      const activeCard = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')]
        .find((item) => item.getAttribute('aria-pressed') === 'true');
      const rect = activeCard?.getBoundingClientRect();
      return {
        name: document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim() || '',
        rect: rect ? { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) } : null,
      };
    })()`);
    assert.ok(accountAfterVerticalSwipe.rect, "Kartu aktif setelah swipe vertikal harus tersedia.");

    await page.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: accountAfterVerticalSwipe.rect.x, y: accountAfterVerticalSwipe.rect.y }],
    });
    await page.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: accountAfterVerticalSwipe.rect.x + 118, y: accountAfterVerticalSwipe.rect.y + 2 }],
    });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(
      await page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim()`),
      accountAfterVerticalSwipe.name,
      "Gesture horizontal tidak boleh mengganti rekening atau membuka detail.",
    );
    assert.equal(
      await page.evaluate("!document.querySelector('[role=dialog]')"),
      true,
      "Synthetic click setelah gesture horizontal tidak boleh membuka detail rekening.",
    );

    await page.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: accountAfterVerticalSwipe.rect.x, y: accountAfterVerticalSwipe.rect.y }],
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    await page.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: accountAfterVerticalSwipe.rect.x + 1, y: accountAfterVerticalSwipe.rect.y - 20 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await new Promise((resolve) => setTimeout(resolve, 620));
    assert.equal(
      await page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim()`),
      accountAfterVerticalSwipe.name,
      "Swipe vertikal pendek harus kembali ke rekening aktif tanpa berpindah.",
    );
    assert.equal(
      await page.evaluate("!document.querySelector('[role=dialog]')"),
      true,
      "Synthetic click setelah swipe pendek tidak boleh membuka detail rekening.",
    );

    const rerenderTarget = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')];
      const activeIndex = cards.findIndex((item) => item.getAttribute('aria-pressed') === 'true');
      const target = cards[(activeIndex + 1) % cards.length];
      if (!target || target === cards[activeIndex]) return null;
      const label = target.getAttribute('aria-label') || '';
      target.click();
      return label.replace(/^Lihat detail rekening\s+/, '');
    })()`);
    assert.ok(rerenderTarget, "Fixture harus memiliki rekening lain untuk regression rerender di tengah animasi.");
    await waitFor(
      () => page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim() === ${JSON.stringify(rerenderTarget)}`),
      { description: "rekening target dipilih saat animasi memicu rerender" },
    );
    await new Promise((resolve) => setTimeout(resolve, 620));
    assert.equal(
      await page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim()`),
      rerenderTarget,
      "Pilihan rekening harus tetap stabil setelah animasi selesai.",
    );
    assert.equal(
      await page.evaluate("!document.querySelector('[role=dialog]')"),
      true,
      "Pemilihan rekening nonaktif saat animasi tidak boleh membuka detail.",
    );
    const accountBeforeKeyboardMove = await page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim()`);
    await page.evaluate(`document.querySelector('[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
    await waitFor(
      () => page.evaluate(`document.querySelector('[id="mobile-account-stack-title"]')?.textContent?.trim() !== ${JSON.stringify(accountBeforeKeyboardMove)}`),
      { description: "stack rekening tetap dapat bergerak setelah rerender di tengah animasi" },
    );

    assert.equal(await page.evaluate(`document.querySelectorAll('button[aria-label^="Pilih rekening"]').length`), 0, "Pagination carousel lama harus dihapus.");
    await page.evaluate(`(() => {
      const card = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')]
        .find((item) => getComputedStyle(item).pointerEvents !== 'none');
      card?.click();
    })()`);
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Saldo saat ini') || false"),
      { description: "detail rekening dari kartu aktif" },
    );
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('No. rekening') || false"), true, "Detail rekening hanya muncul setelah kartu aktif ditekan.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "detail rekening ditutup" });
    assert.equal(await page.evaluate("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Bayar tagihan')"), false, "Halaman rekening tidak boleh menduplikasi navigasi Tagihan dengan label aksi langsung yang menyesatkan.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('button[aria-label^=\"Buka daftar\"]'))"), true, "Kontrol Daftar rekening harus benar-benar tersedia.");

    await page.evaluate("document.querySelector('button[aria-label^=\"Buka daftar\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Daftar rekening'"),
      { description: "daftar rekening mobile" },
    );
    await page.evaluate(`(() => {
      const target = [...document.querySelectorAll('[role=dialog] button')]
        .find((button) => button.textContent.includes('BNI · Rekening Bersama'));
      target?.click();
    })()`);
    await waitFor(
      () => page.evaluate("!document.querySelector('[role=dialog]') && document.querySelector('[id=\"mobile-account-stack-title\"]')?.textContent?.trim() === 'Rekening Bersama · BNI'"),
      { description: "rekening fixture BNI dipilih untuk riwayat pembayaran" },
    );

    await page.evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Pembayaran keluar')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Pembayaran keluar'"),
      { description: "pembayaran keluar rekening aktif" },
    );
    const paymentPeriodSet = await page.evaluate(`(() => {
      const input = document.querySelector('[role=dialog] input[aria-label="Periode riwayat pembayaran"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!input || !setter) return false;
      setter.call(input, ${JSON.stringify(authenticatedFixturePeriod)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(paymentPeriodSet, true, "Periode riwayat pembayaran fixture harus dapat dipilih secara deterministik.");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Belanja makan mingguan') || false"),
      { description: "riwayat pembayaran rekening fixture selesai dimuat" },
    );
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Belanja makan mingguan') || false"), true, "Daftar harus memuat pengeluaran dari rekening aktif.");
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Isi kas bersama') || false"), true, "Transfer keluar dari rekening aktif harus masuk daftar pembayaran.");
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Gaji bulan Agustus') || false"), false, "Pemasukan tidak boleh dicampur ke pembayaran keluar.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "pembayaran keluar ditutup" });
    assert.equal(await page.evaluate("document.body.textContent.includes('Riwayat dimuat hanya saat dibuka agar halaman rekening tetap ringan.')"), false, "Detail implementasi tidak boleh memenuhi halaman rekening.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('button[aria-label=\"Baca penjelasan rekonsiliasi\"]'))"), false, "Penjelasan rekonsiliasi tidak boleh tetap tersebar di halaman Rekening.");
    await navigateAndAssert(page, appServer.origin, "/rekonsiliasi", "Cocokkan Saldo", { mobile: true });
    const reconciliationState = await page.evaluate(`(() => {
      const main = document.querySelector("main");
      const text = main?.textContent || "";
      return {
        noLongPurposeCopy: !text.includes("Periksa apakah saldo aplikasi sama dengan saldo bank, e-wallet, atau uang tunai. Fitur ini tidak menambah saldo."),
        actualBalanceInput: Boolean(main?.querySelector("#reconciliation-actual-balance")),
        systemBalance: text.includes("Saldo sistem"),
        conciseGuard: text.includes("Tidak mengubah saldo secara otomatis."),
        helpDisclosure: Boolean(main?.querySelector("details")) && text.includes("Cara kerja"),
      };
    })()`);
    assert.deepEqual(reconciliationState, {
      noLongPurposeCopy: true,
      actualBalanceInput: true,
      systemBalance: true,
      conciseGuard: true,
      helpDisclosure: true,
    }, "Route Rekonsiliasi harus tetap jelas tanpa copy edukasi permanen yang berulang.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('form'))"), true, "Owner yang memiliki capability harus memperoleh form rekonsiliasi.");
    await navigateAndAssert(page, appServer.origin, "/rekening", "Rekening", { mobile: true });
    await page.evaluate("document.querySelector('button[aria-label=\"Tambah rekening\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Tambah rekening'"),
      { description: "dialog tambah rekening" },
    );
    assert.equal(await page.evaluate("document.querySelectorAll('[role=dialog] [role=tab]').length"), 0, "Dialog rekening tidak boleh lagi mencampur tab kategori.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('[role=dialog] input[placeholder*=\"123456\"]'))"), true, "Form rekening harus menyediakan nomor rekening.");
    const mobileControlFontSize = await page.evaluate(`(() => {
      const control = document.querySelector('[role=dialog] input, [role=dialog] select, [role=dialog] textarea');
      return control ? Number.parseFloat(getComputedStyle(control).fontSize) : 0;
    })()`);
    assert.ok(mobileControlFontSize >= 16, `Kontrol form mobile minimal 16px untuk mencegah auto-zoom Safari, ditemukan ${mobileControlFontSize}px.`);
    const nameSelector = '[role=dialog] input[placeholder="Contoh: Tabungan nikah"]';
    await waitFor(() => page.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(nameSelector)})`), { description: "focus awal nama rekening" });
    let typedName = "";
    for (const character of "VIO") {
      typedName += character;
      await page.evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(nameSelector)});
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setValue.call(input, ${JSON.stringify(typedName)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await waitFor(() => page.evaluate(`document.querySelector(${JSON.stringify(nameSelector)})?.value === ${JSON.stringify(typedName)}`), { description: `nilai nama rekening ${typedName}` });
      await page.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.equal(await page.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(nameSelector)})`), true, "Fokus input tidak boleh berpindah setiap ketikan.");
    }
    await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const template = [...dialog.querySelectorAll('label')].find((label) => label.textContent.includes('Template kartu bank'))?.querySelector('select');
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setValue.call(template, 'bni');
      template.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(() => page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const template = [...dialog.querySelectorAll('label')].find((label) => label.textContent.includes('Template kartu bank'))?.querySelector('select');
      return template?.value === 'bni';
    })()`), { description: "template BNI dipilih" });
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(nameSelector)})?.value`), "VIO", "Mengganti template tidak boleh mengubah nama rekening.");
    await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const type = [...dialog.querySelectorAll('label')].find((label) => label.querySelector('span')?.textContent?.trim() === 'Jenis')?.querySelector('select');
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setValue.call(type, 'ewallet');
      type.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(() => page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      return [...dialog.querySelectorAll('label')].some((label) => label.textContent.includes('Provider E-wallet'));
    })()`), { description: "provider E-wallet tersedia setelah jenis E-wallet dipilih" });
    await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const provider = [...dialog.querySelectorAll('label')].find((label) => label.textContent.includes('Provider E-wallet'))?.querySelector('select');
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setValue.call(provider, 'dana');
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(() => page.evaluate(`Boolean(document.querySelector('[role=dialog] [data-ewallet-template="dana"][data-has-image="true"]'))`), { description: "preview asset DANA realtime" });
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(nameSelector)})?.value`), "VIO", "Mengganti provider E-wallet tidak boleh mengubah nama rekening.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "dialog rekening ditutup" });

    await navigateAndAssert(page, appServer.origin, "/kategori", "Kategori transaksi", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression('button[aria-label="Tambah kategori"]')), true, "Owner harus memperoleh aksi kategori pada route khusus.");
    await page.evaluate("document.querySelector('button[aria-label=\"Tambah kategori\"]')?.click()");
    await waitFor(() => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Tambah kategori'"), { description: "dialog tambah kategori" });
    const categoryDialogOverflow = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const body = dialog?.querySelector('.modal__body');
      const form = dialog?.querySelector('form');
      return {
        dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 999,
        body: body ? body.scrollWidth - body.clientWidth : 999,
        form: form ? form.scrollWidth - form.clientWidth : 999,
      };
    })()`);
    assert.ok(Object.values(categoryDialogOverflow).every((value) => value <= 1), `Dialog kategori tidak boleh bergeser horizontal: ${JSON.stringify(categoryDialogOverflow)}`);
    assert.equal(await page.evaluate("document.body.textContent.includes('Transfer antar rekening tidak memakai kategori')"), true, "Form kategori harus mencegah salah klasifikasi Transfer.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "dialog kategori ditutup" });

    await navigateAndAssert(page, appServer.origin, "/404", "Halaman tidak ditemukan", { mobile: true });
    const notFoundState = await page.evaluate(`(() => {
      const page = document.querySelector('.centered-page');
      const content = document.querySelector('.app-content');
      const pageRect = page?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      const contentStyle = content ? getComputedStyle(content) : null;
      const paddingTop = Number.parseFloat(contentStyle?.paddingTop || '0') || 0;
      const paddingBottom = Number.parseFloat(contentStyle?.paddingBottom || '0') || 0;
      return {
        pageHeight: pageRect?.height || 0,
        contentInnerHeight: contentRect ? Math.max(0, contentRect.height - paddingTop - paddingBottom) : 0,
        paddingTop,
        paddingBottom,
      };
    })()`);
    assert.ok(
      notFoundState.pageHeight >= notFoundState.contentInnerHeight - 2,
      `Halaman 404 harus memenuhi content box setelah padding/safe-area canonical, ditemukan ${JSON.stringify(notFoundState)}.`,
    );

    await setViewport(page, 1440, 900);
    await navigateAndAssert(page, appServer.origin, "/", "Ringkasan Keuangan", { mobile: false });
    assert.equal(await page.evaluate(visibleExpression(".desktop-logout-button")), true, "Logout desktop harus terlihat.");
    const desktopDockSelector = '.desktop-module-dock__navigation > .desktop-module-dock__link, .desktop-module-dock__group > .desktop-module-dock__link';
    assert.equal(await page.evaluate(`document.querySelectorAll(${JSON.stringify(desktopDockSelector)}).length`), 6, "Dock desktop harus mempertahankan enam kontrol utama yang ada di source aktual.");
    const dockGeometry = await page.evaluate(`(() => {
      const dock = document.querySelector('.desktop-module-dock');
      const controls = [...document.querySelectorAll(${JSON.stringify(desktopDockSelector)})];
      const rects = controls.map((item) => item.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      const gaps = rects.slice(1).map((rect, index) => rect.top - rects[index].bottom);
      return {
        height: dock?.getBoundingClientRect().height || 0,
        minControl: Math.min(...rects.map((rect) => Math.min(rect.width, rect.height))),
        minGap: gaps.length ? Math.min(...gaps) : 0,
        maxGap: gaps.length ? Math.max(...gaps) : 0,
        usesCurvedMask: Boolean(dock?.querySelector('.desktop-module-dock__shape')),
      };
    })()`);
    assert.ok(dockGeometry.height >= 480, `Sidebar melengkung desktop harus diperbesar, ditemukan ${dockGeometry.height}px.`);
    assert.ok(dockGeometry.minControl >= 48, `Kontrol dock desktop minimal 48px, ditemukan ${dockGeometry.minControl}px.`);
    assert.ok(dockGeometry.minGap >= 8 && dockGeometry.maxGap <= 14, `Kontrol dock desktop harus tersusun rapat dengan gap sekitar 12px, ditemukan ${JSON.stringify(dockGeometry)}.`);
    assert.equal(dockGeometry.usesCurvedMask, true, "Sidebar harus tetap memakai mask melengkung canonical.");
    await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Perencanaan\"]')?.click()");
    await waitFor(() => page.evaluate(visibleExpression(".desktop-module-dock__flyout")), { description: "flyout perencanaan" });
    await waitForElementMotionToSettle(page, ".desktop-module-dock__flyout", "flyout Perencanaan");
    assert.equal(await page.evaluate("['/anggaran','/alokasi','/tagihan','/target'].every((href) => Boolean(document.querySelector(`.desktop-module-dock__flyout a[href=\"${href}\"]`)))"), true, "Flyout Perencanaan harus memuat empat child route source aktual.");
    assert.equal(await page.evaluate("document.querySelectorAll('.desktop-module-dock__flyout-link small').length"), 0, "Submenu desktop tidak boleh memakai deskripsi card-in-card.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('.desktop-module-dock__flyout-close'))"), false, "Flyout navigasi tidak perlu tombol X terpisah.");
    const planningFlyoutGeometry = await page.evaluate(`(() => {
      const dock = document.querySelector('.desktop-module-dock')?.getBoundingClientRect();
      const trigger = document.querySelector('button[aria-label="Buka menu Perencanaan"]')?.getBoundingClientRect();
      const flyout = document.querySelector('.desktop-module-dock__flyout')?.getBoundingClientRect();
      if (!dock || !trigger || !flyout) return null;
      return {
        gap: flyout.left - dock.right,
        centerDelta: Math.abs((flyout.top + (flyout.height / 2)) - (trigger.top + (trigger.height / 2))),
      };
    })()`);
    assert.ok(planningFlyoutGeometry && planningFlyoutGeometry.gap >= 8 && planningFlyoutGeometry.gap <= 12, `Flyout harus menempel ke sisi rail dengan gap sekitar 10px, ditemukan ${JSON.stringify(planningFlyoutGeometry)}.`);
    assert.ok(planningFlyoutGeometry.centerDelta <= 2, `Flyout harus sejajar dengan trigger yang membukanya, ditemukan ${JSON.stringify(planningFlyoutGeometry)}.`);
    await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor(() => page.evaluate("!document.querySelector('.desktop-module-dock__flyout')"), { description: "flyout perencanaan ditutup dengan Escape" });
    await waitFor(
      () => page.evaluate("document.activeElement?.getAttribute('aria-label') === 'Buka menu Perencanaan'"),
      { description: "focus kembali ke trigger Perencanaan setelah Escape" },
    );
    await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Perencanaan\"]')?.click()");
    await waitFor(() => page.evaluate(visibleExpression(".desktop-module-dock__flyout")), { description: "flyout perencanaan dibuka ulang" });
    await page.evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
    await waitFor(() => page.evaluate("!document.querySelector('.desktop-module-dock__flyout')"), { description: "flyout perencanaan ditutup dari klik luar" });
    await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Perencanaan\"]')?.click()");
    await waitFor(() => page.evaluate(visibleExpression(".desktop-module-dock__flyout")), { description: "flyout perencanaan dibuka untuk navigasi" });
    page.clearDiagnostics?.();
    await page.evaluate("document.querySelector('.desktop-module-dock__flyout a[href=\"/alokasi\"]')?.click()");
    await waitForAppRoute(page, "/alokasi", { heading: "Alokasi dana" });
    assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Perencanaan\"]')?.classList.contains('is-active') || false"), true, "Parent Perencanaan harus aktif pada child route.");
    await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Data keuangan\"]')?.click()");
    await waitFor(() => page.evaluate(visibleExpression(".desktop-module-dock__flyout")), { description: "flyout data keuangan" });
    page.clearDiagnostics?.();
    await page.evaluate("document.querySelector('.desktop-module-dock__flyout a[href=\"/rekening\"]')?.click()");
    await waitForAppRoute(page, "/rekening", { heading: "Rekening" });
    assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Data keuangan\"]')?.classList.contains('is-active') || false"), true, "Parent Data keuangan harus aktif pada child route.");
    await navigateAndAssert(page, appServer.origin, "/pengaturan/anggota", "Pengaturan", { mobile: false });
    await page.evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Lihat aktivitas transaksi'))?.click()");
    await waitFor(() => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Aktivitas anggota') || false"), { description: "drawer aktivitas anggota desktop" });
    await waitForElementMotionToSettle(page, "[role=dialog]", "drawer aktivitas anggota desktop");
    const desktopActivityGeometry = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const rect = dialog?.getBoundingClientRect();
      return { width: rect?.width || 0, right: rect?.right || 0, viewport: innerWidth };
    })()`);
    assert.ok(desktopActivityGeometry.width >= 400 && desktopActivityGeometry.width < desktopActivityGeometry.viewport * 0.6, `Aktivitas desktop harus berupa drawer kanan, ditemukan ${JSON.stringify(desktopActivityGeometry)}.`);
    assert.ok(Math.abs(desktopActivityGeometry.right - desktopActivityGeometry.viewport) <= 2, "Drawer aktivitas desktop harus menempel ke sisi kanan viewport.");
    await page.evaluate("document.querySelector('button[aria-label=\"Tutup aktivitas anggota\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "drawer aktivitas anggota desktop ditutup" });
    await navigateAndAssert(page, appServer.origin, "/", "Ringkasan Keuangan", { mobile: false });
    await waitFor(
      () => page.evaluate("document.querySelectorAll('[data-dashboard-account]').length >= 3 && document.querySelectorAll('.shared-transaction-table tbody tr').length >= 2"),
      { description: "dashboard desktop selesai memuat rekening dan transaksi fixture" },
    );
    assert.equal(await page.evaluate(visibleExpression(".dashboard-desktop button[aria-label*='nominal']")), true, "Privacy nominal harus tersedia pada desktop.");
    const accountDrivenDashboard = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll("[data-dashboard-account]")];
      const selected = cards.find((item) => item.getAttribute("aria-pressed") === "true");
      return {
        cards: cards.length,
        selectedAccount: selected?.dataset.dashboardAccount || "",
        rows: document.querySelectorAll(".shared-transaction-table tbody tr").length,
        statistics: Boolean(document.querySelector(".shared-donut")),
        budgets: (document.body.textContent || "").includes("Anggaran bulan ini"),
        bills: (document.body.textContent || "").includes("Tagihan terdekat"),
        goals: (document.body.textContent || "").includes("Target tabungan"),
        typeFilter: Boolean(document.querySelector(".shared-transaction-tools select")),
      };
    })()`);
    assert.ok(accountDrivenDashboard.cards >= 3, "Dashboard desktop harus menampilkan kartu rekening yang dapat dipilih.");
    assert.equal(accountDrivenDashboard.selectedAccount, "acc-shared-bank", "Rekening pertama harus aktif saat dashboard dibuka.");
    assert.ok(accountDrivenDashboard.rows >= 2, "Transaksi rekening terpilih harus tampil.");
    assert.equal(accountDrivenDashboard.statistics, true, "Statistik pengeluaran harus terlihat.");
    assert.equal(accountDrivenDashboard.budgets, true);
    assert.equal(accountDrivenDashboard.bills, true);
    assert.equal(accountDrivenDashboard.goals, true);
    assert.equal(accountDrivenDashboard.typeFilter, true, "Filter jenis transaksi harus tetap tersedia pada desktop.");
    const alertButton = await page.evaluate(`(() => {
      const button = document.querySelector('.shared-alert-count-button');
      return { visible: Boolean(button), label: button?.getAttribute('aria-label') || '', count: button?.textContent?.trim() || '' };
    })()`);
    assert.deepEqual(alertButton, { visible: true, label: "Lihat 5 peringatan aktif", count: "5" }, "Dashboard desktop harus mengekspos jumlah peringatan yang dapat dibuka.");
    await page.evaluate("document.querySelector('.shared-alert-count-button')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Perlu perhatian'"),
      { description: "dialog Perlu perhatian desktop" },
    );
    const desktopAlerts = await page.evaluate(`(() => ({
      items: document.querySelectorAll('[role=dialog] .financial-alert-item').length,
      actions: [...document.querySelectorAll('[role=dialog] .financial-alert-action')].map((item) => item.textContent.trim()),
      instructions: [...document.querySelectorAll('[role=dialog] .financial-alert-instruction')].every((item) => item.textContent.includes('Yang perlu dilakukan')),
    }))()`);
    assert.equal(desktopAlerts.items, 5, "Semua alert fixture harus terlihat pada desktop, bukan hanya angkanya.");
    assert.equal(desktopAlerts.instructions, true, "Alert desktop harus memiliki instruksi yang sama dengan mobile.");
    for (const action of ["Periksa anggaran", "Buka tagihan ini", "Tambah dana target", "Pilih alokasi", "Cek saldo sekarang"]) assert.ok(desktopAlerts.actions.includes(action), `Aksi desktop ${action} harus tersedia.`);
    await page.evaluate(`[...document.querySelectorAll('[role=dialog] .financial-alert-action')].find((item) => item.textContent.includes('Tambah dana target'))?.click()`);
    await waitForAppRoute(page, "/target", { heading: "Target" });
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Tambah dana target'"),
      { description: "deep-link target membuka form setoran" },
    );
    const consumedAttention = await page.evaluate(`(() => {
      const state = history.state?.usr ?? history.state ?? null;
      return { source: state?.attentionSource || null, action: state?.attentionAction || null, goal: state?.attentionGoalId || null };
    })()`);
    assert.deepEqual(consumedAttention, { source: null, action: null, goal: null }, "Attention state harus dikonsumsi setelah deep-link dijalankan agar refresh tidak membuka aksi lagi.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "modal target dari attention ditutup" });
    await navigateAndAssert(page, appServer.origin, "/", "Ringkasan Keuangan", { mobile: false });
    await waitFor(
      () => page.evaluate("document.querySelectorAll('[data-dashboard-account]').length >= 3 && document.querySelectorAll('.shared-transaction-table tbody tr').length >= 2"),
      { description: "dashboard desktop kembali setelah regression deep-link" },
    );
    await page.evaluate("document.querySelector('[data-dashboard-account=\"acc-shared-cash\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[data-dashboard-account=\"acc-shared-cash\"]')?.getAttribute('aria-pressed') === 'true'"),
      { description: "rekening kas dipilih di dashboard" },
    );
    await waitFor(
      () => page.evaluate("document.querySelectorAll('.shared-transaction-table tbody tr').length === 1"),
      { description: "transaksi dashboard mengikuti rekening kas" },
    );
  } finally {
    await page?.close();
    await chromium?.close();
    await appServer?.close();
  }
});

await test("authenticated member: seluruh route dapat dibuka tanpa kehilangan capability mobile", { timeout: 75_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    appServer = await startBrowserAppServer({
      session: memberSession,
      gatewayResponses: createAuthenticatedGatewayResponses(memberSession),
    });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/`, { width: 390, height: 844 });
    await assertAuthenticatedRoutePreflight(page, appServer.origin);
    for (const [pathname, heading] of routeCases) {
      await navigateAndAssert(page, appServer.origin, pathname, heading, { mobile: true });
    }
    await navigateAndAssert(page, appServer.origin, "/anggaran", "Anggaran", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('#budget-form'))"), false, "Member tidak boleh memperoleh form mutation anggaran.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Anggota dapat memantau anggaran')"), true, "Member harus memperoleh status Anggaran read-only yang jelas.");
    await navigateAndAssert(page, appServer.origin, "/pengaturan", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('a[href=\"/pengaturan/notifikasi\"]'))"), true, "Member harus memperoleh menu notifikasi perangkat.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('a[href=\"/pengaturan/anggota\"]'))"), false, "Menu administratif owner tidak boleh terlihat bagi member.");
    await navigateAndAssert(page, appServer.origin, "/pengaturan/notifikasi", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('#notification-settings-title'))"), true, "Member harus dapat mengelola subscription notifikasi perangkatnya sendiri.");
    await navigateAndAssert(page, appServer.origin, "/pengaturan/anggota", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("document.body.textContent.includes('Hanya pemilik yang dapat membuka bagian ini')"), true, "Deep link administratif harus menampilkan guard bagi member.");
    await navigateAndAssert(page, appServer.origin, "/rekening", "Rekening", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('button[aria-label=\"Tambah rekening\"]'))"), false, "Member tidak boleh memperoleh aksi master data owner.");
    assert.equal(
      await page.evaluate("[...document.querySelectorAll('button[aria-label^=\"Lihat detail rekening\"] span')].some((item) => item.textContent.trim() === 'Pribadi')"),
      true,
      "Member harus melihat scope rekening personal pasangan tanpa nama panjang pada badge.",
    );
    await page.evaluate("document.querySelector('button[aria-label^=\"Buka daftar\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Daftar rekening'"),
      { description: "daftar rekening member" },
    );
    assert.equal(
      await page.evaluate("[...document.querySelectorAll('[role=dialog] button')].some((button) => button.textContent.includes('Tabungan Owner'))"),
      true,
      "Member harus dapat memilih rekening personal pasangan dari daftar rekening.",
    );
    await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent.includes('Tabungan Owner'));
      button?.click();
    })()`);
    await waitFor(
      () => page.evaluate("document.querySelector('[id=\"mobile-account-stack-title\"]')?.textContent?.includes('Tabungan Owner') || false"),
      { description: "rekening pasangan menjadi kartu aktif" },
    );
    await page.evaluate(`(() => {
      const activeCard = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')]
        .find((item) => item.getAttribute("aria-pressed") === "true" && item.getAttribute("aria-label")?.includes("Tabungan Owner"));
      activeCard?.click();
    })()`);
    await waitFor(() => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Saldo saat ini') || false"), { description: "detail rekening pasangan" });
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Owner Browser') || false"), true, "Nama pemilik rekening personal pasangan harus tetap transparan di detail.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Hanya lihat')"), true, "Rekening personal pasangan harus ditandai hanya lihat.");
    const partnerAccountActions = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const labels = [...(dialog?.querySelectorAll('button') || [])].map((button) => button.textContent.trim());
      return {
        canViewTransactions: labels.includes('Lihat transaksi'),
        canEdit: labels.some((label) => label === 'Edit' || label === 'Edit rekening'),
        canArchive: labels.includes('Hapus / Arsipkan'),
      };
    })()`);
    assert.equal(partnerAccountActions.canViewTransactions, true, "Member tetap harus dapat membaca ledger rekening personal pasangan yang transparan.");
    assert.equal(partnerAccountActions.canEdit, false, "Member tidak boleh memperoleh aksi edit rekening personal pasangan.");
    assert.equal(partnerAccountActions.canArchive, false, "Member tidak boleh memperoleh aksi arsip rekening personal pasangan.");
  } finally {
    await page?.close();
    await chromium?.close();
    await appServer?.close();
  }
});

await test("breakpoint 820/821/940/941 tidak pernah menghilangkan seluruh kontrol sesi", { timeout: 60_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    appServer = await startBrowserAppServer({
      session: ownerSession,
      gatewayResponses: createAuthenticatedGatewayResponses(ownerSession),
    });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/`, { width: 820, height: 1000 });
    await waitForAppRoute(page, "/", { heading: "Ringkasan Keuangan" });

    const cases = [
      [820, true, false],
      [821, false, true],
      [900, false, true],
      [940, false, true],
      [941, false, true],
    ];
    for (const [width, mobileExpected, desktopLogoutExpected] of cases) {
      await setViewport(page, width, 1000);
      await waitFor(
        async () => {
          const state = await readPageState(page);
          return state.mobileNavigationVisible === mobileExpected && state.desktopLogoutVisible === desktopLogoutExpected;
        },
        { description: `layout breakpoint ${width}px` },
      );
      const state = await readPageState(page);
      assert.equal(state.mobileNavigationVisible, mobileExpected, `Navigasi mobile pada ${width}px tidak sesuai.`);
      assert.equal(state.desktopLogoutVisible, desktopLogoutExpected, `Logout desktop pada ${width}px tidak sesuai.`);
      assert.equal(state.mobileNavigationVisible || state.desktopLogoutVisible, true, `Kontrol sesi tidak boleh hilang pada ${width}px.`);
      assert.ok(state.overflow <= 1, `Layout ${width}px tidak boleh overflow horizontal (${state.overflow}px).`);
    }

    await setViewport(page, 900, 1000);
    assert.equal(await page.evaluate(visibleExpression(".shared-transaction-tools label:nth-child(3) select")), true, "Filter jenis tetap terlihat pada dashboard compact desktop.");
  } finally {
    await page?.close();
    await chromium?.close();
    await appServer?.close();
  }
});

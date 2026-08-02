import assert from "node:assert/strict";
import { test } from "node:test";
import { startBrowserAppServer, startChromium, openBrowserPage, setViewport, waitForAppRoute } from "./helpers/app-runtime.mjs";
import { waitFor } from "./helpers/cdp.mjs";
import { createAuthenticatedGatewayResponses, memberSession, ownerSession } from "./helpers/authenticated-fixture.mjs";

const routeCases = Object.freeze([
  ["/", "Ringkasan Keuangan"],
  ["/transaksi", "Transaksi"],
  ["/alokasi", "Alokasi dana"],
  ["/tagihan", "Tagihan & jadwal"],
  ["/target", "Tabungan & target"],
  ["/laporan", "Laporan"],
  ["/rekening", "Rekening & kategori"],
  ["/pengaturan", "Pengaturan"],
]);

const secondaryRoutes = new Set(["/alokasi", "/tagihan", "/target", "/rekening", "/pengaturan"]);

const visibleExpression = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
})()`;

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

const navigateAndAssert = async (page, origin, pathname, expectedHeading, { mobile = true } = {}) => {
  await page.send("Page.navigate", { url: `${origin}${pathname}` });
  await waitForAppRoute(page, pathname, { heading: expectedHeading });
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
        alertCount: document.querySelectorAll(".financial-alert-list--mobile li").length,
      };
    })()`);
    assert.equal(dashboard.heading, "Ringkasan Keuangan");
    assert.equal(dashboard.dailySafeSpend, true);
    assert.equal(dashboard.unallocated, true);
    assert.equal(dashboard.privacy, true);
    assert.equal(dashboard.filter, true);
    assert.equal(dashboard.insights, true);
    assert.equal(dashboard.transaction, true);
    assert.ok(dashboard.alertCount >= 4, "Dashboard mobile harus mengekspos peringatan keuangan.");

    await page.evaluate("document.querySelector('.mobile-dashboard-filter-button').click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Filter transaksi dashboard'"),
      { description: "dialog filter dashboard mobile" },
    );
    assert.equal(await page.evaluate("Boolean(document.querySelector('[role=dialog] form'))"), true);
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

    await setViewport(page, 1440, 900);
    await navigateAndAssert(page, appServer.origin, "/", "Ringkasan Keuangan", { mobile: false });
    assert.equal(await page.evaluate(visibleExpression(".desktop-logout-button")), true, "Logout desktop harus terlihat.");
    assert.equal(await page.evaluate(visibleExpression(".dashboard-desktop button[aria-label*='nominal']")), true, "Privacy nominal harus tersedia pada desktop.");
    assert.equal(await page.evaluate(visibleExpression(".premium-filterbar .premium-select:nth-of-type(3)")), true, "Filter jenis transaksi harus tersedia pada desktop.");
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
    for (const [pathname, heading] of routeCases) {
      await navigateAndAssert(page, appServer.origin, pathname, heading, { mobile: true });
    }
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
    assert.equal(await page.evaluate(visibleExpression(".premium-filterbar .premium-select:nth-of-type(3)")), true, "Filter jenis tetap terlihat pada dashboard compact desktop.");
  } finally {
    await page?.close();
    await chromium?.close();
    await appServer?.close();
  }
});

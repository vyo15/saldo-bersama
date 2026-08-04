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
  ["/rekening", "Rekening"],
  ["/kategori", "Kategori transaksi"],
  ["/pengaturan", "Pengaturan"],
]);

const secondaryRoutes = new Set(["/alokasi", "/tagihan", "/target", "/rekening", "/kategori", "/pengaturan"]);

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

    await page.evaluate("document.querySelector('.mobile-navigation__more')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Menu lainnya'"),
      { description: "menu lainnya mobile" },
    );
    const mobileMenuGroups = await page.evaluate("[...document.querySelectorAll('.mobile-menu-section h3')].map((item) => item.textContent.trim())");
    assert.deepEqual(mobileMenuGroups, ["Perencanaan", "Kelola keuangan", "Aplikasi"]);
    const mobileMenuState = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const text = dialog?.textContent || '';
      return {
        themeDuplicate: Boolean(dialog?.querySelector('.mobile-menu-theme')) || /Dark mode|Light mode/i.test(text),
        logoutInFooter: Boolean(dialog?.querySelector('.mobile-menu-footer button')),
      };
    })()`);
    assert.equal(mobileMenuState.themeDuplicate, false, "Menu lainnya tidak boleh menduplikasi dark/light toggle.");
    assert.equal(mobileMenuState.logoutInFooter, true, "Logout mobile harus tersedia pada footer menu.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "menu lainnya ditutup" });

    await navigateAndAssert(page, appServer.origin, "/tagihan", "Tagihan & jadwal", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression(".two-column-grid")), true, "Grid tagihan mobile tidak boleh disembunyikan.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Tagihan periode ini') && document.body.textContent.includes('Penerimaan yang diharapkan')"), true, "Kedua capability tagihan harus dapat dijangkau pada mobile.");

    await navigateAndAssert(page, appServer.origin, "/laporan", "Laporan", { mobile: true });
    const visibleReportPanels = await page.evaluate(`(() => {
      const grid = document.querySelector('.report-chart-grid');
      if (!grid) return 0;
      return [...grid.children].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length;
    })()`);
    assert.ok(visibleReportPanels >= 7, `Chart laporan mobile harus terlihat, ditemukan ${visibleReportPanels} panel.`);

    await navigateAndAssert(page, appServer.origin, "/pengaturan", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression(".settings-section .two-column-grid")), true, "Anggota dan integrasi harus terlihat pada mobile.");
    await page.evaluate("document.querySelector('.owner-admin-section')?.setAttribute('open', '')");
    await waitFor(() => page.evaluate(visibleExpression(".owner-admin-grid")), { description: "administrasi owner mobile terlihat" });
    assert.equal(await page.evaluate("['Unduh Excel lengkap','Snapshot teknis ke Drive','Pulihkan backup teknis Turso','Aktivitas penting terbaru'].every((text) => document.body.textContent.includes(text))"), true, "Export, backup, restore, dan audit harus dapat dijangkau owner pada mobile.");

    await navigateAndAssert(page, appServer.origin, "/rekening", "Rekening", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression('button[aria-label="Tambah rekening"]')), true, "Owner mobile harus memiliki tombol tambah rekening.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Pribadi · Owner Browser') && document.body.textContent.includes('Pribadi · Member Browser')"), true, "Label pemilik rekening personal harus tampil transparan.");
    await waitFor(() => page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')];
      return cards.filter((card) => Number.parseFloat(getComputedStyle(card).opacity || '0') > 0.05).length >= Math.min(3, cards.length);
    })()`), { description: "tiga kartu rekening terlihat pada stack mobile" });
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]'))`), true, "Stack rekening mobile harus dapat dikendalikan dengan gesture dan keyboard.");
    assert.equal(await page.evaluate(`document.querySelectorAll('button[aria-label^="Pilih rekening"]').length`), 0, "Pagination carousel lama harus dihapus.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Riwayat dimuat hanya saat dibuka agar halaman rekening tetap ringan.')"), false, "Detail implementasi tidak boleh memenuhi halaman rekening.");
    await page.evaluate("document.querySelector('button[aria-label=\"Baca penjelasan rekonsiliasi\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Tentang rekonsiliasi'"),
      { description: "informasi rekonsiliasi" },
    );
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('transparansi bersama') || false"), true, "Informasi transparansi harus tetap tersedia melalui dialog.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "informasi rekonsiliasi ditutup" });
    await page.evaluate("document.querySelector('button[aria-label=\"Tambah rekening\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Tambah rekening'"),
      { description: "dialog tambah rekening" },
    );
    assert.equal(await page.evaluate("document.querySelectorAll('[role=dialog] [role=tab]').length"), 0, "Dialog rekening tidak boleh lagi mencampur tab kategori.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('[role=dialog] input[placeholder*=\"123456\"]'))"), true, "Form rekening harus menyediakan nomor rekening.");
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
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "dialog rekening ditutup" });

    await navigateAndAssert(page, appServer.origin, "/kategori", "Kategori transaksi", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression('button[aria-label="Tambah kategori"]')), true, "Owner harus memperoleh aksi kategori pada route khusus.");

    await setViewport(page, 1440, 900);
    await navigateAndAssert(page, appServer.origin, "/", "Ringkasan Keuangan", { mobile: false });
    assert.equal(await page.evaluate(visibleExpression(".desktop-logout-button")), true, "Logout desktop harus terlihat.");
    assert.equal(await page.evaluate("document.querySelectorAll('.desktop-module-dock__navigation > .desktop-module-dock__link').length"), 5, "Dock desktop harus ringkas menjadi lima kontrol utama.");
    const dockGeometry = await page.evaluate(`(() => {
      const dock = document.querySelector('.desktop-module-dock');
      const controls = [...document.querySelectorAll('.desktop-module-dock__navigation > .desktop-module-dock__link')];
      return {
        height: dock?.getBoundingClientRect().height || 0,
        minControl: Math.min(...controls.map((item) => Math.min(item.getBoundingClientRect().width, item.getBoundingClientRect().height))),
        usesCurvedMask: Boolean(dock?.querySelector('.desktop-module-dock__shape')),
      };
    })()`);
    assert.ok(dockGeometry.height >= 480, `Sidebar melengkung desktop harus diperbesar, ditemukan ${dockGeometry.height}px.`);
    assert.ok(dockGeometry.minControl >= 48, `Kontrol dock desktop minimal 48px, ditemukan ${dockGeometry.minControl}px.`);
    assert.equal(dockGeometry.usesCurvedMask, true, "Sidebar harus tetap memakai mask melengkung canonical.");
    await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Perencanaan\"]')?.click()");
    await waitFor(() => page.evaluate(visibleExpression(".desktop-module-dock__flyout")), { description: "flyout perencanaan" });
    assert.equal(await page.evaluate("document.querySelector('.desktop-module-dock__flyout')?.textContent?.includes('Alokasi') && document.querySelector('.desktop-module-dock__flyout')?.textContent?.includes('Tagihan') && document.querySelector('.desktop-module-dock__flyout')?.textContent?.includes('Target')"), true, "Flyout perencanaan harus memuat tiga route terkait.");
    assert.equal(await page.evaluate("document.querySelectorAll('.desktop-module-dock__flyout-link small').length"), 0, "Submenu desktop tidak boleh memakai deskripsi card-in-card.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('.desktop-module-dock__flyout-close[aria-label=\"Tutup menu Perencanaan\"]'))"), true, "Submenu harus memiliki tombol tutup aksesibel.");
    await page.evaluate("document.querySelector('.desktop-module-dock__flyout a[href=\"/alokasi\"]')?.click()");
    await waitForAppRoute(page, "/alokasi", { heading: "Alokasi dana" });
    assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Perencanaan\"]')?.classList.contains('is-active') || false"), true, "Parent Perencanaan harus aktif pada child route.");
    await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Kelola\"]')?.click()");
    await waitFor(() => page.evaluate(visibleExpression(".desktop-module-dock__flyout")), { description: "flyout kelola" });
    await page.evaluate("document.querySelector('.desktop-module-dock__flyout a[href=\"/rekening\"]')?.click()");
    await waitForAppRoute(page, "/rekening", { heading: "Rekening" });
    assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"Buka menu Kelola\"]')?.classList.contains('is-active') || false"), true, "Parent Kelola harus aktif pada child route.");
    await navigateAndAssert(page, appServer.origin, "/", "Ringkasan Keuangan", { mobile: false });
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
    await page.evaluate("document.querySelector('[data-dashboard-account=\"acc-shared-cash\"]')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[data-dashboard-account=\"acc-shared-cash\"]')?.getAttribute('aria-pressed') === 'true'"),
      { description: "rekening kas dipilih di dashboard" },
    );
    assert.equal(await page.evaluate("document.querySelectorAll('.shared-transaction-table tbody tr').length"), 1, "Daftar transaksi harus berubah mengikuti rekening yang dipilih.");
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
    await navigateAndAssert(page, appServer.origin, "/rekening", "Rekening", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('button[aria-label=\"Tambah rekening\"]'))"), false, "Member tidak boleh memperoleh aksi master data owner.");
    const memberTransparency = await page.evaluate(`(() => {
      const text = document.body.textContent || '';
      const partnerButton = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')].find((button) => button.textContent.includes('Tabungan Owner'));
      return { labelVisible: text.includes('Pribadi · Owner Browser'), partnerButton: Boolean(partnerButton) };
    })()`);
    assert.equal(memberTransparency.labelVisible, true, "Member harus melihat label rekening personal pasangan.");
    assert.equal(memberTransparency.partnerButton, true, "Member harus dapat membuka rekening personal pasangan dalam mode baca.");
    await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button[aria-label^="Lihat detail rekening"]')].find((item) => item.textContent.includes('Tabungan Owner'));
      button?.click();
    })()`);
    await waitFor(() => page.evaluate(visibleExpression('[aria-label^="Detail rekening"]')), { description: "detail rekening pasangan" });
    assert.equal(await page.evaluate("document.body.textContent.includes('Hanya lihat')"), true, "Rekening personal pasangan harus ditandai hanya lihat.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('[aria-label^=\"Aksi rekening\"] button'))"), false, "Member tidak boleh memperoleh aksi write untuk rekening personal pasangan.");
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

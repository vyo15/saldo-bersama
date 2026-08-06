import assert from "node:assert/strict";
import { test } from "node:test";
import { startBrowserAppServer, startChromium, openBrowserPage, setViewport, waitForAppRoute } from "./helpers/app-runtime.mjs";
import { waitFor } from "./helpers/cdp.mjs";
import { createAuthenticatedGatewayResponses, memberSession, ownerSession } from "./helpers/authenticated-fixture.mjs";

const routeCases = Object.freeze([
  ["/", "Ringkasan Keuangan"],
  ["/transaksi", "Transaksi"],
  ["/anggaran", "Anggaran"],
  ["/alokasi", "Alokasi dana"],
  ["/tagihan", "Jadwal rutin"],
  ["/target", "Tabungan & target"],
  ["/laporan", "Laporan"],
  ["/rekening", "Rekening"],
  ["/rekonsiliasi", "Rekonsiliasi"],
  ["/kategori", "Kategori transaksi"],
  ["/pengaturan", "Pengaturan"],
]);

const secondaryRoutes = new Set(["/anggaran", "/alokasi", "/tagihan", "/target", "/rekening", "/rekonsiliasi", "/kategori", "/pengaturan"]);

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
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "menu lainnya ditutup" });

    await navigateAndAssert(page, appServer.origin, "/tagihan", "Jadwal rutin", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression(".two-column-grid")), true, "Grid jadwal rutin mobile tidak boleh disembunyikan.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Tagihan periode ini') && document.body.textContent.includes('Penerimaan yang diharapkan')"), true, "Tagihan dan pemasukan rutin harus dapat dijangkau pada mobile.");

    await navigateAndAssert(page, appServer.origin, "/anggaran", "Anggaran", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression("#budget-form")), true, "Owner harus dapat mengelola anggaran periode aktif.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Anggaran dan pengeluaran aktual') && document.body.textContent.includes('Simpan anggaran')"), true, "Pemantauan dan form Anggaran harus tersedia pada route terpisah.");

    await navigateAndAssert(page, appServer.origin, "/laporan", "Laporan", { mobile: true });
    assert.equal(await page.evaluate("!document.body.textContent.includes('Simpan anggaran') && !document.body.textContent.includes('Arsipkan anggaran')"), true, "Laporan tidak boleh memuat mutation anggaran.");
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
    assert.equal(await page.evaluate("document.body.textContent.includes('Database tersambung · schema v6')"), true, "Status backend harus memakai kontrak system.health aktual.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Degraded')"), false, "Status backend siap tidak boleh salah ditampilkan sebagai Degraded.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('a[href=\"/pengaturan/notifikasi\"]')) && Boolean(document.querySelector('a[href=\"/pengaturan/anggota\"]'))"), true, "Owner harus memperoleh navigasi internal Pengaturan.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan/notifikasi", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('#notification-settings-title')) && document.body.textContent.includes('Notifikasi perangkat')"), true, "Notifikasi perangkat harus berada pada route khusus.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Uji notifikasi')"), false, "Verifikasi notifikasi harus otomatis tanpa tombol uji terpisah.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan/integrasi", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("document.querySelectorAll('h3').length >= 2 && document.body.textContent.includes('Google Sheets') && document.body.textContent.includes('Google Calendar')"), true, "Sheets dan Calendar harus tampil satu kali pada route integrasi.");

    await navigateAndAssert(page, appServer.origin, "/pengaturan/anggota", "Pengaturan", { mobile: true });
    assert.equal(await page.evaluate("Boolean(document.querySelector('#members-settings-title')) && document.body.textContent.includes('Tambah atau ubah akses') && document.body.textContent.includes('Pengguna aplikasi')"), true, "Form akses dan daftar pengguna harus dipisahkan.");

    for (const [path, expected] of [
      ["/pengaturan/export", "Unduh salinan Excel lengkap"],
      ["/pengaturan/backup", "Snapshot terverifikasi ke Google Drive"],
      ["/pengaturan/pemulihan", "Pulihkan item arsip atau backup teknis"],
      ["/pengaturan/audit", "Aktivitas penting terbaru"],
    ]) {
      await navigateAndAssert(page, appServer.origin, path, "Pengaturan", { mobile: true });
      assert.equal(
        await page.evaluate(`document.body.textContent.includes(${JSON.stringify(expected)})`),
        true,
        `${expected} harus dapat dijangkau pada route Pengaturan terpisah.`,
      );
    }

    await navigateAndAssert(page, appServer.origin, "/rekening", "Rekening", { mobile: true });
    assert.equal(await page.evaluate(visibleExpression('button[aria-label="Tambah rekening"]')), true, "Owner mobile harus memiliki tombol tambah rekening.");
    assert.equal(await page.evaluate("document.body.textContent.includes('Pribadi · Owner Browser') && document.body.textContent.includes('Pribadi · Member Browser')"), true, "Label pemilik rekening personal harus tampil transparan.");

    await setViewport(page, 351, 590);
    await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
    await new Promise((resolve) => setTimeout(resolve, 120));
    const accountFullScreenState = await page.evaluate(`(() => {
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
        contentColor: contentStyle?.color || '',
      };
    })()`);
    assert.ok(accountFullScreenState.shellHeight >= accountFullScreenState.viewportHeight - 1, "Shell Rekening harus memenuhi dynamic viewport pada layar pendek.");
    assert.notEqual(accountFullScreenState.contentBackground, "none", "Area aman di bawah konten Rekening harus memiliki background route.");
    assert.equal(accountFullScreenState.contentBackground, accountFullScreenState.experienceBackground, "Background Rekening harus berlanjut sampai ruang aman sebelum navigasi.");
    assert.ok(accountFullScreenState.reservedGap >= -1 && accountFullScreenState.reservedGap <= 20, `Ruang aman sebelum navigasi harus tetap terkontrol, ditemukan ${accountFullScreenState.reservedGap}px.`);
    assert.match(accountFullScreenState.contentColor, /rgb\(255, 255, 255\)/, "State loading atau notice pada route Rekening harus tetap terbaca di atas surface gelap.");
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
    await page.evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Pembayaran keluar')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Pembayaran keluar'"),
      { description: "pembayaran keluar rekening aktif" },
    );
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Belanja makan mingguan') || false"), true, "Daftar harus memuat pengeluaran dari rekening aktif.");
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Isi kas bersama') || false"), true, "Transfer keluar dari rekening aktif harus masuk daftar pembayaran.");
    assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Gaji bulan Agustus') || false"), false, "Pemasukan tidak boleh dicampur ke pembayaran keluar.");
    await page.evaluate("document.querySelector('[role=dialog] button[aria-label=\"Tutup dialog\"]')?.click()");
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "pembayaran keluar ditutup" });
    assert.equal(await page.evaluate("document.body.textContent.includes('Riwayat dimuat hanya saat dibuka agar halaman rekening tetap ringan.')"), false, "Detail implementasi tidak boleh memenuhi halaman rekening.");
    assert.equal(await page.evaluate("Boolean(document.querySelector('button[aria-label=\"Baca penjelasan rekonsiliasi\"]'))"), false, "Penjelasan rekonsiliasi tidak boleh tetap tersebar di halaman Rekening.");
    await navigateAndAssert(page, appServer.origin, "/rekonsiliasi", "Rekonsiliasi", { mobile: true });
    assert.equal(await page.evaluate("document.body.textContent.includes('Cocokkan saldo sistem dengan saldo aktual')"), true, "Route Rekonsiliasi harus menjelaskan tujuan proses tanpa menyembunyikan selisih saldo.");
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
      const navigation = document.querySelector('.mobile-navigation');
      const pageRect = page?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      const navigationRect = navigation?.getBoundingClientRect();
      return {
        pageHeight: pageRect?.height || 0,
        availableHeight: contentRect && navigationRect ? Math.max(0, navigationRect.top - contentRect.top - 16) : 0,
      };
    })()`);
    assert.ok(notFoundState.pageHeight >= notFoundState.availableHeight - 2, "Halaman 404 harus memenuhi area konten yang tersedia tanpa gap vertikal besar.");

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
      await page.evaluate("document.body.textContent.includes('Pribadi · Owner Browser')"),
      true,
      "Member harus melihat label rekening personal pasangan.",
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
      () => page.evaluate("document.querySelector('[id=\"mobile-account-stack-title\"]')?.textContent?.trim() === 'Tabungan Owner'"),
      { description: "rekening pasangan menjadi kartu aktif" },
    );
    await page.evaluate("document.querySelector('button[aria-label=\"Lihat detail rekening Tabungan Owner\"][aria-pressed=\"true\"]')?.click()");
    await waitFor(() => page.evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Saldo saat ini') || false"), { description: "detail rekening pasangan" });
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
    assert.equal(await page.evaluate(visibleExpression(".shared-transaction-tools label:nth-child(3) select")), true, "Filter jenis tetap terlihat pada dashboard compact desktop.");
  } finally {
    await page?.close();
    await chromium?.close();
    await appServer?.close();
  }
});

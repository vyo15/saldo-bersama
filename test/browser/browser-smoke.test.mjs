import assert from "node:assert/strict";
import { test } from "node:test";
import { openBrowserPage, setViewport, startBrowserAppServer, startChromium } from "./helpers/app-runtime.mjs";
import { waitFor } from "./helpers/cdp.mjs";

const accessibilitySnapshot = (nodes) => nodes
  .filter((node) => !node.ignored)
  .map((node) => ({
    role: node.role?.value || "",
    name: node.name?.value || "",
  }));

await test("browser smoke: route privat redirect ke login dan layout mobile tetap aksesibel", { timeout: 45_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    appServer = await startBrowserAppServer();
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/transaksi`, { googleLoginMock: true });
    await waitFor(
      () => page.evaluate("location.pathname === '/login'"),
      { description: "redirect unauthenticated ke /login" },
    );
    const configurationError = await page.evaluate(`(() => {
      const alerts = [...document.querySelectorAll("[role='alert']")];
      const alert = alerts.find((element) => /Konfigurasi belum lengkap/i.test(element.textContent || ""));
      return alert?.textContent?.replace(/\s+/g, " ").trim() || "";
    })()`);
    assert.equal(
      configurationError,
      "",
      `Build browser smoke harus menyediakan public test env VITE_GOOGLE_CLIENT_ID dan VITE_FIREBASE_API_KEY: ${configurationError}`,
    );
    assert.equal(
      await page.evaluate("window.google?.accounts?.id?.__saldoBersamaSmokeMock === true"),
      true,
      "Browser smoke harus memakai mock Google Identity lokal, bukan script provider eksternal.",
    );
    assert.equal(
      await page.evaluate("Boolean(document.querySelector('.login-mobile-stage'))"),
      true,
      "Viewport smoke 390px harus memakai onboarding mobile interaktif.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-slide').length"),
      4,
      "Login mobile harus memiliki tiga onboarding dan halaman login khusus sebagai halaman keempat.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-hero').length"),
      3,
      "Tiga halaman onboarding harus memakai hero card clean, sedangkan halaman keempat tetap login canonical.",
    );
    const onboardingGeometry = await page.evaluate(`(() => [...document.querySelectorAll('.login-mobile-onboarding-slide')].map((slide) => {
      const hero = slide.querySelector('.login-mobile-hero')?.getBoundingClientRect();
      const copy = slide.querySelector('.login-mobile-copy')?.getBoundingClientRect();
      const assets = [...slide.querySelectorAll('.login-mobile-asset')].map((asset) => asset.getBoundingClientRect());
      return {
        heroBottom: Math.round(hero?.bottom || 0),
        copyTop: Math.round(copy?.top || 0),
        assetOutsideHero: assets.some((asset) => asset.top < hero.top - 1 || asset.bottom > hero.bottom + 1),
      };
    }))()`);
    assert.equal(onboardingGeometry.every((item) => item.heroBottom <= item.copyTop + 1), true, "Hero onboarding tidak boleh meniban area copy.");
    assert.equal(onboardingGeometry.every((item) => !item.assetOutsideHero), true, "Aset onboarding harus tetap berada di dalam hero card.");
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-pills').length"),
      0,
      "Onboarding final tidak memakai pill fitur tambahan di bawah deskripsi.",
    );

    await waitFor(
      () => page.evaluate("Boolean(document.querySelector('.login-mobile-login-slide:not(.is-active) .google-login-button button'))"),
      { timeoutMs: 3_000, description: "Google button dipreload saat halaman login masih off-screen" },
    );
    await page.evaluate(`(() => {
      const host = document.querySelector('.login-mobile-login-slide .google-login-button');
      const button = host?.querySelector('button');
      if (!host || !button) return false;
      const finalFrame = document.createElement('iframe');
      finalFrame.hidden = true;
      finalFrame.dataset.googleFinalMock = 'true';
      finalFrame.dataset.preloadSentinel = 'stable';
      host.append(finalFrame);
      return true;
    })()`);
    await page.evaluate("document.querySelector('iframe[data-google-final-mock=\"true\"]')?.dispatchEvent(new Event('load'))");
    await waitFor(
      () => page.evaluate("document.querySelector('.login-mobile-login-slide .google-login-button')?.classList.contains('is-ready') === true"),
      { timeoutMs: 3_000, description: "provider Google final siap sebelum halaman login dibuka" },
    );

    await setViewport(page, 360, 667);
    await waitFor(
      () => page.evaluate("document.querySelector('.login-mobile-stage')?.clientHeight === 667"),
      { timeoutMs: 3_000, description: "viewport mobile pendek diterapkan" },
    );
    const oneScreenOnboarding = await page.evaluate(`(() => [...document.querySelectorAll('.login-mobile-onboarding-slide')].map((slide) => ({
      clientHeight: slide.clientHeight,
      scrollHeight: slide.scrollHeight,
      overflowY: getComputedStyle(slide).overflowY,
      copyBottom: Math.round(slide.querySelector('.login-mobile-copy')?.getBoundingClientRect().bottom || 0),
      slideBottom: Math.round(slide.getBoundingClientRect().bottom || 0),
    })))()`);
    assert.equal(oneScreenOnboarding.every((item) => item.overflowY === "hidden"), true, "Onboarding mobile tidak boleh memiliki scroll vertikal internal.");
    assert.equal(oneScreenOnboarding.every((item) => item.scrollHeight <= item.clientHeight + 1), true, `Konten onboarding harus muat dalam satu layar pendek: ${JSON.stringify(oneScreenOnboarding)}`);
    assert.equal(oneScreenOnboarding.every((item) => item.copyBottom <= item.slideBottom + 1), true, `Copy onboarding tidak boleh terpotong: ${JSON.stringify(oneScreenOnboarding)}`);

    for (let expectedPage = 2; expectedPage <= 3; expectedPage += 1) {
      await page.evaluate("document.querySelector('.login-mobile-next')?.click()");
      await waitFor(
        () => page.evaluate(`document.querySelector('.login-mobile-progress small')?.textContent?.trim() === '${expectedPage} / 4'`),
        { timeoutMs: 3_000, description: `onboarding berpindah ke halaman ${expectedPage}` },
      );
    }
    await page.evaluate("document.querySelector('.login-mobile-next')?.click()");
    await waitFor(
      () => page.evaluate("document.querySelector('.login-mobile-login-slide')?.classList.contains('is-active') === true && !document.querySelector('.login-mobile-progress')"),
      { timeoutMs: 3_000, description: "halaman login aktif tanpa progress bar" },
    );
    await waitFor(
      () => page.evaluate("Boolean(document.querySelector('.google-login-button button, .google-login-button iframe'))"),
      { timeoutMs: 5_000, description: "widget login Google final sudah tersedia saat onboarding selesai" },
    );
    assert.equal(
      await page.evaluate("document.querySelector('.google-login-button iframe[data-google-final-mock=\"true\"]')?.dataset.preloadSentinel"),
      "stable",
      "Perpindahan onboarding ke login tidak boleh merender ulang iframe Google final yang sudah dipreload.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-provider .google-login-button button').length"),
      0,
      "Placeholder button Google inline harus dibuang setelah iframe final selesai load agar tidak tampil dobel.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-provider__preparing').length"),
      0,
      "State Menyiapkan login tidak boleh terlihat bila provider sudah siap sebelum halaman 4 dibuka.",
    );

    const result = await page.evaluate(`(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const nameOf = (element) => (
        element.getAttribute("aria-label")
        || element.getAttribute("title")
        || element.textContent
        || element.value
        || ""
      ).trim();
      const interactive = [...document.querySelectorAll("button, a[href], input, select, textarea, [role='button']")]
        .filter(visible);
      const providerContainers = [...document.querySelectorAll(".google-login-button")].filter(visible);
      const providerControls = interactive.filter((element) => element.closest(".google-login-button"));
      const applicationControls = interactive.filter((element) => !element.closest(".google-login-button"));
      const dimensionsOf = (element) => {
        const rect = element.getBoundingClientRect();
        return { name: nameOf(element), width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      return {
        pathname: location.pathname,
        title: document.querySelector("h1")?.textContent?.trim() || "",
        mainCount: document.querySelectorAll("main").length,
        h1Count: document.querySelectorAll("h1").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        unnamedControls: interactive.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 160)),
        undersizedControls: applicationControls
          .map(dimensionsOf)
          .filter((item) => item.width < 44 || item.height < 44),
        providerContainers: providerContainers.map(dimensionsOf),
        undersizedProviderControls: providerControls
          .map(dimensionsOf)
          .filter((item) => item.width < 24 || item.height < 24),
        alerts: [...document.querySelectorAll("[role='alert']")].map((element) => element.textContent.trim()),
      };
    })()`);

    assert.equal(result.pathname, "/login");
    assert.equal(result.title, "Saldo Bersama");
    assert.equal(result.mainCount, 1, "Halaman harus mempunyai satu landmark main.");
    assert.equal(result.h1Count, 1, "Halaman harus mempunyai satu heading utama.");
    assert.ok(result.overflow <= 1, `Layout mobile tidak boleh overflow horizontal (${result.overflow}px).`);
    assert.deepEqual(result.unnamedControls, [], "Semua kontrol terlihat harus mempunyai accessible name.");
    assert.deepEqual(result.undersizedControls, [], `Kontrol aplikasi harus mempunyai target sentuh minimum 44px: ${JSON.stringify(result.undersizedControls)}`);
    assert.equal(result.providerContainers.length, 1, "Host widget login Google harus tersedia tepat satu kali.");
    assert.ok(
      result.providerContainers.every((item) => item.width >= 44 && item.height >= 44),
      `Host widget pihak ketiga harus menyediakan area layout minimum 44px: ${JSON.stringify(result.providerContainers)}`,
    );
    assert.deepEqual(
      result.undersizedProviderControls,
      [],
      `Kontrol provider-managed tetap harus memenuhi minimum 24px: ${JSON.stringify(result.undersizedProviderControls)}`,
    );
    assert.deepEqual(result.alerts, [], "Login smoke tidak boleh menampilkan error konfigurasi/runtime.");
    const loginFit = await page.evaluate(`(() => {
      const slide = document.querySelector('.login-mobile-login-slide');
      const provider = document.querySelector('.login-mobile-provider');
      const host = document.querySelector('.google-login-button');
      const slideRect = slide?.getBoundingClientRect();
      const providerRect = provider?.getBoundingClientRect();
      const hostRect = host?.getBoundingClientRect();
      return {
        clientHeight: slide?.clientHeight || 0,
        scrollHeight: slide?.scrollHeight || 0,
        overflowY: slide ? getComputedStyle(slide).overflowY : '',
        providerInside: Boolean(slideRect && providerRect && providerRect.left >= slideRect.left - 1 && providerRect.right <= slideRect.right + 1),
        hostInside: Boolean(slideRect && hostRect && hostRect.left >= slideRect.left - 1 && hostRect.right <= slideRect.right + 1),
        welcomeHasDecoration: Boolean(document.querySelector('.login-mobile-login-content .login-mobile-eyebrow')),
        progressVisible: Boolean(document.querySelector('.login-mobile-progress')),
        backVisible: Boolean(document.querySelector('.login-mobile-back')),
        providerHostWidth: Math.round(hostRect?.width || 0),
      };
    })()`);
    assert.equal(loginFit.overflowY, "hidden", "Halaman login mobile tidak boleh memiliki scroll vertikal internal.");
    assert.ok(loginFit.scrollHeight <= loginFit.clientHeight + 1, `Halaman login harus muat dalam satu layar: ${JSON.stringify(loginFit)}`);
    assert.equal(loginFit.providerInside, true, `Provider Google harus berada penuh di dalam slide: ${JSON.stringify(loginFit)}`);
    assert.equal(loginFit.hostInside, true, `Host Google tidak boleh terpotong: ${JSON.stringify(loginFit)}`);
    assert.equal(loginFit.welcomeHasDecoration, false, "Selamat datang pada halaman login tidak memakai eyebrow bergaris.");
    assert.equal(loginFit.progressVisible, false, "Progress bar onboarding tidak tampil pada halaman login.");
    assert.equal(loginFit.backVisible, false, "Tombol kembali onboarding tidak tampil pada halaman login.");
    assert.ok(loginFit.providerHostWidth >= 200 && loginFit.providerHostWidth <= 300, `Host Google mobile harus responsif 200-300px untuk tombol medium generic tanpa clipping: ${JSON.stringify(loginFit)}`);

    const { nodes } = await page.send("Accessibility.getFullAXTree");
    const snapshot = accessibilitySnapshot(nodes);
    assert.ok(snapshot.some((node) => node.role === "main"), "Accessibility tree harus memiliki main landmark.");
    assert.ok(snapshot.some((node) => node.role === "heading" && node.name === result.title), "Heading utama harus terbaca di accessibility tree.");
    assert.ok(snapshot.some((node) => node.role === "button" && /Google/i.test(node.name)), "Tombol login Google harus terbaca di accessibility tree.");
  } finally {
    await chromium?.close();
    await page?.close();
    await appServer?.close();
  }
});

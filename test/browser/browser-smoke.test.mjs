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
      `Build browser smoke harus menyediakan public test env VITE_GOOGLE_CLIENT_ID, VITE_FIREBASE_API_KEY, dan VITE_FIREBASE_AUTH_DOMAIN: ${configurationError}`,
    );
    assert.equal(
      await page.evaluate("window.google?.accounts?.id?.__saldoBersamaSmokeMock === true"),
      true,
      "Browser smoke tetap memakai mock Google Identity lokal untuk jalur desktop, bukan script provider eksternal.",
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
      "Tiga halaman onboarding harus memakai hero card clean, sedangkan halaman keempat tetap login khusus.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-provider, .login-mobile-login-slide .google-login-button, .login-mobile-login-slide iframe').length"),
      0,
      "Login mobile tidak boleh merender host atau iframe Google Identity Services.",
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
      () => page.evaluate("Boolean(document.querySelector('.login-mobile-google-button'))"),
      { timeoutMs: 3_000, description: "tombol Google custom tersedia pada halaman login" },
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
      const dimensionsOf = (element) => {
        const rect = element.getBoundingClientRect();
        return { name: nameOf(element), width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      const loginButton = document.querySelector('.login-mobile-google-button');
      return {
        pathname: location.pathname,
        title: document.querySelector("h1")?.textContent?.trim() || "",
        mainCount: document.querySelectorAll("main").length,
        h1Count: document.querySelectorAll("h1").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        unnamedControls: interactive.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 160)),
        undersizedControls: interactive
          .map(dimensionsOf)
          .filter((item) => item.width < 44 || item.height < 44),
        loginButton: loginButton ? dimensionsOf(loginButton) : null,
        loginButtonCount: document.querySelectorAll('.login-mobile-google-button').length,
        mobileGisCount: document.querySelectorAll('.login-mobile-login-slide .google-login-button, .login-mobile-login-slide iframe').length,
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
    assert.equal(result.loginButtonCount, 1, "Halaman mobile harus mempunyai tepat satu tombol Google custom.");
    assert.ok(result.loginButton?.width >= 200 && result.loginButton?.width <= 320, `Tombol Google custom harus responsif dan tidak terlalu lebar: ${JSON.stringify(result.loginButton)}`);
    assert.ok(result.loginButton?.height >= 44, `Tombol Google custom harus mempunyai target sentuh minimum 44px: ${JSON.stringify(result.loginButton)}`);
    assert.equal(result.mobileGisCount, 0, "Mobile tidak boleh menghidupkan kembali iframe Google Identity Services.");
    assert.deepEqual(result.alerts, [], "Login smoke tidak boleh menampilkan error konfigurasi/runtime.");

    const loginFit = await page.evaluate(`(() => {
      const slide = document.querySelector('.login-mobile-login-slide');
      const button = document.querySelector('.login-mobile-google-button');
      const slideRect = slide?.getBoundingClientRect();
      const buttonRect = button?.getBoundingClientRect();
      return {
        clientHeight: slide?.clientHeight || 0,
        scrollHeight: slide?.scrollHeight || 0,
        overflowY: slide ? getComputedStyle(slide).overflowY : '',
        buttonInside: Boolean(slideRect && buttonRect && buttonRect.left >= slideRect.left - 1 && buttonRect.right <= slideRect.right + 1),
        welcomeHasDecoration: Boolean(document.querySelector('.login-mobile-login-content .login-mobile-eyebrow')),
        progressVisible: Boolean(document.querySelector('.login-mobile-progress')),
        backVisible: Boolean(document.querySelector('.login-mobile-back')),
      };
    })()`);
    assert.equal(loginFit.overflowY, "hidden", "Halaman login mobile tidak boleh memiliki scroll vertikal internal.");
    assert.ok(loginFit.scrollHeight <= loginFit.clientHeight + 1, `Halaman login harus muat dalam satu layar: ${JSON.stringify(loginFit)}`);
    assert.equal(loginFit.buttonInside, true, `Tombol Google custom harus berada penuh di dalam slide: ${JSON.stringify(loginFit)}`);
    assert.equal(loginFit.welcomeHasDecoration, false, "Selamat datang pada halaman login tidak memakai eyebrow bergaris.");
    assert.equal(loginFit.progressVisible, false, "Progress bar onboarding tidak tampil pada halaman login.");
    assert.equal(loginFit.backVisible, false, "Tombol kembali onboarding tidak tampil pada halaman login.");

    const { nodes } = await page.send("Accessibility.getFullAXTree");
    const snapshot = accessibilitySnapshot(nodes);
    assert.ok(snapshot.some((node) => node.role === "main"), "Accessibility tree harus memiliki main landmark.");
    assert.ok(snapshot.some((node) => node.role === "heading" && node.name === result.title), "Heading utama harus terbaca di accessibility tree.");
    assert.ok(snapshot.some((node) => node.role === "button" && /Google/i.test(node.name)), "Tombol login Google custom harus terbaca di accessibility tree.");
  } finally {
    await chromium?.close();
    await page?.close();
    await appServer?.close();
  }
});

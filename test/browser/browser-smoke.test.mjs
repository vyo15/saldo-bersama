import assert from "node:assert/strict";
import { test } from "node:test";
import { openBrowserPage, startBrowserAppServer, startChromium } from "./helpers/app-runtime.mjs";
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
      "Viewport smoke 390px harus memakai onboarding mobile artwork-first.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-slide').length"),
      3,
      "Login mobile harus memiliki dua onboarding dan slide login sebagai slide ketiga.",
    );
    await page.evaluate("document.querySelector('.login-mobile-slide:nth-child(1) .login-mobile-next')?.click()");
    await page.evaluate("document.querySelector('.login-mobile-slide:nth-child(2) .login-mobile-next')?.click()");
    await waitFor(
      () => page.evaluate("Boolean(document.querySelector('.google-login-button button, .google-login-button iframe'))"),
      { timeoutMs: 5_000, description: "widget login Google mock selesai dirender setelah onboarding" },
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

import assert from "node:assert/strict";
import { test } from "node:test";
import { startBrowserAppServer, startChromium, openBrowserPage, waitForAppRoute } from "./helpers/app-runtime.mjs";
import { waitFor } from "./helpers/cdp.mjs";
import { createAuthenticatedGatewayResponses, ownerSession } from "./helpers/authenticated-fixture.mjs";

await test("double-click create target pada network lambat hanya menghasilkan satu mutation intent", { timeout: 45_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  let createCalls = 0;
  const idempotencyKeys = [];
  try {
    const responses = createAuthenticatedGatewayResponses(ownerSession);
    responses["goals.create"] = async (_payload, body) => {
      createCalls += 1;
      idempotencyKeys.push(body.idempotencyKey || "");
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { goal_id: "goal-browser-double-click", row_version: 1 };
    };
    appServer = await startBrowserAppServer({ session: ownerSession, gatewayResponses: responses });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/target`, { width: 1280, height: 900 });
    await waitForAppRoute(page, "/target", { heading: "Tabungan & target" });

    const filled = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Buat target');
      const form = button?.closest('form');
      if (!form) return false;
      const inputs = form.querySelectorAll('input');
      const name = [...inputs].find((input) => input.type === 'text');
      const amount = form.querySelector('#goal-target');
      const date = form.querySelector('input[type="date"]');
      const account = form.querySelector('select[required]');
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (!name || !amount || !date || !account || !inputSetter || !selectSetter) return false;
      const setInput = (element, value) => {
        inputSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setInput(name, 'Target anti double click');
      setInput(amount, '1000000');
      setInput(date, '2026-12-31');
      const accountOption = [...account.options].find((option) => option.value);
      if (!accountOption) return false;
      selectSetter.call(account, accountOption.value);
      account.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(filled, true, "Form target fixture harus dapat diisi secara deterministik.");

    await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Buat target');
      button?.click();
      button?.click();
    })()`);

    await waitFor(
      () => page.evaluate("document.body.textContent.includes('Target keuangan berhasil dibuat.')"),
      { timeoutMs: 5_000, description: "target selesai dibuat" },
    );
    assert.equal(createCalls, 1, "Double click tidak boleh menghasilkan dua request goals.create.");
    assert.equal(idempotencyKeys.length, 1);
    assert.ok(idempotencyKeys[0], "Mutation harus membawa idempotency key.");
  } finally {
    await chromium?.close?.().catch(() => {});
    await page?.close?.().catch(() => {});
    await appServer?.close?.().catch(() => {});
  }
});

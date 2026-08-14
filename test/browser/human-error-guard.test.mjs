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

    const opened = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Buat target' && !item.hasAttribute('form'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert.equal(opened, true, "Aksi Buat target harus membuka modal create.");
    await waitFor(() => page.evaluate("Boolean(document.querySelector('#goal-create-form'))"), { description: "modal create target" });

    const filled = await page.evaluate(`(() => {
      const form = document.querySelector('#goal-create-form');
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
      const button = document.querySelector('button[form="goal-create-form"]');
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

await test("confirmation modal mempertahankan alasan, frasa, checkbox, countdown, lalu reset saat dibuka ulang", { timeout: 45_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    const responses = createAuthenticatedGatewayResponses(ownerSession);
    responses["accounts.previewLifecycle"] = {
      currentBalance: 0,
      initialBalance: 0,
      dependencies: { transactions: 0, reconciliations: 0, envelopes: 0, recurring: 0, goals: 0 },
      canArchive: true,
      canDeleteUnused: true,
      archiveBlockers: [],
      deleteBlockers: [],
      deleteConfirmation: "HAPUS REKENING REKENING BERSAMA · BNI",
    };
    appServer = await startBrowserAppServer({ session: ownerSession, gatewayResponses: responses });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/rekening`, { width: 1280, height: 900 });
    await waitForAppRoute(page, "/rekening", { heading: "Rekening" });

    const openDeleteConfirmation = async () => {
      await waitFor(
        () => page.evaluate(`(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Hapus / Arsipkan');
          if (!button || button.disabled) return false;
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        })()`),
        { description: "aksi lifecycle rekening desktop owner selesai lazy-load" },
      );
      const clicked = await page.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Hapus / Arsipkan');
        if (!button) return false;
        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, "Aksi lifecycle rekening harus tersedia pada desktop owner.");
      await waitFor(
        () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Hapus rekening belum dipakai?'"),
        { description: "modal hapus rekening belum dipakai" },
      );
    };

    await openDeleteConfirmation();
    const initialCountdown = await page.evaluate(`(() => {
      const text = [...document.querySelectorAll('[role=status]')].map((item) => item.textContent || '').find((value) => value.includes('Konfirmasi aktif dalam')) || '';
      return Number(text.match(/(\\d+) detik/)?.[1] || 0);
    })()`);
    assert.ok(initialCountdown > 0, "Countdown destructive confirmation harus aktif saat modal dibuka.");

    const filled = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const reason = dialog?.querySelector('textarea');
      const confirmation = dialog?.querySelector('input:not([type="checkbox"])');
      const acknowledgement = dialog?.querySelector('input[type="checkbox"]');
      const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      if (!reason || !confirmation || !acknowledgement || !textareaSetter || !inputSetter || !checkedSetter) return false;
      textareaSetter.call(reason, 'Fixture alasan hapus rekening');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
      reason.dispatchEvent(new Event('change', { bubbles: true }));
      inputSetter.call(confirmation, confirmation.placeholder);
      confirmation.dispatchEvent(new Event('input', { bubbles: true }));
      confirmation.dispatchEvent(new Event('change', { bubbles: true }));
      checkedSetter.call(acknowledgement, true);
      acknowledgement.dispatchEvent(new Event('input', { bubbles: true }));
      acknowledgement.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(filled, true, "Field destructive confirmation harus dapat diisi secara deterministik.");

    await new Promise((resolve) => setTimeout(resolve, 250));
    const persisted = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const reason = dialog?.querySelector('textarea');
      const confirmation = dialog?.querySelector('input:not([type="checkbox"])');
      const acknowledgement = dialog?.querySelector('input[type="checkbox"]');
      return {
        reason: reason?.value || '',
        confirmation: confirmation?.value || '',
        expectedConfirmation: confirmation?.placeholder || '',
        acknowledged: Boolean(acknowledgement?.checked),
      };
    })()`);
    assert.equal(persisted.reason, "Fixture alasan hapus rekening", "Textarea alasan tidak boleh di-reset saat controlled state menyebabkan render ulang.");
    assert.equal(persisted.confirmation, persisted.expectedConfirmation, "Frasa konfirmasi tidak boleh di-reset saat controlled state menyebabkan render ulang.");
    assert.equal(persisted.acknowledged, true, "Checkbox acknowledgement tidak boleh kembali false setelah render ulang.");

    await waitFor(async () => {
      const remaining = await page.evaluate(`(() => {
        const text = [...document.querySelectorAll('[role=status]')].map((item) => item.textContent || '').find((value) => value.includes('Konfirmasi aktif dalam')) || '';
        return Number(text.match(/(\\d+) detik/)?.[1] || 0);
      })()`);
      return remaining >= 0 && remaining < initialCountdown;
    }, { timeoutMs: 2_500, description: "countdown confirmation tetap berjalan setelah field diedit" });

    await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      [...(dialog?.querySelectorAll('button') || [])].find((item) => item.textContent.trim() === 'Batal')?.click();
    })()`);
    await waitFor(() => page.evaluate("!document.querySelector('[role=dialog]')"), { description: "confirmation modal ditutup" });

    await openDeleteConfirmation();
    await waitFor(
      () => page.evaluate(`(() => {
        const dialog = document.querySelector('[role=dialog]');
        return (dialog?.querySelector('textarea')?.value || '') === ''
          && (dialog?.querySelector('input:not([type="checkbox"])')?.value || '') === ''
          && !dialog?.querySelector('input[type="checkbox"]')?.checked;
      })()`),
      { description: "state confirmation di-reset saat modal dibuka ulang" },
    );
    const resetState = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      return {
        reason: dialog?.querySelector('textarea')?.value || '',
        confirmation: dialog?.querySelector('input:not([type="checkbox"])')?.value || '',
        acknowledged: Boolean(dialog?.querySelector('input[type="checkbox"]')?.checked),
      };
    })()`);
    assert.deepEqual(resetState, { reason: "", confirmation: "", acknowledged: false }, "State confirmation harus bersih hanya saat modal dibuka sebagai intent baru.");
  } finally {
    await chromium?.close?.().catch(() => {});
    await page?.close?.().catch(() => {});
    await appServer?.close?.().catch(() => {});
  }
});

await test("checklist bersihkan data testing interaktif, tidak reset saat dicentang, dan tetap gated oleh frasa", { timeout: 45_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    const responses = createAuthenticatedGatewayResponses(ownerSession);
    appServer = await startBrowserAppServer({ session: ownerSession, gatewayResponses: responses });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/pengaturan/reset-data`, { width: 390, height: 844 });
    await waitForAppRoute(page, "/pengaturan/reset-data", { heading: "Pengaturan" });

    await waitFor(
      () => page.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Periksa data testing');
        return Boolean(button && !button.disabled);
      })()`),
      { description: "status reset awal terverifikasi" },
    );
    await page.evaluate(`[...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Periksa data testing')?.click()`);
    await waitFor(
      () => page.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Bersihkan data testing');
        return Boolean(button && !button.disabled);
      })()`),
      { description: "preview reset dan safety backup siap" },
    );
    await page.evaluate(`[...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Bersihkan data testing' && !item.disabled)?.click()`);
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Bersihkan data testing?'"),
      { description: "modal reset data testing" },
    );

    const checklistCount = await page.evaluate("document.querySelectorAll('[role=dialog] .confirmation-checklist__item').length");
    assert.equal(checklistCount, 3, "Reset harus memakai tiga acknowledgement card yang eksplisit.");

    for (let index = 0; index < 3; index += 1) {
      await page.evaluate(`document.querySelectorAll('[role=dialog] .confirmation-checklist__item')[${index}]?.click()`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const state = await page.evaluate(`(() => ({
        checked: [...document.querySelectorAll('[role=dialog] .confirmation-checklist__item input')].map((item) => item.checked),
        progress: document.querySelector('[role=dialog] .confirmation-checklist__progress')?.textContent || '',
      }))()`);
      assert.equal(state.checked.slice(0, index + 1).every(Boolean), true, `Checklist 1-${index + 1} tidak boleh kembali kosong setelah render.`);
      assert.match(state.progress, new RegExp(`${index + 1}/3`));
    }

    const filled = await page.evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const reason = dialog?.querySelector('textarea');
      const confirmation = dialog?.querySelector('input:not([type="checkbox"])');
      const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!reason || !confirmation || !textareaSetter || !inputSetter) return false;
      textareaSetter.call(reason, 'Membersihkan fixture data testing');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
      inputSetter.call(confirmation, confirmation.placeholder);
      confirmation.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.equal(filled, true);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const persisted = await page.evaluate(`(() => ({
      reason: document.querySelector('[role=dialog] textarea')?.value || '',
      confirmation: document.querySelector('[role=dialog] input:not([type="checkbox"])')?.value || '',
      checked: [...document.querySelectorAll('[role=dialog] .confirmation-checklist__item input')].map((item) => item.checked),
    }))()`);
    assert.equal(persisted.reason, "Membersihkan fixture data testing");
    assert.equal(persisted.confirmation, "BERSIHKAN DATA TESTING");
    assert.deepEqual(persisted.checked, [true, true, true], "Checklist reset harus tetap tercentang setelah field lain berubah.");
  } finally {
    await chromium?.close?.().catch(() => {});
    await page?.close?.().catch(() => {});
    await appServer?.close?.().catch(() => {});
  }
});

await test("reset semua data punya preview terpisah, safety guard, dan confirmation empat langkah", { timeout: 45_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    const responses = createAuthenticatedGatewayResponses(ownerSession);
    appServer = await startBrowserAppServer({ session: ownerSession, gatewayResponses: responses });
    chromium = await startChromium();
    page = await openBrowserPage(chromium.debuggingPort, `${appServer.origin}/pengaturan/reset-semua`, { width: 390, height: 844 });
    await waitForAppRoute(page, "/pengaturan/reset-semua", { heading: "Pengaturan" });

    await waitFor(
      () => page.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Periksa semua data');
        return Boolean(button && !button.disabled);
      })()`),
      { description: "status full reset terverifikasi" },
    );
    await page.evaluate(`[...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Periksa semua data')?.click()`);
    await waitFor(
      () => page.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Reset semua data');
        return Boolean(button && !button.disabled);
      })()`),
      { description: "preview full reset dan Drive siap" },
    );
    const previewText = await page.evaluate("document.body.innerText");
    assert.match(previewText, /Rekening/);
    assert.match(previewText, /Kategori/);
    assert.match(previewText, /Tetap disimpan/);
    assert.match(previewText, /Audit log/);

    await page.evaluate(`[...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Reset semua data' && !item.disabled)?.click()`);
    await waitFor(
      () => page.evaluate("document.querySelector('[role=dialog] h2')?.textContent?.trim() === 'Reset semua data?'"),
      { description: "modal full reset" },
    );
    const state = await page.evaluate(`(() => ({
      checklist: document.querySelectorAll('[role=dialog] .confirmation-checklist__item').length,
      text: document.querySelector('[role=dialog]')?.innerText || '',
      confirmDisabled: [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent.trim() === 'Reset semua data')?.disabled,
    }))()`);
    assert.equal(state.checklist, 4);
    assert.match(state.text, /RESET SEMUA DATA SALDO BERSAMA/);
    assert.equal(state.confirmDisabled, true, "CTA full reset wajib tetap gated sebelum reason, checklist, frasa, dan countdown selesai.");
  } finally {
    await chromium?.close?.().catch(() => {});
    await page?.close?.().catch(() => {});
    await appServer?.close?.().catch(() => {});
  }
});

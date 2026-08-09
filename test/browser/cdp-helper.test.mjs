import assert from "node:assert/strict";
import test from "node:test";
import { CdpSession } from "./helpers/cdp.mjs";
import { waitForAppRoute } from "./helpers/app-runtime.mjs";

test("CDP evaluate menolak ekspresi non-string sebelum mengirim parameter invalid", async () => {
  const session = Object.create(CdpSession.prototype);
  let sendCalled = false;
  session.send = async () => {
    sendCalled = true;
    return {};
  };

  await assert.rejects(
    () => session.evaluate(() => "browser expression"),
    /Ekspresi CDP harus berupa string JavaScript yang tidak kosong/,
  );
  await assert.rejects(
    () => session.evaluate("   "),
    /Ekspresi CDP harus berupa string JavaScript yang tidak kosong/,
  );
  assert.equal(sendCalled, false);
});

test("CDP evaluate meneruskan string JavaScript ke Runtime.evaluate", async () => {
  const session = Object.create(CdpSession.prototype);
  let captured = null;
  session.send = async (method, params) => {
    captured = { method, params };
    return { result: { value: true } };
  };

  const value = await session.evaluate("document.readyState === 'complete'");

  assert.equal(value, true);
  assert.equal(captured.method, "Runtime.evaluate");
  assert.equal(captured.params.expression, "document.readyState === 'complete'");
  assert.equal(captured.params.userGesture, true);
});

test("CDP diagnostics dibatasi, dapat dibaca, dan dapat dibersihkan antar route", () => {
  const session = Object.create(CdpSession.prototype);
  session.diagnostics = [];

  for (let index = 0; index < 45; index += 1) {
    session.recordDiagnostic({ kind: "console-error", message: `error-${index}` });
  }

  const diagnostics = session.getDiagnostics();
  assert.equal(diagnostics.length, 40);
  assert.equal(diagnostics[0].message, "error-5");
  assert.equal(diagnostics.at(-1).message, "error-44");

  diagnostics.push({ kind: "tamper" });
  assert.equal(session.getDiagnostics().length, 40, "Snapshot diagnostics tidak boleh memutasi buffer internal.");

  session.clearDiagnostics();
  assert.deepEqual(session.getDiagnostics(), []);
});


test("route readiness dapat menunggu capability lazy yang visible setelah heading stabil", async () => {
  let capabilityChecks = 0;
  const page = {
    evaluate: async (expression) => {
      if (expression.includes("getBoundingClientRect")) {
        capabilityChecks += 1;
        return capabilityChecks >= 2;
      }
      if (expression.includes("currentHeading")) return true;
      if (expression.includes("document.readyState")) return true;
      return false;
    },
    getDiagnostics: () => [],
  };

  await waitForAppRoute(page, "/rekening", {
    heading: "Rekening",
    readySelector: '[aria-label="Geser ke atas atau bawah untuk mengganti rekening"]',
  });

  assert.ok(capabilityChecks >= 2, "Capability selector harus dipoll sampai elemen siap, bukan diasumsikan siap bersama heading.");
});

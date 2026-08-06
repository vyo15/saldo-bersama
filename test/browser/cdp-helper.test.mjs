import assert from "node:assert/strict";
import test from "node:test";
import { CdpSession } from "./helpers/cdp.mjs";

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

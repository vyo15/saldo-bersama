export const callAppsScript = async (envelope) => {
  const url = process.env.APPS_SCRIPT_WEB_APP_URL;
  if (!url) throw new Error("APPS_SCRIPT_WEB_APP_URL belum diatur.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw Object.assign(new Error("Apps Script tidak mengembalikan respons valid."), { status: 502, code: "UPSTREAM_INVALID" });
    return body;
  } catch (error) {
    if (error.name === "AbortError") throw Object.assign(new Error("Apps Script timeout. Data belum dinyatakan tersimpan."), { status: 504, code: "UPSTREAM_TIMEOUT" });
    throw error;
  } finally { clearTimeout(timer); }
};

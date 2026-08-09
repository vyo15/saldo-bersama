import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../apps-script/", import.meta.url);
const files = (await readdir(root)).filter((name) => name.endsWith(".gs")).sort();
const sources = new Map();
const compiledScripts = new Map();

for (const file of files) {
  const source = await readFile(new URL(file, root), "utf8");
  sources.set(file, source);
  try { compiledScripts.set(file, new vm.Script(source, { filename: file })); }
  catch (error) {
    error.message = `${file}: ${error.message}`;
    throw error;
  }
}

const utilities = {
  Charset: { UTF_8: "UTF-8" },
  base64EncodeWebSafe: () => "signature",
  computeHmacSha256Signature: () => [1, 2, 3],
  newBlob: () => ({ getBytes: () => [] }),
  sleep: () => {},
};
const service = () => new Proxy({}, { get: () => () => service() });
const createContext = () => vm.createContext({
  console,
  JSON,
  Date,
  Math,
  Utilities: utilities,
  ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: () => ({ setMimeType() { return this; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => "test", setProperty: () => {}, deleteProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  SpreadsheetApp: service(),
  CalendarApp: service(),
  DriveApp: service(),
  ScriptApp: service(),
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => "{}" }) },
  Session: service(),
});

const REQUIRED_PUBLIC_FUNCTIONS = ["doGet", "doPost", "installScheduledTrigger", "runScheduledJobs"];
const RETIRED_PUBLIC_FUNCTIONS = ["setupSaldoBersama", "routeAction_", "rows_", "createTransaction_"];

const assertProjectBoots = (order, label) => {
  const context = createContext();
  for (const file of order) {
    try { compiledScripts.get(file).runInContext(context); }
    catch (error) {
      error.message = `${label} gagal saat memuat ${file}: ${error.message}`;
      throw error;
    }
  }

  for (const name of REQUIRED_PUBLIC_FUNCTIONS) {
    const available = vm.runInContext(`typeof ${name} === "function"`, context);
    if (!available) throw new Error(`${label}: fungsi publik ${name} tidak tersedia setelah project dimuat.`);
  }
  for (const name of RETIRED_PUBLIC_FUNCTIONS) {
    const available = vm.runInContext(`typeof ${name} === "function"`, context);
    if (available) throw new Error(`${label}: fungsi database legacy ${name} masih tersedia.`);
  }
};

assertProjectBoots(files, "Apps Script boot urutan alfabet");
assertProjectBoots([...files].reverse(), "Apps Script boot urutan terbalik");

console.log(`Syntax dan boot Apps Script integration bridge valid: ${files.length} file, 2 urutan load.`);

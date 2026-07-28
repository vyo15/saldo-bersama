import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../apps-script/", import.meta.url);
const files = (await readdir(root)).filter((name) => name.endsWith(".gs")).sort();
const sources = new Map();

for (const file of files) {
  const source = await readFile(new URL(file, root), "utf8");
  sources.set(file, source);
  try { new Function(source); }
  catch (error) {
    error.message = `${file}: ${error.message}`;
    throw error;
  }
}

const assertProjectBoots = (order, label) => {
  const context = vm.createContext({ console });
  for (const file of order) {
    try { new vm.Script(sources.get(file), { filename: file }).runInContext(context); }
    catch (error) {
      error.message = `${label} gagal saat memuat ${file}: ${error.message}`;
      throw error;
    }
  }

  for (const name of ["doGet", "doPost", "setupSaldoBersama"]) {
    const available = vm.runInContext(`typeof ${name} === "function"`, context);
    if (!available) throw new Error(`${label}: fungsi publik ${name} tidak tersedia setelah project dimuat.`);
  }
};

assertProjectBoots(files, "Apps Script boot urutan alfabet");
assertProjectBoots([...files].reverse(), "Apps Script boot urutan terbalik");

console.log(`Syntax dan boot Apps Script valid: ${files.length} file, 2 urutan load.`);

const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (character !== "\r") field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

export const readTransactionImportFile = async (file) => {
  if (!file) throw new Error("Pilih file import terlebih dahulu.");
  if (file.size > 1_000_000) throw new Error("Ukuran file import maksimal 1 MB untuk preview browser.");
  const text = await file.text();
  let records;
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text);
    records = Array.isArray(parsed) ? parsed : parsed.records || parsed.data?.Transactions;
    if (!Array.isArray(records)) throw new Error("JSON harus berisi array transaksi.");
  } else if (file.name.toLowerCase().endsWith(".csv")) {
    const [headers, ...rows] = parseCsvRows(text);
    if (!headers?.length) throw new Error("Header CSV tidak ditemukan.");
    records = rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header.trim(), row[index] ?? ""])));
  } else {
    throw new Error("Format import yang didukung saat ini adalah JSON dan CSV.");
  }
  if (!records.length || records.length > 500) throw new Error("Import harus berisi 1-500 transaksi.");
  return records;
};

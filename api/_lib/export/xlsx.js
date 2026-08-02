import { safeSpreadsheetText } from "../services/core.js";

const xml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const colName = (index) => { let n = index + 1; let value = ""; while (n) { n -= 1; value = String.fromCharCode(65 + (n % 26)) + value; n = Math.floor(n / 26); } return value; };
const uint16 = (value) => { const b = Buffer.alloc(2); b.writeUInt16LE(value >>> 0); return b; };
const uint32 = (value) => { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; };
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = (buffer) => { let crc = 0xffffffff; for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };

const zipStore = (files) => {
  const locals = []; const centrals = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, "/"), "utf8"); const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8"); const crc = crc32(data);
    const local = Buffer.concat([uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name, data]);
    locals.push(local);
    centrals.push(Buffer.concat([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name]));
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length), uint32(central.length), uint32(offset), uint16(0)]);
  return Buffer.concat([...locals, central, end]);
};

const MONEY_HEADER = /(?:amount|balance|nominal|target|actual|difference|income|expense|refund|saldo|anggaran|alokasi|terpakai|sisa)/i;
const sheetXml = (headers, rows) => {
  const widths = headers.map((header, index) => Math.min(45, Math.max(12, String(header).length + 2, ...rows.slice(0, 200).map((row) => String(row[index] ?? "").length + 1))));
  const rowXml = [headers, ...rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((raw, colIndex) => {
    const ref = `${colName(colIndex)}${rowIndex + 1}`;
    if (rowIndex > 0 && typeof raw === "number" && Number.isFinite(raw)) return `<c r="${ref}" s="${Number.isInteger(raw) && MONEY_HEADER.test(String(headers[colIndex] || "")) ? 2 : 0}"><v>${raw}</v></c>`;
    const value = safeSpreadsheetText(raw ?? "");
    return `<c r="${ref}" t="inlineStr" s="${rowIndex === 0 ? 1 : 0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const last = `${colName(Math.max(0, headers.length - 1))}${rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
};

export const createXlsx = (sheets) => {
  const entries = Object.entries(sheets).map(([name, rows]) => {
    const headers = rows.length ? Object.keys(rows[0]) : ["Keterangan"];
    const data = rows.length ? rows.map((row) => headers.map((header) => row[header])) : [["Tidak ada data"]];
    return { name: name.slice(0, 31), headers, data };
  });
  const files = [];
  files.push({ name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${entries.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` });
  files.push({ name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` });
  files.push({ name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries.map((item, i) => `<sheet name="${xml(item.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` });
  files.push({ name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${entries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[$Rp-421] #,##0;[Red]-[$Rp-421] #,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>` });
  entries.forEach((item, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(item.headers, item.data) }));
  const now = new Date().toISOString();
  files.push({ name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Saldo Bersama</dc:title><dc:creator>Saldo Bersama</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` });
  files.push({ name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Saldo Bersama</Application></Properties>` });
  return zipStore(files);
};

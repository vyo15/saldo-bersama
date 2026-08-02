import assert from "node:assert/strict";
import test from "node:test";
import { createXlsx } from "../../api/_lib/export/xlsx.js";

const unzipStored = (buffer) => {
  const files = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    files.set(name, buffer.subarray(dataStart, dataStart + compressedSize).toString("utf8"));
    offset = dataStart + compressedSize;
  }
  return files;
};

test("generator membuat workbook XLSX valid dengan freeze header dan autofilter", () => {
  const workbook = createXlsx({ Transaksi: [{ description: "Makan", amount: 10000, row_version: 2 }] });
  assert.equal(workbook.readUInt32LE(0), 0x04034b50);
  const files = unzipStored(workbook);
  for (const name of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) assert.ok(files.has(name), name);
  assert.match(files.get("xl/worksheets/sheet1.xml"), /state="frozen"/);
  assert.match(files.get("xl/worksheets/sheet1.xml"), /<autoFilter/);
});

test("formula injection menjadi teks dan style Rupiah hanya dipakai kolom nominal", () => {
  const files = unzipStored(createXlsx({ Data: [{ description: "=HYPERLINK(\"x\")", amount: 10000, row_version: 2 }] }));
  const sheet = files.get("xl/worksheets/sheet1.xml");
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(sheet, /&apos;=HYPERLINK/);
  assert.match(sheet, /B2" s="2"/);
  assert.match(sheet, /C2" s="0"/);
});

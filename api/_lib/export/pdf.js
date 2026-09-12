const ascii = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[–—]/g, "-")
  .replace(/…/g, "...")
  .replace(/•/g, "-")
  .replace(/[^\x20-\x7E]/g, "?");

const escapePdf = (value) => ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const money = (value) => `Rp ${Math.round(Number(value || 0)).toLocaleString("id-ID")}`;
const clip = (value, max = 42) => {
  const textValue = ascii(value);
  return textValue.length <= max ? textValue : `${textValue.slice(0, Math.max(1, max - 3))}...`;
};

const text = (x, y, value, { size = 9, bold = false } = {}) => `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
const line = (x1, y1, x2, y2, gray = .86) => `${gray} G ${x1} ${y1} m ${x2} ${y2} l S 0 G`;

const pageBuilder = () => ({ commands: [], y: 790 });
const addHeader = (page, meta) => {
  page.commands.push(text(44, 804, "SALDO BERSAMA", { size: 10, bold: true }));
  page.commands.push(text(44, 780, "Laporan Keuangan", { size: 19, bold: true }));
  page.commands.push(text(44, 762, `${meta.periodLabel}  |  ${meta.scopeLabel}`, { size: 9 }));
  page.commands.push(line(44, 748, 551, 748));
  page.y = 730;
};

const addSection = (page, title) => {
  if (!title) return;
  page.commands.push(text(44, page.y, title, { size: 11, bold: true }));
  page.y -= 19;
};

const addSummary = (page, report) => {
  addSection(page, "Ringkasan");
  const summary = report.reportSummary || {};
  const rows = summary.mode === "allocation" ? [
    ["Dana dialokasikan", money(summary.allocated)],
    ["Terpakai", money(summary.used)],
    ["Sisa", money(summary.remaining)],
    ["Penggunaan", `${Number(summary.usagePercent || 0)}%`],
  ] : [
    ["Saldo awal", money(summary.openingBalance)],
    ["Kredit", money(summary.credit)],
    ["Debit", money(summary.debit)],
    ["Saldo akhir", money(summary.closingBalance)],
  ];
  rows.forEach(([label, value], index) => {
    const x = 44 + (index % 2) * 255;
    const y = page.y - Math.floor(index / 2) * 36;
    page.commands.push(text(x, y, label, { size: 8 }));
    page.commands.push(text(x, y - 15, value, { size: 12, bold: true }));
  });
  page.y -= 86;
  page.commands.push(text(44, page.y, "Dokumen ini memakai angka yang sama dengan halaman Laporan pada scope dan periode terpilih.", { size: 8 }));
  page.y -= 22;
};

const addCompactTable = (page, title, headers, rows, widths, rowHeight = 18) => {
  if (!rows.length) return;
  addSection(page, title);
  const x0 = 44;
  let x = x0;
  headers.forEach((header, index) => {
    page.commands.push(text(x, page.y, header, { size: 7, bold: true }));
    x += widths[index];
  });
  page.y -= 8;
  page.commands.push(line(x0, page.y, 551, page.y));
  page.y -= 13;
  for (const row of rows) {
    x = x0;
    row.forEach((value, index) => {
      page.commands.push(text(x, page.y, clip(value, Math.max(8, Math.floor(widths[index] / 5.1))), { size: 7 }));
      x += widths[index];
    });
    page.y -= rowHeight;
    page.commands.push(line(x0, page.y + 6, 551, page.y + 6, .93));
  }
  page.y -= 8;
};

const chunkRows = (rows, size) => {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
};

const tablePages = ({ meta, title, headers, rows, widths, chunkSize = 27, rowHeight = 19 }) => chunkRows(rows, chunkSize).map((chunk, index, chunks) => {
  const page = pageBuilder();
  addHeader(page, meta);
  addCompactTable(page, chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title, headers, chunk, widths, rowHeight);
  return page;
});

const allocationRows = (report) => (report.allocationOptions || []).map((item) => [
  item.name,
  money(item.allocated_amount),
  money(item.used_amount),
  money(item.remaining_amount),
  `${item.usage_percent}%`,
]);

const budgetRows = (report) => (report.budgets || []).map((item) => [
  item.name,
  item.envelope_name || report.reportScope?.label || "-",
  money(item.amount),
  money(item.used_amount),
  money(Number(item.amount || 0) - Number(item.used_amount || 0)),
]);

const categoryRows = (report) => (report.categoryExpenses || []).map((item) => [
  item.label,
  String(Number(item.transaction_count || 0)),
  money(item.amount),
]);

const transactionRows = (report) => (report.reportTransactions || []).map((item) => [
  item.transaction_date,
  item.description,
  item.account_name || "-",
  item.allocation_name || "-",
  item.debit ? money(item.debit) : "-",
  item.credit ? money(item.credit) : "-",
  money(item.running_balance),
]);

const addFooters = (pages, meta) => pages.forEach((page, index) => {
  page.commands.push(text(44, 35, `Saldo Bersama - ${meta.periodLabel} - ${meta.scopeLabel}`, { size: 7 }));
  page.commands.push(text(486, 35, `Hal. ${index + 1}/${pages.length}`, { size: 7 }));
});

const buildPdf = (pages) => {
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const stream = page.commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  let output = "%PDF-1.4\n%SaldoBersama\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, "latin1");
};

export const createReportPdf = (report, meta) => {
  const first = pageBuilder();
  addHeader(first, meta);
  addSummary(first, report);
  const pages = [first];
  if (report.reportScope?.mode === "all") pages.push(...tablePages({
    meta,
    title: "Penggunaan Alokasi",
    headers: ["Alokasi", "Dana", "Terpakai", "Sisa", "%"],
    rows: allocationRows(report),
    widths: [140, 96, 96, 96, 58],
  }));
  pages.push(...tablePages({
    meta,
    title: "Kebutuhan vs Aktual",
    headers: ["Kebutuhan", "Alokasi", "Rencana", "Aktual", "Sisa"],
    rows: budgetRows(report),
    widths: [142, 104, 88, 88, 85],
  }));
  pages.push(...tablePages({
    meta,
    title: "Pengeluaran per Kategori",
    headers: ["Kategori", "Transaksi", "Pengeluaran"],
    rows: categoryRows(report),
    widths: [255, 105, 147],
  }));
  pages.push(...tablePages({
    meta,
    title: "Rincian Transaksi",
    headers: ["Tanggal", "Keterangan", "Rekening", "Alokasi", "Debit", "Kredit", "Saldo"],
    rows: transactionRows(report),
    widths: [52, 115, 70, 70, 66, 66, 68],
    chunkSize: 27,
  }));
  addFooters(pages, meta);
  return buildPdf(pages);
};

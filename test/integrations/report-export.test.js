import assert from "node:assert/strict";
import test from "node:test";
import { createReportPdf } from "../../api/_lib/export/pdf.js";
import { reportWorkbookSheets } from "../../api/_lib/export/report.js";
import { createXlsx } from "../../api/_lib/export/xlsx.js";

const makeReport = () => ({
  reportSummary: {
    mode: "all",
    openingBalance: 8_500_000,
    credit: 6_200_000,
    debit: 4_100_000,
    closingBalance: 10_600_000,
  },
  reportScope: { mode: "all", label: "Semua Alokasi" },
  allocationOptions: Array.from({ length: 35 }, (_, index) => ({
    envelope_rule_id: `rule-${index + 1}`,
    name: `Alokasi ${index + 1}`,
    allocated_amount: 1_000_000,
    used_amount: index * 10_000,
    remaining_amount: 1_000_000 - index * 10_000,
    usage_percent: index,
  })),
  budgets: Array.from({ length: 36 }, (_, index) => ({
    budget_id: `budget-${index + 1}`,
    name: `Kebutuhan ${index + 1}`,
    envelope_name: `Alokasi ${index + 1}`,
    amount: 500_000,
    used_amount: 250_000,
    status: "active",
  })),
  reportTransactions: Array.from({ length: 62 }, (_, index) => ({
    transaction_id: `tx-${index + 1}`,
    transaction_date: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
    description: `Transaksi ${index + 1}`,
    account_name: "BCA",
    allocation_name: `Alokasi ${(index % 5) + 1}`,
    budget_name: `Kebutuhan ${(index % 5) + 1}`,
    category_name: "Rumah",
    debit: 25_000,
    credit: 0,
    running_balance: 10_600_000 - index * 25_000,
    creator_name: "Owner",
  })),
  categoryExpenses: [{ category_id: "cat-home", label: "Rumah", amount: 1_550_000, transaction_count: 62 }],
  accountExpenses: [{ account_id: "account-bca", label: "BCA · Bersama", amount: 1_550_000, transaction_count: 62 }],
});

const meta = { periodLabel: "September 2026", scopeLabel: "Semua Alokasi" };

test("PDF laporan menghasilkan dokumen lengkap lintas halaman tanpa memangkas Alokasi, Kebutuhan, atau transaksi", () => {
  const pdf = createReportPdf(makeReport(), meta);
  const source = pdf.toString("latin1");
  assert.equal(source.startsWith("%PDF-1.4"), true);
  assert.match(source, /Alokasi 35/);
  assert.match(source, /Kebutuhan 36/);
  assert.match(source, /Transaksi 62/);
  assert.match(source, /Rincian Transaksi/);
  assert.match(source, /Hal\. 1\//);
});

test("Excel laporan memakai template sheet terolah dan tetap berupa workbook XLSX valid", () => {
  const sheets = reportWorkbookSheets(makeReport(), meta);
  assert.deepEqual(Object.keys(sheets), ["Ringkasan", "Alokasi", "Kebutuhan", "Transaksi", "Kategori", "Rekening"]);
  assert.equal(sheets.Alokasi.length, 35);
  assert.equal(sheets.Kebutuhan.length, 36);
  assert.equal(sheets.Transaksi.length, 62);
  assert.equal(sheets.Transaksi[61].Keterangan, "Transaksi 62");
  const workbook = createXlsx(sheets);
  assert.equal(workbook.subarray(0, 2).toString("ascii"), "PK");
  assert.match(workbook.toString("utf8"), /Ringkasan/);
  assert.match(workbook.toString("utf8"), /Transaksi/);
});

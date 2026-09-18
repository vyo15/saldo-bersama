import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("desktop transaksi meredam CTA per baris tanpa menghilangkan aksi detail", async () => {
  const [page, css] = await Promise.all([
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/TransactionsPage.module.css"),
  ]);
  assert.match(page, /const TransactionActionMenu/);
  assert.match(page, /menuOnly/);
  assert.match(page, /<FiMoreHorizontal/);
  assert.match(page, /Pakai lagi/);
  assert.match(page, /Edit transaksi/);
  assert.match(page, /Batalkan transaksi/);
  assert.match(page, /<TransactionActions item=\{item\} linkedModule=\{managedModule\(item\)\} menuOnly/);
  assert.match(css, /\.actionMenuItems \{/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.actionMenu \{ display: none; \}/);
});

test("kartu kewajiban mempertahankan Buka Alokasi sebagai CTA utama dan memindahkan aksi kelola ke overflow", async () => {
  const [page, css] = await Promise.all([
    read("src/features/commitments/CommitmentsPage.jsx"),
    read("src/features/commitments/CommitmentsPage.module.css"),
  ]);
  assert.match(page, /Buka Alokasi/);
  assert.match(page, /<details className=\{styles\.manageMenu\}>/);
  assert.match(page, /<span>Kelola<\/span>/);
  assert.match(page, /Edit kewajiban/);
  assert.match(page, /Hentikan kewajiban/);
  assert.match(css, /\.manageMenuItems \{/);
});

test("target menjelaskan eksekusi Alokasi sekali di level halaman, bukan berulang pada setiap kartu", async () => {
  const [page, cards] = await Promise.all([
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/goals/components/GoalCards.jsx"),
  ]);
  assert.match(page, /title="Eksekusi lewat Alokasi"/);
  assert.doesNotMatch(cards, /Eksekusi lewat Alokasi/);
});

test("laporan desktop menjaga konteks filter saat analisis panjang dan mobile tetap statis", async () => {
  const [page, css] = await Promise.all([
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/reports/ReportsPage.module.css"),
  ]);
  assert.match(page, /className=\{styles\.reportContextBar\}/);
  assert.match(page, /aria-label="Konteks laporan"/);
  assert.match(css, /@media \(min-width: 821px\)[\s\S]*\.reportContextBar \{[\s\S]*position: sticky;[\s\S]*top: 82px;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.reportContextBar \{[\s\S]*background: transparent;/);
});

test("rekonsiliasi desktop menjadi workspace perbandingan dua panel tanpa mengubah disclosure mobile", async () => {
  const [page, css] = await Promise.all([
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.module.css"),
  ]);
  const layout = page.indexOf("<div className={styles.layout}>");
  const input = page.indexOf("<ReconciliationInputPanel", layout);
  const history = page.indexOf("className={styles.historyDisclosure}", layout);
  assert.ok(layout >= 0 && input > layout && history > input);
  assert.match(css, /@media \(min-width: 1100px\)[\s\S]*\.layout \{[\s\S]*grid-template-columns: minmax\(320px, \.72fr\) minmax\(0, 1\.28fr\);/);
  assert.match(css, /\.formPanel \{[\s\S]*position: sticky;[\s\S]*top: 82px;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.historyDisclosureButton \{[\s\S]*display: flex;/);
});

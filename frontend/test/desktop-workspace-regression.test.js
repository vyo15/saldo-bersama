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

test("kartu kewajiban memakai Bayar sebagai CTA utama dan memindahkan aksi kelola ke overflow", async () => {
  const [page, css] = await Promise.all([
    read("src/features/commitments/CommitmentsPage.jsx"),
    read("src/features/commitments/CommitmentsPage.module.css"),
  ]);
  assert.match(page, />Bayar<\/ButtonLink>/);
  assert.match(page, />Buka Alokasi<\/ButtonLink>/);
  assert.match(page, /<details className=\{styles\.manageMenu\}>/);
  assert.match(page, /aria-label={`Kelola kewajiban \${item\.name}`}/);
  assert.match(page, /Edit kewajiban/);
  assert.match(page, /Hentikan kewajiban/);
  assert.match(css, /\.manageMenuItems \{/);
});

test("target menjelaskan progress tunai dan investasi sekali di level halaman, bukan menghidupkan flow Alokasi lama", async () => {
  const [page, cards] = await Promise.all([
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/goals/components/GoalCards.jsx"),
  ]);
  assert.match(page, /help="Satu tujuan dapat berisi dana tunai, investasi, atau keduanya\. Nilai investasi mengikuti catatan harga terakhir dan setiap kejadian uang dihitung satu kali\."/);
  assert.match(cards, /Tambah dana/);
  assert.doesNotMatch(`${page}\n${cards}`, /Target hanya memantau rencana dan progres|Eksekusi lewat Alokasi|goal-plan/);
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
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*\.layout \{[\s\S]*grid-template-columns: minmax\(300px, \.55fr\) minmax\(0, 1\.45fr\);/);
  assert.match(css, /\.formPanel \{[\s\S]*position: sticky;[\s\S]*top: 82px;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.historyDisclosureButton \{[\s\S]*display: flex;/);
});


test("transaksi desktop memakai workspace analitik, ledger, dan drawer detail tanpa mengubah experience mobile", async () => {
  const [page, workspace, css, presentation, backend] = await Promise.all([
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/components/DesktopTransactionWorkspace.jsx"),
    read("src/features/transactions/TransactionsPage.module.css"),
    read("src/shared/presentation/transaction.js"),
    readFile(new URL("../../api/_lib/services/finance/transactionQueries.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const DesktopTransactionWorkspace = lazy/);
  assert.match(page, /useApiResource\("reports\.monthly", \{ period: filters\.period, trend_months: 6 \}\)/);
  assert.match(page, /<DesktopTransactionWorkspace/);
  assert.match(page, /<MobileTransactionHistory/);
  assert.match(page, /desktop=\{!mobileLayout\}/);
  assert.match(page, /desktop-data-table/);
  assert.match(workspace, /Aktivitas bulan ini/);
  assert.match(workspace, /Transaksi cepat/);
  assert.match(workspace, /Pengeluaran terbesar/);
  assert.match(workspace, /Transaksi yang baru digunakan/);
  assert.doesNotMatch(workspace, /<span className=\{styles\.activityEyebrow\}>Pakai lagi<\/span>/);
  assert.match(css, /\.desktopWorkspace \{/);
  assert.match(css, /:global\(\.modal\)\.detailDrawer \{/);
  assert.match(presentation, /transactionPlanningContext/);
  assert.match(backend, /b\.name AS budget_name/);
  assert.match(backend, /rr\.name AS recurring_name/);
  assert.match(backend, /g\.name AS goal_name/);
  assert.match(backend, /cm\.name AS commitment_name/);
});

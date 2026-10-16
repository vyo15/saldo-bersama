import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = () => readFile(new URL("../src/features/investments/InvestmentsPage.jsx", import.meta.url), "utf8");

test("Hapus portofolio memakai ConfirmationModal Saldo Bersama, bukan konfirmasi browser", async () => {
  const source = await page();
  assert.match(source, /import ConfirmationModal from/);
  assert.match(source, /const PortfolioArchiveConfirm =/);
  assert.match(source, /confirmLabel="Arsipkan portofolio" tone="danger"/);
  assert.match(source, /saldo RDN, posisi investasi, dan alokasi Target sudah kosong/);
  assert.match(source, /setArchivePortfolioTarget\(portfolio\)/);
  assert.match(source, /archiveInvestmentPortfolio/);
  assert.match(source, /setArchivePortfolioTarget\(null\)/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /error=\{lifecycleError\}/);
});

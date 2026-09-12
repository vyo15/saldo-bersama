import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiDownload, FiFileText, FiLayers } from "react-icons/fi";
import { Link, useSearchParams } from "react-router";
import Button from "../../components/common/Button.jsx";
import Money from "../../components/common/Money.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { formatCompactRupiah, formatRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { downloadFinancialReport } from "./reports.api.js";
import { allocationDecoration } from "../allocations/allocationDecorations.js";
import styles from "./ReportsPage.module.css";

const TREND_OPTIONS = [1, 3, 6, 12];
const trendOptions = TREND_OPTIONS.map((months) => ({ value: String(months), label: months === 1 ? "1 bulan · harian" : `${months} bulan` }));

const monthLabel = (period) => {
  const [year, month] = String(period).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const usageStatus = (budget) => {
  const planned = Number(budget.amount || 0);
  const used = Number(budget.used_amount || 0);
  if (used > planned) return { label: "Melebihi", tone: "danger" };
  if (planned > 0 && used >= planned) return { label: "Lunas", tone: "done" };
  if (planned > 0 && used / planned >= .8) return { label: "Hampir habis", tone: "warning" };
  return { label: "Aman", tone: "safe" };
};

const ReportDownloadMenu = ({ period, trendMonths, allocationRuleId }) => {
  const { notify } = useFeedback();
  const detailsRef = useRef(null);
  const [exporting, setExporting] = useState("");
  const download = async (format) => {
    setExporting(format);
    try {
      const result = await downloadFinancialReport({ period, trendMonths, allocationRuleId, format });
      notify({ message: `${result.fileName} berhasil diunduh.`, tone: "success", dedupeKey: `report:${format}` });
      detailsRef.current?.removeAttribute("open");
    } catch (error) {
      notify({ message: error.message || "Laporan gagal diunduh.", tone: "danger", dedupeKey: `report:${format}:error` });
    } finally {
      setExporting("");
    }
  };
  return <details className={styles.downloadMenu} ref={detailsRef}>
    <summary><FiDownload aria-hidden="true" /><span>Unduh</span></summary>
    <div className={styles.downloadPopover}>
      <button type="button" disabled={Boolean(exporting)} onClick={() => download("pdf")}><FiFileText aria-hidden="true" /><span><strong>PDF</strong><small>Laporan siap baca seperti rekening koran</small></span>{exporting === "pdf" ? "…" : <FiDownload aria-hidden="true" />}</button>
      <button type="button" disabled={Boolean(exporting)} onClick={() => download("xlsx")}><FiLayers aria-hidden="true" /><span><strong>Excel</strong><small>Data terolah dengan sheet yang rapi</small></span>{exporting === "xlsx" ? "…" : <FiDownload aria-hidden="true" />}</button>
    </div>
  </details>;
};

const ReportHeader = ({ period, setPeriod, trendMonths, allocationRuleId, setAllocationRuleId, allocationOptions }) => {
  const scopeOptions = useMemo(() => [
    { value: "", label: "Semua Alokasi" },
    ...allocationOptions.map((item) => ({ value: item.envelope_rule_id, label: item.name, meta: `${formatCompactRupiah(item.used_amount)} terpakai` })),
  ], [allocationOptions]);
  return <div className={styles.headerArea}>
    <header className={styles.header}>
      <div><h1>Laporan</h1><p>Ringkasan keuangan dan penggunaan Alokasi dalam satu tampilan.</p></div>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.filters}>
        <div className={styles.periodControl}><span className="sr-only">Periode</span><TemporalInput type="month" max={currentMonthInJakarta()} value={period} onChange={(event) => setPeriod(event.target.value)} compact aria-label="Pilih periode laporan" /></div>
        <SelectionField className={styles.scopeControl} label="Alokasi" hideLabel compact value={allocationRuleId} onChange={setAllocationRuleId} options={scopeOptions} ariaLabel="Pilih scope Alokasi" searchable={scopeOptions.length > 7} />
      </div>
      <ReportDownloadMenu period={period} trendMonths={trendMonths} allocationRuleId={allocationRuleId} />
    </div>
  </div>;
};

const SummaryStrip = ({ summary }) => {
  const allocation = summary?.mode === "allocation";
  const items = allocation ? [
    ["Dialokasikan", summary.allocated, ""], ["Terpakai", summary.used, "negative"], ["Sisa", summary.remaining, summary.remaining < 0 ? "negative" : ""], ["Penggunaan", `${Number(summary.usagePercent || 0)}%`, "text"],
  ] : [
    ["Saldo awal", summary?.openingBalance, ""], ["Kredit", summary?.credit, "positive"], ["Debit", summary?.debit, "negative"], ["Saldo akhir", summary?.closingBalance, ""],
  ];
  return <section className={styles.summaryStrip} aria-label="Ringkasan laporan">
    {items.map(([label, value, tone]) => <div className={`${styles.summaryItem}${["Saldo akhir", "Sisa"].includes(label) ? ` ${styles.summaryPrimary}` : ""}`} key={label}><span>{label}</span>{tone === "text" ? <strong>{value}</strong> : <Money value={value || 0} tone={tone || "default"} />}</div>)}
  </section>;
};

const AllocationRows = ({ items, onSelect }) => {
  if (!items.length) return <EmptyState variant="inline" title="Belum ada Alokasi" description="Alokasi periode ini akan tampil di sini setelah memiliki dana atau Kebutuhan." />;
  return <div className={styles.allocationRows}>{items.map((item) => {
    const decoration = allocationDecoration({ decorationKey: item.decoration_key, name: item.name, id: item.envelope_rule_id });
    const percent = Math.max(0, Number(item.usage_percent || 0));
    return <button className={styles.allocationRow} type="button" key={item.envelope_rule_id} onClick={() => onSelect(item.envelope_rule_id)}>
      <span className={styles.allocationArt}>{decoration.asset ? <img src={decoration.asset} alt="" width="36" height="36" loading="lazy" decoding="async" /> : null}</span>
      <span className={styles.allocationCopy}><span><strong>{item.name}</strong><em>{percent}%</em></span><span>{formatRupiah(item.used_amount)} <small>/ {formatRupiah(item.allocated_amount)}</small></span><i><b style={{ width: `${Math.min(100, percent)}%` }} /></i></span>
      <span className={styles.allocationRemaining}><small>Sisa</small><strong>{formatCompactRupiah(item.remaining_amount)}</strong></span>
      <FiChevronRight aria-hidden="true" />
    </button>;
  })}</div>;
};

const TrendView = ({ trend = { items: [] }, period }) => {
  const values = trend.items || [];
  const max = Math.max(1, ...values.map((item) => Number(item.expense || 0)));
  if (!values.length) return <EmptyState variant="inline" title="Belum ada tren" description="Tren muncul setelah terdapat transaksi pada periode laporan." />;
  return <div className={styles.trendChart} role="img" aria-label="Tren pengeluaran">
    {values.map((item) => <div className={styles.trendColumn} key={item.periodKey}><span>{formatCompactRupiah(item.expense)}</span><i className={item.periodKey === period ? styles.activeBar : ""} style={{ height: `${Math.max(8, Math.round((Number(item.expense || 0) / max) * 100))}%` }} /><small>{item.label}</small></div>)}
  </div>;
};

const CategoryRows = ({ items = [] }) => {
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (!items.length) return <EmptyState variant="inline" title="Belum ada pengeluaran" description="Kategori akan muncul setelah transaksi pengeluaran tercatat." />;
  return <div className={styles.categoryRows}>{items.slice(0, 6).map((item) => <div className={styles.categoryRow} key={item.category_id || item.label}><span><strong>{item.label}</strong><small>{Number(item.transaction_count || 0)} transaksi</small></span><span><strong>{formatCompactRupiah(item.amount)}</strong><small>{total ? Math.round(Number(item.amount || 0) / total * 100) : 0}%</small></span></div>)}</div>;
};

const BudgetRows = ({ budgets }) => {
  if (!budgets.length) return <EmptyState variant="inline" title="Belum ada Kebutuhan" description="Kebutuhan pada scope ini akan tampil setelah dibuat dari Alokasi." />;
  return <div className={styles.budgetRows}>{budgets.map((budget) => {
    const status = usageStatus(budget);
    return <div className={styles.budgetRow} key={budget.budget_id}><span><strong>{budget.name}</strong>{budget.envelope_name ? <small>{budget.envelope_name}</small> : null}</span><span><small>Rencana</small><strong>{formatCompactRupiah(budget.amount)}</strong></span><span><small>Aktual</small><strong>{formatCompactRupiah(budget.used_amount)}</strong></span><em data-tone={status.tone}>{status.label}</em></div>;
  })}</div>;
};

const TransactionRows = ({ items, expanded, onToggle }) => {
  const visible = expanded ? items : items.slice(0, 6);
  if (!items.length) return <EmptyState variant="inline" title="Belum ada transaksi" description="Aktivitas pada scope dan periode ini belum tersedia." />;
  return <><div className={styles.transactionRows}>{visible.map((item) => <div className={styles.transactionRow} key={item.transaction_id}>
    <span><strong>{item.description}</strong><small>{[item.allocation_name, item.account_name, item.transaction_date].filter(Boolean).join(" · ")}</small></span>
    <span className={styles.transactionAmount}><strong data-tone={item.debit ? "negative" : item.credit ? "positive" : "default"}>{item.debit ? `- ${formatRupiah(item.debit)}` : item.credit ? `+ ${formatRupiah(item.credit)}` : "Transfer"}</strong><small>Saldo {formatCompactRupiah(item.running_balance)}</small></span>
  </div>)}</div>{items.length > 6 ? <button className={styles.textAction} type="button" onClick={onToggle}>{expanded ? "Tampilkan ringkas" : `Lihat semua ${items.length} transaksi`}</button> : null}</>;
};

const BreakdownDetails = ({ accountExpenses, creatorExpenses }) => <details className={styles.breakdownDetails}>
  <summary>Rincian lainnya <span>Rekening & pencatat</span></summary>
  <div className={styles.breakdownGrid}>
    <div><h3>Pengeluaran per rekening</h3>{accountExpenses.length ? accountExpenses.map((item) => <p key={item.account_id}><span>{item.label}</span><strong>{formatCompactRupiah(item.amount)}</strong></p>) : <small>Belum ada data.</small>}</div>
    <div><h3>Aktivitas pencatatan</h3>{creatorExpenses.length ? creatorExpenses.map((item) => <p key={item.user_id}><span>{item.label}</span><strong>{formatCompactRupiah(item.amount)}</strong></p>) : <small>Belum ada data.</small>}<small>Menunjukkan pencatat, bukan penanggung biaya.</small></div>
  </div>
</details>;

const Documents = ({ period, scopeLabel, trendMonths, allocationRuleId }) => <section className={styles.documentsSection}>
  <div className={styles.sectionHeading}><div><h2>Dokumen laporan</h2><p>{monthLabel(period)} · {scopeLabel}</p></div></div>
  <div className={styles.documentRows}>
    <div><FiFileText aria-hidden="true" /><span><strong>PDF rekening koran</strong><small>Ringkasan, Kebutuhan, dan rincian transaksi siap baca.</small></span><ReportFileButton format="pdf" period={period} trendMonths={trendMonths} allocationRuleId={allocationRuleId} /></div>
    <div><FiLayers aria-hidden="true" /><span><strong>Excel terolah</strong><small>Sheet Ringkasan, Alokasi, Kebutuhan, Transaksi, Kategori, dan Rekening.</small></span><ReportFileButton format="xlsx" period={period} trendMonths={trendMonths} allocationRuleId={allocationRuleId} /></div>
  </div>
</section>;

const ReportFileButton = ({ format, period, trendMonths, allocationRuleId }) => {
  const { notify } = useFeedback();
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const result = await downloadFinancialReport({ format, period, trendMonths, allocationRuleId });
      notify({ message: `${result.fileName} berhasil diunduh.`, tone: "success", dedupeKey: `report-doc:${format}` });
    } catch (error) {
      notify({ message: error.message || "Laporan gagal diunduh.", tone: "danger", dedupeKey: `report-doc:${format}:error` });
    } finally { setLoading(false); }
  };
  return <Button variant="secondary" icon={FiDownload} loading={loading} onClick={run}>{format === "pdf" ? "PDF" : "Excel"}</Button>;
};

const ReportsContent = ({ data, period, setPeriod, trendMonths, setTrendMonths, allocationRuleId, setAllocationRuleId, refreshError, reload }) => {
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const scope = data.reportScope || { mode: "all", label: "Semua Alokasi" };
  return <div className={styles.page}>
    <RefreshWarning error={refreshError} onRetry={reload} />
    <ReportHeader period={period} setPeriod={setPeriod} trendMonths={trendMonths} allocationRuleId={allocationRuleId} setAllocationRuleId={setAllocationRuleId} allocationOptions={data.allocationOptions || []} />
    <SummaryStrip summary={data.reportSummary} />
    <div className={styles.primaryGrid}>
      {scope.mode === "all" ? <section className={styles.flatSection}><div className={styles.sectionHeading}><div><h2>Penggunaan Alokasi</h2><p>Dana terpakai dan sisa pada periode ini.</p></div><Link className={styles.headingLink} to="/perencanaan/kantong">Kelola</Link></div><AllocationRows items={data.allocationOptions || []} onSelect={setAllocationRuleId} /></section> : <section className={styles.flatSection}><div className={styles.sectionHeading}><div><h2>Kebutuhan di {scope.label}</h2><p>Rencana dibanding realisasi pengeluaran.</p></div></div><BudgetRows budgets={data.budgets || []} /></section>}
      <section className={styles.flatSection}><div className={styles.sectionHeading}><div><h2>Tren pengeluaran</h2><p>{trendMonths === 1 ? "Harian pada bulan terpilih" : `${trendMonths} bulan terakhir`}</p></div><SelectionField className={styles.inlineTrend} label="Rentang tren" hideLabel compact value={String(trendMonths)} onChange={(value) => setTrendMonths(Number(value))} options={trendOptions} ariaLabel="Pilih rentang tren" /></div><TrendView trend={data.trend} period={period} /></section>
    </div>
    {scope.mode === "all" ? <section className={styles.flatSection}><div className={styles.sectionHeading}><div><h2>Kebutuhan vs Aktual</h2><p>Rencana pengeluaran dan realisasinya.</p></div></div><BudgetRows budgets={data.budgets || []} /></section> : null}
    <div className={styles.secondaryGrid}>
      <section className={styles.flatSection}><div className={styles.sectionHeading}><div><h2>Pengeluaran per kategori</h2><p>Distribusi pengeluaran pada scope aktif.</p></div></div><CategoryRows items={data.categoryExpenses || []} /></section>
      <section className={styles.flatSection}><div className={styles.sectionHeading}><div><h2>Transaksi terbaru</h2><p>Rincian debit, kredit, dan saldo berjalan.</p></div></div><TransactionRows items={data.reportTransactions || []} expanded={transactionsExpanded} onToggle={() => setTransactionsExpanded((value) => !value)} /></section>
    </div>
    <BreakdownDetails accountExpenses={data.accountExpenses || []} creatorExpenses={data.creatorExpenses || []} />
    <Documents period={period} scopeLabel={scope.label} trendMonths={trendMonths} allocationRuleId={allocationRuleId} />
  </div>;
};

const ReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [trendMonths, setTrendMonths] = useState(6);
  const allocationRuleId = searchParams.get("allocation") || "";
  const setAllocationRuleId = useCallback((value) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set("allocation", value); else next.delete("allocation");
    return next;
  }, { replace: true }), [setSearchParams]);
  const resource = useApiResource("reports.monthly", { period, trend_months: trendMonths, allocation_rule_id: allocationRuleId });
  useEffect(() => {
    if (allocationRuleId && resource.data?.reportScope?.scopeUnavailable) setAllocationRuleId("");
  }, [allocationRuleId, resource.data?.reportScope?.scopeUnavailable, setAllocationRuleId]);
  if (resource.status === "loading") return <NativePageSkeleton kind="reports" label="Menyusun laporan…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <ReportsContent data={resource.data} period={period} setPeriod={setPeriod} trendMonths={trendMonths} setTrendMonths={setTrendMonths} allocationRuleId={allocationRuleId} setAllocationRuleId={setAllocationRuleId} refreshError={resource.refreshError} reload={resource.reload} />;
};

export default ReportsPage;

import { useState } from "react";
import { FiChevronLeft, FiChevronRight, FiFilter, FiSearch, FiX } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import { SelectionControl } from "../../../components/common/SelectionField.jsx";
import Modal from "../../../components/common/Modal.jsx";
import { currentMonthInJakarta, todayInJakarta } from "../../../domain/dates.js";
import { formatCompactRupiah } from "../../../domain/money.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { formatTransactionDate, TRANSACTION_LABELS, transactionCategoryIcon, transactionDisplayTitle, transactionListMetadata, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import styles from "./MobileTransactionHistory.module.css";


const dateKeyInJakarta = (date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(date);

const transactionDateGroupLabel = (value) => {
  const key = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "Tanggal tidak tersedia";
  const today = todayInJakarta();
  if (key === today) return "Hari ini";
  const yesterday = dateKeyInJakarta(new Date(new Date(`${today}T12:00:00+07:00`).getTime() - 86400000));
  if (key === yesterday) return "Kemarin";
  const parsed = new Date(`${key}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return formatTransactionDate(key);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }), timeZone: "Asia/Jakarta" }).format(parsed);
};

const groupTransactionsByDate = (items) => {
  const groups = [];
  const byDate = new Map();
  for (const item of items) {
    const key = String(item.transaction_date || "").slice(0, 10) || "unknown";
    if (!byDate.has(key)) {
      const group = { key, label: transactionDateGroupLabel(key), items: [] };
      byDate.set(key, group);
      groups.push(group);
    }
    byDate.get(key).items.push(item);
  }
  return groups;
};

const COMMON_TYPES = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "expense", label: "Pengeluaran" },
  { value: "income", label: "Pemasukan" },
  { value: "transfer", label: "Transfer" },
]);

const ALL_TYPES = Object.freeze([
  ...COMMON_TYPES,
  { value: "refund", label: "Pengembalian" },
  { value: "adjustment", label: "Penyesuaian" },
]);

const shiftPeriod = (period, offset) => {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!Number.isInteger(year) || month < 1 || month > 12) return currentMonthInJakarta();
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (period) => {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!Number.isInteger(year) || month < 1 || month > 12) return "Periode";
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const trendGeometry = (items) => {
  const width = 320;
  const top = 8;
  const bottom = 82;
  const values = items.map((item) => Number(item.net || 0));
  if (!values.length) return { points: "", area: "" };
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = Math.max(1, max - min);
  const pointPairs = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = bottom - ((value - min) / range) * (bottom - top);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });
  const points = pointPairs.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${points} ${width},${bottom} 0,${bottom}`;
  return { points, area };
};

const periodStateLabel = ({ period, periodLocked }) => {
  if (periodLocked) return "Periode dikunci";
  return period === currentMonthInJakarta() ? "Periode aktif" : "Periode historis";
};

export const MobileTransactionOverview = ({ period, periodLocked, onPeriodChange, report, total, filtersActive }) => {
  const currentPeriod = currentMonthInJakarta();
  const geometry = trendGeometry(report.data?.trend?.items || []);
  const cashFlow = report.data?.overview?.cashFlow;
  const canGoNext = period < currentPeriod;
  const resultLabel = `${Number(total || 0).toLocaleString("id-ID")} ${filtersActive ? "hasil" : "transaksi"}`;
  return <section className={styles.overview} aria-label="Periode dan aktivitas transaksi">
    <div className={styles.periodNav}>
      <button type="button" onClick={() => onPeriodChange(shiftPeriod(period, -1))} aria-label="Bulan sebelumnya"><FiChevronLeft aria-hidden="true" /></button>
      <div className={styles.periodCopy}><strong>{periodLabel(period)}</strong><span>{periodStateLabel({ period, periodLocked })}</span></div>
      <button type="button" disabled={!canGoNext} onClick={() => onPeriodChange(shiftPeriod(period, 1))} aria-label="Bulan berikutnya"><FiChevronRight aria-hidden="true" /></button>
    </div>
    {report.status === "ready" && geometry.points ? <div className={styles.chartWrap}>
      <svg className={styles.chart} viewBox="0 0 320 94" role="img" aria-label="Tren arus kas enam bulan sampai periode terpilih">
        <polygon className={styles.chartArea} points={geometry.area} />
        <polyline className={styles.chartLine} points={geometry.points} />
      </svg>
    </div> : null}
    {report.status === "loading" ? <div className={styles.chartSkeleton} aria-label="Memuat ringkasan transaksi" role="status" /> : null}
    {report.status === "error" ? <button type="button" className={styles.reportRetry} onClick={report.reload}>Ringkasan belum tersedia · Coba lagi</button> : null}
    <div className={styles.metrics} aria-label="Ringkasan periode">
      {cashFlow ? <><span>Masuk <strong className={styles.income}>{formatCompactRupiah(cashFlow.income)}</strong></span><i /><span>Keluar <strong className={styles.expense}>{formatCompactRupiah(cashFlow.expense)}</strong></span><i /></> : null}
      <span>{resultLabel}</span>
    </div>
  </section>;
};

const advancedDraftFrom = (filters) => ({ type: filters.type, allocation: filters.allocation, account: filters.account, category: filters.category, creator: filters.creator });
const advancedCount = (filters) => [filters.allocation, filters.account, filters.category, filters.creator].filter((value) => value !== "all").length
  + (COMMON_TYPES.some((item) => item.value === filters.type) ? 0 : 1);

export const MobileTransactionFilters = ({ draftQuery, setDraftQuery, filters, setFilters, filterOptions, submitSearch }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState(() => advancedDraftFrom(filters));
  const filterCount = advancedCount(filters);
  const resetAdvancedDraft = () => setAdvancedDraft({ type: "all", allocation: "all", account: "all", category: "all", creator: "all" });
  const openAdvanced = () => { setAdvancedDraft(advancedDraftFrom(filters)); setAdvancedOpen(true); };
  const applyAdvanced = () => { setFilters((current) => ({ ...current, ...advancedDraft, offset: 0 })); setAdvancedOpen(false); };
  const submitMobileSearch = (event) => { submitSearch(event); setSearchOpen(false); };
  return <>
    <div className={styles.filterBar} aria-label="Filter cepat transaksi">
      <div className={styles.typeScroller}>
        {COMMON_TYPES.map((item) => <button key={item.value} type="button" className={filters.type === item.value ? styles.typeChipActive : styles.typeChip} onClick={() => setFilters((current) => ({ ...current, type: item.value, offset: 0 }))}>{item.label}</button>)}
      </div>
      <button type="button" className={`${styles.iconFilter}${filters.query ? ` ${styles.iconFilterActive}` : ""}`} onClick={() => setSearchOpen(true)} aria-label={filters.query ? `Cari transaksi, filter aktif: ${filters.query}` : "Cari transaksi"}><FiSearch aria-hidden="true" /></button>
      <button type="button" className={`${styles.iconFilter}${filterCount ? ` ${styles.iconFilterActive}` : ""}`} onClick={openAdvanced} aria-label={filterCount ? `Filter lainnya, ${filterCount} aktif` : "Filter lainnya"}><FiFilter aria-hidden="true" />{filterCount ? <span>{filterCount}</span> : null}</button>
    </div>
    <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Cari transaksi" description="Cari berdasarkan keterangan, merchant, atau kategori." size="sm">
      <form className={styles.searchForm} onSubmit={submitMobileSearch}>
        <label className="search-field"><FiSearch aria-hidden="true" /><input autoFocus type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Cari transaksi" /><span className="sr-only">Cari transaksi</span></label>
        <div className={styles.modalActions}>{filters.query ? <Button type="button" onClick={() => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", offset: 0 })); setSearchOpen(false); }}>Hapus pencarian</Button> : null}<Button type="submit" variant="primary">Cari</Button></div>
      </form>
    </Modal>
    <Modal
      open={advancedOpen}
      onClose={() => setAdvancedOpen(false)}
      title="Filter transaksi"
      description="Tampilkan transaksi yang ingin dilihat."
      size="sm"
      className={styles.filterModal}
      footer={<div className={styles.filterFooterActions}><Button type="button" className={styles.filterResetButton} onClick={resetAdvancedDraft}>Reset</Button><Button type="button" className={styles.filterApplyButton} variant="primary" onClick={applyAdvanced}>Terapkan filter</Button></div>}
    >
      <section className={styles.filterTypeSection} aria-labelledby="mobile-transaction-type-filter">
        <strong id="mobile-transaction-type-filter">Jenis transaksi</strong>
        <div className={styles.filterTypeGrid}>
          {ALL_TYPES.map((item) => <button key={item.value} type="button" className={advancedDraft.type === item.value ? styles.filterTypeButtonActive : styles.filterTypeButton} aria-pressed={advancedDraft.type === item.value} onClick={() => setAdvancedDraft((current) => ({ ...current, type: item.value }))}>{item.label}</button>)}
        </div>
      </section>
      <div className={styles.filterSettings}>
        <div className={styles.filterSetting}>
          <span className={styles.filterSettingCopy}><strong>Alokasi Dana</strong><small>Sumber alokasi transaksi</small></span>
          <span className={styles.filterSelect}><SelectionControl compact value={advancedDraft.allocation} onChange={(allocation) => setAdvancedDraft((current) => ({ ...current, allocation }))} ariaLabel="Filter Alokasi Dana" options={[{ value: "all", label: "Semua" }, { value: "unallocated", label: "Belum dialokasikan" }, { value: "allocated", label: "Menggunakan alokasi" }]} /></span>
        </div>
        <div className={styles.filterSetting}>
          <span className={styles.filterSettingCopy}><strong>Rekening</strong><small>Rekening yang digunakan</small></span>
          <span className={styles.filterSelect}><SelectionControl compact value={advancedDraft.account} onChange={(account) => setAdvancedDraft((current) => ({ ...current, account }))} ariaLabel="Filter rekening" searchable={filterOptions.accounts.length > 8} options={[{ value: "all", label: "Semua" }, ...filterOptions.accounts.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item) }))]} /></span>
        </div>
        <div className={styles.filterSetting}>
          <span className={styles.filterSettingCopy}><strong>Kategori</strong><small>Kategori transaksi</small></span>
          <span className={styles.filterSelect}><SelectionControl compact value={advancedDraft.category} onChange={(category) => setAdvancedDraft((current) => ({ ...current, category }))} ariaLabel="Filter kategori" searchable={filterOptions.categories.length > 8} searchPlaceholder="Cari kategori…" options={[{ value: "all", label: "Semua" }, ...filterOptions.categories.map((item) => ({ value: item.category_id, label: item.name }))]} /></span>
        </div>
        <div className={styles.filterSetting}>
          <span className={styles.filterSettingCopy}><strong>Pencatat</strong><small>Siapa yang mencatat</small></span>
          <span className={styles.filterSelect}><SelectionControl compact value={advancedDraft.creator} onChange={(creator) => setAdvancedDraft((current) => ({ ...current, creator }))} ariaLabel="Filter pencatat" searchable={filterOptions.creators.length > 8} options={[{ value: "all", label: "Semua" }, ...filterOptions.creators.map((item) => ({ value: item.user_id, label: item.name }))]} /></span>
        </div>
      </div>
    </Modal>
  </>;
};

const mobileFlag = (item) => {
  if (item.status === "cancelled") return { label: "Dibatalkan", tone: "negative" };
  if (item.managed_by === "recurring") return { label: "Jadwal rutin", tone: "primary" };
  if (item.managed_by === "goal") return { label: "Target", tone: "primary" };
  if (item.transaction_type === "expense" && !item.envelope_period_id) return { label: "Belum masuk Alokasi Dana", tone: "warning" };
  return null;
};

export const MobileTransactionRow = ({ item, categoryLookup, accountLabel, creatorLabel, onOpenDetail }) => {
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = transactionDisplayTitle(item, category);
  const tone = transactionTone(item.transaction_type);
  const sign = transactionSign(item.transaction_type);
  const metadata = transactionListMetadata({ item, category, account: accountLabel(item), creator: creatorLabel(item) }).join(" · ");
  const flag = mobileFlag(item);
  return <button type="button" className={`${styles.row}${item.status === "cancelled" ? ` ${styles.rowCancelled}` : ""}`} onClick={() => onOpenDetail(item)} aria-label={`Buka detail ${title}`}>
    <span className={`${styles.rowIcon} ${styles[`rowIcon_${item.transaction_type || "default"}`] || ""}`}><Icon aria-hidden="true" /></span>
    <span className={styles.rowCopy}><strong>{title}</strong>{metadata ? <small>{metadata}</small> : null}{flag ? <em className={`${styles.flag} ${styles[`flag_${flag.tone}`]}`}>{flag.label}</em> : null}</span>
    <span className={styles.rowMoney}><span className={`${styles.rowAmount} money--${tone}`}>{sign}<span className="money">{formatCompactRupiah(item.amount)}</span></span><small>{TRANSACTION_LABELS[item.transaction_type] || "Transaksi"}</small></span>
  </button>;
};

export const MobileTransactionList = ({ groups, categoryLookup, accountLabel, creatorLabel, onOpenDetail }) => <div className={styles.list} aria-label="Daftar transaksi">{groups.map((group) => <section key={group.key} className={styles.group} aria-labelledby={`transaction-date-${group.key}`}><header><h2 id={`transaction-date-${group.key}`}>{group.label}</h2><span>{group.items.length} transaksi</span></header><div className={styles.groupList}>{group.items.map((item) => <MobileTransactionRow key={item.transaction_id} item={item} categoryLookup={categoryLookup} accountLabel={accountLabel} creatorLabel={creatorLabel} onOpenDetail={onOpenDetail} />)}</div></section>)}</div>;

export const MobileTransactionPager = ({ resource, filters, setFilters, itemCount, pageSize }) => {
  const hasPrevious = Boolean(filters.offset);
  const hasNext = Boolean(resource.data?.hasMore);
  if (!hasPrevious && !hasNext) return null;
  const start = Number(resource.data?.offset || 0) + 1;
  const end = Number(resource.data?.offset || 0) + itemCount;
  return <nav className={styles.pager} aria-label="Navigasi riwayat transaksi"><span>{start}–{end} dari {resource.data?.total || end}</span><div><button type="button" disabled={!hasPrevious || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - pageSize) }))} aria-label="Transaksi sebelumnya"><FiChevronLeft aria-hidden="true" /></button><button type="button" disabled={!hasNext || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: resource.data?.nextOffset || current.offset + pageSize }))} aria-label="Transaksi berikutnya"><FiChevronRight aria-hidden="true" /></button></div></nav>;
};

export const MobileActiveFilterSummary = ({ filters, setFilters, setDraftQuery }) => {
  const labels = [];
  if (filters.query) labels.push({ key: "query", label: `Cari: ${filters.query}` });
  if (!COMMON_TYPES.some((item) => item.value === filters.type)) labels.push({ key: "type", label: TRANSACTION_LABELS[filters.type] || filters.type });
  if (filters.allocation !== "all") labels.push({ key: "allocation", label: filters.allocation === "allocated" ? "Menggunakan Alokasi Dana" : "Belum masuk Alokasi Dana" });
  if (filters.account !== "all") labels.push({ key: "account", label: "Rekening terpilih" });
  if (filters.category !== "all") labels.push({ key: "category", label: "Kategori terpilih" });
  if (filters.creator !== "all") labels.push({ key: "creator", label: "Pencatat terpilih" });
  if (!labels.length) return null;
  const clear = (key) => {
    if (key === "query") setDraftQuery("");
    setFilters((current) => ({ ...current, [key]: key === "query" ? "" : "all", offset: 0 }));
  };
  return <div className={styles.activeFilters} aria-label="Filter transaksi aktif">{labels.map((item) => <button key={item.key} type="button" onClick={() => clear(item.key)}><span>{item.label}</span><FiX aria-hidden="true" /></button>)}</div>;
};


const MobileTransactionHistory = ({
  period,
  periodLocked,
  onPeriodChange,
  report,
  total,
  filtersActive,
  draftQuery,
  setDraftQuery,
  filters,
  setFilters,
  filterOptions,
  submitSearch,
  items,
  categoryLookup,
  accountLabel,
  creatorLabel,
  onOpenDetail,
  resource,
  pageSize,
  attentionNotice,
  resourceStates,
}) => (
  <>
    <MobileTransactionOverview period={period} periodLocked={periodLocked} onPeriodChange={onPeriodChange} report={report} total={total} filtersActive={filtersActive} />
    {attentionNotice}
    <MobileTransactionFilters draftQuery={draftQuery} setDraftQuery={setDraftQuery} filters={filters} setFilters={setFilters} filterOptions={filterOptions} submitSearch={submitSearch} />
    <MobileActiveFilterSummary filters={filters} setFilters={setFilters} setDraftQuery={setDraftQuery} />
    {resourceStates}
    {items.length ? (
      <>
        <MobileTransactionList groups={groupTransactionsByDate(items)} categoryLookup={categoryLookup} accountLabel={accountLabel} creatorLabel={creatorLabel} onOpenDetail={onOpenDetail} />
        <MobileTransactionPager resource={resource} filters={filters} setFilters={setFilters} itemCount={items.length} pageSize={pageSize} />
      </>
    ) : null}
  </>
);

export default MobileTransactionHistory;

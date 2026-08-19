import { useMemo, useRef } from "react";
import {
  FiArchive,
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
  FiCreditCard,
  FiEdit2,
  FiPieChart,
  FiTrendingUp,
} from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import LineChart from "../../../components/charts/LineChart.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import { useMediaQuery } from "../../../hooks/useMediaQuery.js";
import {
  accountOwnershipLabel,
  accountProviderLabel,
  formatAccountNumber,
} from "../../../shared/presentation/account.js";
import {
  accountTransactionDirection,
  formatTransactionDate,
  transactionCategoryIcon,
  TRANSACTION_LABELS,
} from "../../../shared/presentation/transaction.js";
import { AccountVisual } from "./AccountFinancialCard.jsx";
import styles from "./DesktopAccountsWorkspace.module.css";

const DESKTOP_QUERY = "(min-width: 821px)";
const RECENT_TRANSACTION_LIMIT = 6;
const CAROUSEL_SWIPE_MIN_DISTANCE = 42;
const OWNERSHIP_FILTERS = Object.freeze([
  ["all", "Semua"],
  ["self", "Saya"],
  ["partner", "Pasangan"],
  ["shared", "Bersama"],
]);

const useDesktopWorkspaceEnabled = () => useMediaQuery(DESKTOP_QUERY, { fallback: true });

const balanceTone = (value) => Number(value || 0) < 0 ? "negative" : "default";

const RecentTransactionRow = ({ item, category, selectedAccountId }) => {
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const direction = accountTransactionDirection(item, selectedAccountId);
  const inactive = Boolean(item.status && item.status !== "active");
  return (
    <li className={styles.transactionRow}>
      <span className={styles.transactionIcon} data-type={item.transaction_type || "default"}><Icon aria-hidden="true" /></span>
      <span className={styles.transactionCopy}>
        <strong>{item.description || item.merchant || "Tanpa keterangan"}</strong>
        <small>{formatTransactionDate(item.transaction_date)} · {category?.name || TRANSACTION_LABELS[item.transaction_type] || "Transaksi"}</small>
      </span>
      <span className={styles.transactionAmount} data-tone={inactive ? "neutral" : direction.tone}>
        {inactive || !direction.prefix ? null : <span aria-hidden="true">{direction.prefix}</span>}<Money value={item.amount || 0} tone={inactive ? "default" : direction.tone} />
      </span>
    </li>
  );
};

const DistributionRow = ({ account, percentage }) => (
  <div className={styles.distributionRow}>
    <span className={styles.distributionMeta}>
      <span><strong>{account.name}</strong><small>{percentage}% dari distribusi saldo</small></span>
      <Money value={account.balance || 0} tone={balanceTone(account.balance)} />
    </span>
    <progress className={styles.distributionProgress} max="100" value={percentage} aria-label={`Porsi saldo ${account.name} ${percentage}%`} />
  </div>
);

const AccountCarousel = ({ accounts, account, onSelectAccount }) => {
  const selectedIndex = Math.max(0, accounts.findIndex((item) => item.account_id === account.account_id));
  const hasMultipleAccounts = accounts.length > 1;
  const pointerStartRef = useRef(null);

  const selectIndex = (index) => {
    if (!accounts.length) return;
    const normalizedIndex = (index + accounts.length) % accounts.length;
    const nextAccount = accounts[normalizedIndex];
    if (nextAccount && nextAccount.account_id !== account.account_id) onSelectAccount(nextAccount.account_id);
  };

  const handleKeyDown = (event) => {
    if (!hasMultipleAccounts) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectIndex(selectedIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectIndex(selectedIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectIndex(accounts.length - 1);
    }
  };

  const handlePointerDown = (event) => {
    if (!hasMultipleAccounts || event.button > 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerEnd = (event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || !hasMultipleAccounts) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < CAROUSEL_SWIPE_MIN_DISTANCE || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    selectIndex(deltaX < 0 ? selectedIndex + 1 : selectedIndex - 1);
  };

  return (
    <div className={styles.accountCarousel} role="group" aria-label="Pilih rekening">
      <div className={styles.carouselHeader}>
        <div><strong>Pilih rekening</strong><small>Geser kartu untuk berpindah rekening</small></div>
        <span>{selectedIndex + 1} dari {accounts.length}</span>
      </div>
      <div className={styles.carouselStage}>
        <button type="button" className={styles.carouselArrow} aria-label="Rekening sebelumnya" disabled={!hasMultipleAccounts} onClick={() => selectIndex(selectedIndex - 1)}>
          <FiChevronLeft aria-hidden="true" />
        </button>
        <div
          className={styles.carouselViewport}
          role="group"
          tabIndex={hasMultipleAccounts ? 0 : -1}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={() => { pointerStartRef.current = null; }}
          aria-label={`Rekening ${account.name}, ${selectedIndex + 1} dari ${accounts.length}`}
          aria-live="polite"
        >
          <div className={styles.heroVisual}><AccountVisual account={account} carousel /></div>
        </div>
        <button type="button" className={styles.carouselArrow} aria-label="Rekening berikutnya" disabled={!hasMultipleAccounts} onClick={() => selectIndex(selectedIndex + 1)}>
          <FiChevronRight aria-hidden="true" />
        </button>
      </div>
      {hasMultipleAccounts ? (
        <div className={styles.carouselDots} aria-label="Pilih rekening berdasarkan posisi">
          {accounts.map((item, index) => (
            <button
              key={item.account_id}
              type="button"
              className={styles.carouselDot}
              aria-label={`Pilih rekening ${item.name}`}
              aria-pressed={index === selectedIndex}
              onClick={() => selectIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const SelectedAccountHero = ({ accounts, account, ownerMode, onSelectAccount, onEditAccount, onArchiveAccount }) => {
  const canManage = Boolean(account.can_manage ?? ownerMode);
  const readOnly = Boolean(account.read_only);
  return (
    <section className={styles.heroPanel} aria-labelledby="desktop-selected-account-title">
      <div className={styles.heroCopy}>
        <div className={styles.heroTitleRow}>
          <div>
            <p className="eyebrow">Rekening terpilih</p>
            <h2 id="desktop-selected-account-title">{account.name}</h2>
            <p>{accountProviderLabel(account)} · {accountOwnershipLabel(account)}</p>
          </div>
          {readOnly ? <div className={styles.heroBadges}><span className={styles.readOnlyBadge}>Hanya lihat</span></div> : null}
        </div>
        <div className={styles.heroBalance}>
          <span>Saldo rekening</span>
          <strong><Money value={account.balance || 0} tone={balanceTone(account.balance)} /></strong>
        </div>
        <dl className={styles.heroFacts}>
          <div><dt>Dana tersedia</dt><dd><Money value={account.available_balance ?? account.balance ?? 0} tone={balanceTone(account.available_balance ?? account.balance)} /></dd></div>
          <div><dt>Dialokasikan</dt><dd><Money value={account.allocated_remaining || 0} /></dd></div>
          <div><dt>No. rekening</dt><dd>{account.account_number ? formatAccountNumber(account.account_number, { placeholder: false }) : "Belum diisi"}</dd></div>
          <div><dt>Kepemilikan</dt><dd>{accountOwnershipLabel(account)}</dd></div>
        </dl>
        <div className={styles.heroActions}>
          {account.status === "active" && canManage ? <Button icon={FiEdit2} onClick={() => onEditAccount(account)}>Edit</Button> : null}
          {account.status === "active" && canManage ? <Button variant="danger" icon={FiArchive} onClick={() => onArchiveAccount(account)}>Kelola data</Button> : null}
        </div>
      </div>
      <AccountCarousel accounts={accounts} account={account} onSelectAccount={onSelectAccount} />
    </section>
  );
};

const RecentTransactionsPanel = ({ resource, items, categoryLookup, selectedAccount, onViewTransactions }) => (
  <section className={styles.transactionsPanel} aria-labelledby="desktop-recent-transactions-title">
    <header className={styles.panelHeading}>
      <h2 id="desktop-recent-transactions-title">Transaksi terbaru</h2>
      <button type="button" className={styles.textAction} onClick={() => onViewTransactions(selectedAccount)}>Lihat semua <FiArrowRight aria-hidden="true" /></button>
    </header>
    {resource.status === "loading" ? <p className={styles.supportingState}>Memuat transaksi rekening…</p> : null}
    {resource.status === "error" ? <div className={styles.supportingState} role="status"><span>Transaksi terbaru belum dapat dimuat.</span><button type="button" onClick={resource.reload}>Coba lagi</button></div> : null}
    {resource.status === "ready" && !items.length ? <p className={styles.supportingState}>Belum ada transaksi untuk rekening ini pada periode berjalan.</p> : null}
    {items.length ? <ul className={styles.transactionList}>{items.map((item) => <RecentTransactionRow key={item.transaction_id} item={item} category={categoryLookup[item.category_id]} selectedAccountId={selectedAccount.account_id} />)}</ul> : null}
  </section>
);

const AccountInsights = ({ accounts, totalBalance, balanceTrend, distribution, reportStatus }) => (
  <aside className={styles.insightColumn} aria-label="Ringkasan seluruh rekening">
    <section className={styles.balanceSummary}>
      <span className={styles.summaryIcon}><FiCreditCard aria-hidden="true" /></span>
      <div><p>Total saldo</p><strong><Money value={totalBalance} tone={balanceTone(totalBalance)} /></strong><small>{accounts.length} rekening aktif</small></div>
    </section>
    <section className={styles.trendPanel} aria-labelledby="desktop-balance-trend-title">
      <header className={styles.compactHeading}><span><FiTrendingUp aria-hidden="true" /></span><h2 id="desktop-balance-trend-title">Tren saldo</h2></header>
      {reportStatus === "loading" ? <div className={styles.chartState}>Memuat tren saldo…</div> : reportStatus === "error" ? <div className={styles.chartState}>Tren belum dapat dimuat. Total saldo tetap berasal dari daftar rekening terbaru.</div> : <div className={styles.balanceChart}><LineChart data={balanceTrend} label="Tren total saldo seluruh rekening" /></div>}
    </section>
    <section className={styles.distributionPanel} aria-labelledby="desktop-account-distribution-title">
      <header className={styles.compactHeading}><span><FiPieChart aria-hidden="true" /></span><h2 id="desktop-account-distribution-title">Komposisi saldo</h2></header>
      <div className={styles.distributionList}>{distribution.map(({ account, percentage }) => <DistributionRow key={account.account_id} account={account} percentage={percentage} />)}</div>
      <p className={styles.distributionNote}>Persentase memakai nilai absolut agar saldo negatif tetap terbaca.</p>
    </section>
  </aside>
);

const DesktopAccountsWorkspace = ({ accounts, allAccounts, selectedAccount, ownershipFilter, onOwnershipFilterChange, ownerMode, bootstrap, onSelectAccount, onViewTransactions, onEditAccount, onArchiveAccount }) => {
  const desktopEnabled = useDesktopWorkspaceEnabled();
  const period = currentMonthInJakarta();
  const selectedId = selectedAccount?.account_id || "";
  const recentTransactionsResource = useApiResource("transactions.list", {
    period, limit: RECENT_TRANSACTION_LIMIT, offset: 0, query: "", transaction_type: "all", allocation: "all",
    account_id: selectedId || "all", category_id: "all", created_by: "all",
  }, { enabled: desktopEnabled && Boolean(selectedId) });
  const reportResource = useApiResource("reports.monthly", { period, trend_months: 6 }, { enabled: desktopEnabled });
  const insightAccounts = allAccounts?.length ? allAccounts : accounts;
  const totalBalance = useMemo(() => insightAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [insightAccounts]);
  const distributionBase = useMemo(() => insightAccounts.reduce((sum, account) => sum + Math.abs(Number(account.balance || 0)), 0), [insightAccounts]);
  const distribution = useMemo(() => insightAccounts.map((account) => ({ account, percentage: distributionBase > 0 ? Math.round((Math.abs(Number(account.balance || 0)) / distributionBase) * 100) : 0 })), [distributionBase, insightAccounts]);
  const balanceTrend = useMemo(() => {
    const items = reportResource.data?.trend?.items || [];
    return items.length ? items.map((item) => ({ label: item.label, value: item.totalBalance })) : [{ label: "Saat ini", value: totalBalance }];
  }, [reportResource.data, totalBalance]);
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  if (!desktopEnabled || !selectedAccount) return null;

  return (
    <div className={styles.desktopAccountsArea}>
      <div className={styles.ownershipFilters} role="group" aria-label="Filter kepemilikan rekening">
        {OWNERSHIP_FILTERS.map(([value, label]) => <button key={value} type="button" className={styles.ownershipFilter} aria-pressed={ownershipFilter === value} onClick={() => onOwnershipFilterChange(value)}>{label}</button>)}
      </div>
      <div className={styles.desktopWorkspace}>
        <div className={styles.leftColumn}>
          <SelectedAccountHero accounts={accounts} account={selectedAccount} ownerMode={ownerMode} onSelectAccount={onSelectAccount} onEditAccount={onEditAccount} onArchiveAccount={onArchiveAccount} />
          <RecentTransactionsPanel resource={recentTransactionsResource} items={recentTransactionsResource.data?.items || []} categoryLookup={categoryLookup} selectedAccount={selectedAccount} onViewTransactions={onViewTransactions} />
        </div>
        <AccountInsights accounts={insightAccounts} totalBalance={totalBalance} balanceTrend={balanceTrend} distribution={distribution} reportStatus={reportResource.status} />
      </div>
    </div>
  );
};

export default DesktopAccountsWorkspace;

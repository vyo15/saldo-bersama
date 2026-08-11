import { useEffect, useMemo, useState } from "react";
import {
  FiArchive,
  FiArrowRight,
  FiClock,
  FiEdit2,
  FiFileText,
  FiPieChart,
  FiTrendingUp,
  FiCreditCard,
} from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import LineChart from "../../../components/charts/LineChart.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import {
  accountOwnerName,
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

const useDesktopWorkspaceEnabled = () => {
  const [enabled, setEnabled] = useState(() => typeof window === "undefined" || window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = (event) => setEnabled(event.matches);
    setEnabled(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return enabled;
};

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

const AccountSelectorCard = ({ account, onSelect }) => (
  <button type="button" className={styles.accountSelector} aria-label={`Pilih rekening ${account.name}`} onClick={() => onSelect(account.account_id)}>
    <span className={styles.miniVisual}><AccountVisual account={account} carousel /></span>
    <span className={styles.accountSelectorMeta}>
      <span><strong>{account.name}</strong><small>{accountProviderLabel(account)}</small></span>
      <Money value={account.balance || 0} tone={balanceTone(account.balance)} />
    </span>
  </button>
);

const DistributionRow = ({ account, percentage, selected, onSelect }) => (
  <button type="button" className={styles.distributionRow} aria-pressed={selected} onClick={() => onSelect(account.account_id)}>
    <span className={styles.distributionMeta}>
      <span><strong>{account.name}</strong><small>{percentage}% dari distribusi saldo</small></span>
      <Money value={account.balance || 0} tone={balanceTone(account.balance)} />
    </span>
    <progress className={styles.distributionProgress} max="100" value={percentage} aria-label={`Porsi saldo ${account.name} ${percentage}%`} />
  </button>
);

const SelectedAccountHero = ({ account, ownerMode, onViewTransactions, onEditAccount, onArchiveAccount }) => {
  const canManage = Boolean(account.can_manage ?? ownerMode);
  const readOnly = Boolean(account.read_only);
  return (
    <section className={styles.heroPanel} aria-labelledby="desktop-selected-account-title">
      <div className={styles.heroCopy}>
        <div className={styles.heroTitleRow}>
          <div>
            <p className="eyebrow">Rekening utama</p>
            <h2 id="desktop-selected-account-title">{account.name}</h2>
            <p>{accountProviderLabel(account)} · {accountOwnershipLabel(account)}</p>
          </div>
          <div className={styles.heroBadges}>
            <StatusBadge status={account.status || "active"} />
            {readOnly ? <span className={styles.readOnlyBadge}>Hanya lihat</span> : null}
          </div>
        </div>
        <div className={styles.heroBalance}>
          <span>Saldo saat ini</span>
          <strong><Money value={account.balance || 0} tone={balanceTone(account.balance)} /></strong>
        </div>
        <dl className={styles.heroFacts}>
          <div><dt>No. rekening</dt><dd>{account.account_number ? formatAccountNumber(account.account_number, { placeholder: false }) : "Belum diisi"}</dd></div>
          <div><dt>Saldo awal</dt><dd><Money value={account.initial_balance || 0} /></dd></div>
          <div><dt>Pemilik</dt><dd>{account.owner_scope === "personal" ? accountOwnerName(account) || "Belum tersedia" : "Kedua pengguna"}</dd></div>
          <div><dt>Kepemilikan</dt><dd>{accountOwnershipLabel(account)}</dd></div>
        </dl>
        <div className={styles.heroActions}>
          <Button variant="primary" icon={FiFileText} onClick={() => onViewTransactions(account)}>Lihat transaksi</Button>
          {account.status === "active" && canManage ? <Button icon={FiEdit2} onClick={() => onEditAccount(account)}>Edit</Button> : null}
          {account.status === "active" && canManage ? <Button variant="danger" icon={FiArchive} onClick={() => onArchiveAccount(account)}>Hapus / Arsipkan</Button> : null}
        </div>
      </div>
      <div className={styles.heroVisual} aria-hidden="true"><AccountVisual account={account} carousel /></div>
    </section>
  );
};

const OtherAccountsPanel = ({ accounts, onSelectAccount }) => (
  <section className={styles.otherAccountsPanel} aria-labelledby="desktop-other-accounts-title">
    <header className={styles.panelHeading}>
      <h2 id="desktop-other-accounts-title">Rekening lain</h2>
      <span>{accounts.length} lainnya</span>
    </header>
    {accounts.length ? (
      <div className={styles.accountSelectorGrid}>{accounts.map((account) => <AccountSelectorCard key={account.account_id} account={account} onSelect={onSelectAccount} />)}</div>
    ) : <p className={styles.supportingState}>Belum ada rekening lain untuk dipilih.</p>}
  </section>
);

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

const AccountInsights = ({ accounts, selectedAccount, totalBalance, balanceTrend, distribution, reportStatus, onSelectAccount }) => (
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
      <div className={styles.distributionList}>{distribution.map(({ account, percentage }) => <DistributionRow key={account.account_id} account={account} percentage={percentage} selected={account.account_id === selectedAccount.account_id} onSelect={onSelectAccount} />)}</div>
      <p className={styles.distributionNote}>Persentase memakai nilai absolut agar saldo negatif tetap terbaca.</p>
    </section>
    <section className={styles.accountPulse}>
      <span><FiClock aria-hidden="true" /></span>
      <div><p>Rekening terpilih</p><strong>{selectedAccount.name}</strong><small>{accountProviderLabel(selectedAccount)} · {accountOwnershipLabel(selectedAccount)}</small></div>
    </section>
  </aside>
);

const DesktopAccountsWorkspace = ({ accounts, selectedAccount, ownerMode, bootstrap, onSelectAccount, onViewTransactions, onEditAccount, onArchiveAccount }) => {
  const desktopEnabled = useDesktopWorkspaceEnabled();
  const period = currentMonthInJakarta();
  const selectedId = selectedAccount?.account_id || "";
  const recentTransactionsResource = useApiResource("transactions.list", {
    period, limit: RECENT_TRANSACTION_LIMIT, offset: 0, query: "", transaction_type: "all", allocation: "all",
    account_id: selectedId || "all", category_id: "all", created_by: "all",
  }, { enabled: desktopEnabled && Boolean(selectedId) });
  const reportResource = useApiResource("reports.monthly", { period, trend_months: 6 }, { enabled: desktopEnabled });
  const totalBalance = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);
  const distributionBase = useMemo(() => accounts.reduce((sum, account) => sum + Math.abs(Number(account.balance || 0)), 0), [accounts]);
  const distribution = useMemo(() => accounts.map((account) => ({ account, percentage: distributionBase > 0 ? Math.round((Math.abs(Number(account.balance || 0)) / distributionBase) * 100) : 0 })), [accounts, distributionBase]);
  const balanceTrend = useMemo(() => {
    const items = reportResource.data?.trend?.items || [];
    return items.length ? items.map((item) => ({ label: item.label, value: item.totalBalance })) : [{ label: "Saat ini", value: totalBalance }];
  }, [reportResource.data, totalBalance]);
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  if (!desktopEnabled || !selectedAccount) return null;

  return (
    <div className={styles.desktopWorkspace}>
      <div className={styles.leftColumn}>
        <SelectedAccountHero account={selectedAccount} ownerMode={ownerMode} onViewTransactions={onViewTransactions} onEditAccount={onEditAccount} onArchiveAccount={onArchiveAccount} />
        <OtherAccountsPanel accounts={accounts.filter((account) => account.account_id !== selectedAccount.account_id)} onSelectAccount={onSelectAccount} />
        <RecentTransactionsPanel resource={recentTransactionsResource} items={recentTransactionsResource.data?.items || []} categoryLookup={categoryLookup} selectedAccount={selectedAccount} onViewTransactions={onViewTransactions} />
      </div>
      <AccountInsights accounts={accounts} selectedAccount={selectedAccount} totalBalance={totalBalance} balanceTrend={balanceTrend} distribution={distribution} reportStatus={reportResource.status} onSelectAccount={onSelectAccount} />
    </div>
  );
};

export default DesktopAccountsWorkspace;

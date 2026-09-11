import {
  FiAlertCircle,
  FiCalendar,
  FiEye,
  FiEyeOff,
  FiMinus,
  FiPieChart,
  FiPlus,
  FiSearch,
  FiShield,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
} from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import PageInfoButton from "../../../components/common/PageInfoButton.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import SelectionField from "../../../components/common/SelectionField.jsx";
import { categoryOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import { ACCOUNT_AVAILABLE_BALANCE_HINT } from "../../../shared/presentation/account.js";
import {
  formatTransactionDate,
  transactionCategoryIcon,
  TRANSACTION_LABELS,
  transactionTone,
} from "../../../shared/presentation/transaction.js";
import { scrollIntoViewWithMotionPreference } from "../../../shared/motion.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { AccountVisual } from "../../accounts/components/AccountFinancialCard.jsx";
import { dashboardDueLabel, dashboardGoalEmptyAction, dashboardNeedEmptyAction, dashboardRecurringEmptyAction, formatPeriod, dashboardSyncLabel } from "../dashboardPresentation.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const CHART_COLORS = [
  "var(--dashboard-chart-1)",
  "var(--dashboard-chart-2)",
  "var(--dashboard-chart-3)",
  "var(--dashboard-chart-4)",
  "var(--dashboard-chart-5)",
];

const percentage = (value, maximum) => maximum > 0
  ? Math.max(0, Math.round((Number(value || 0) / Number(maximum)) * 100))
  : 0;

const accountTransactionDelta = (transaction, accountId) => {
  if (transaction.status && transaction.status !== "active") return 0;
  const amount = Number(transaction.amount || 0);
  if (transaction.transaction_type === "transfer") {
    if (transaction.destination_account_id === accountId) return amount;
    if (transaction.source_account_id === accountId) return -amount;
    return 0;
  }
  if (["income", "refund"].includes(transaction.transaction_type)) {
    return transaction.destination_account_id === accountId ? amount : 0;
  }
  if (transaction.transaction_type === "expense") {
    return transaction.source_account_id === accountId ? -amount : 0;
  }
  if (transaction.transaction_type === "adjustment") {
    return transaction.source_account_id === accountId ? amount : 0;
  }
  if (transaction.destination_account_id === accountId) return amount;
  return transaction.source_account_id === accountId ? -amount : 0;
};

const matchesAccount = (transaction, accountId) => (
  transaction.source_account_id === accountId || transaction.destination_account_id === accountId
);

const compactDate = (value) => {
  if (!value) return "Tanggal belum tersedia";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(parsed);
};

const filterAccountTransactions = ({ transactions, categoryFilter, typeFilter, searchTerm, categoryLookup }) => {
  const query = searchTerm.trim().toLocaleLowerCase("id-ID");
  return transactions.filter((item) => {
    if (categoryFilter !== "all" && item.category_id !== categoryFilter) return false;
    if (typeFilter !== "all" && item.transaction_type !== typeFilter) return false;
    if (!query) return true;
    return [
      item.description,
      item.merchant,
      categoryLookup[item.category_id]?.name,
      TRANSACTION_LABELS[item.transaction_type],
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query);
  });
};

const transactionRowsFor = (transactions, selectedAccount) => {
  let runningBalance = Number(selectedAccount?.balance || 0);
  const lookup = new Map();
  for (const item of transactions) {
    lookup.set(item.transaction_id, runningBalance);
    runningBalance -= accountTransactionDelta(item, selectedAccount?.account_id);
  }
  return (items) => items.map((item) => ({
    item,
    delta: accountTransactionDelta(item, selectedAccount?.account_id),
    balanceAfter: lookup.get(item.transaction_id) ?? Number(selectedAccount?.balance || 0),
  }));
};

const categoryStatistics = (expenseByCategory) => {
  const categoryTotal = expenseByCategory.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = expenseByCategory.length > 5
    ? [
      ...expenseByCategory.slice(0, 4),
      {
        category_id: "other-categories",
        name: "Lainnya",
        amount: expenseByCategory.slice(4).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      },
    ]
    : expenseByCategory.slice(0, 5);
  let cursor = 0;
  const segments = categories.map((item, index) => {
    const share = categoryTotal > 0 ? (Number(item.amount || 0) / categoryTotal) * 100 : 0;
    const start = cursor;
    cursor += share;
    return `${CHART_COLORS[index]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return {
    categoryTotal,
    categories,
    donutStyle: {
      background: segments.length ? `conic-gradient(${segments.join(",")})` : "var(--surface-soft)",
    },
  };
};

const planningSummary = (overview, expenseByCategory) => {
  const budgets = (overview.budgets || []).filter((item) => item.status !== "archived");
  const totalBudget = budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const usedBudget = budgets.reduce((sum, item) => sum + Number(item.used_amount || 0), 0);
  const biggestExpense = expenseByCategory.reduce(
    (largest, item) => Number(item.amount || 0) > Number(largest?.amount || 0) ? item : largest,
    null,
  );
  const recurringItems = (overview.recurring || [])
    .filter((item) => !["paid", "cancelled", "archived"].includes(item.occurrence_status || item.status))
    .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))
    .slice(0, 3);
  return {
    budgets,
    totalBudget,
    remainingBudget: Math.max(0, totalBudget - usedBudget),
    biggestExpense,
    recurringItems,
    goals: (overview.goals || []).filter((item) => item.status === "active").slice(0, 3),
    alerts: overview.alerts || [],
  };
};

const buildDesktopModel = ({
  overview,
  viewModel,
  selectedAccountId,
  categoryFilter,
  typeFilter,
  searchTerm,
  selectedTransactionId,
}) => {
  const { accountBalances, categoryLookup, recentTransactions, expenseByCategory } = viewModel;
  const selectedAccount = accountBalances.find((item) => item.account_id === selectedAccountId)
    || accountBalances[0]
    || null;
  const selectedAccountTransactions = selectedAccount
    ? recentTransactions.filter((item) => matchesAccount(item, selectedAccount.account_id))
    : [];
  const accountTransactions = filterAccountTransactions({
    transactions: selectedAccountTransactions,
    categoryFilter,
    typeFilter,
    searchTerm,
    categoryLookup,
  });
  const transactionRows = transactionRowsFor(selectedAccountTransactions, selectedAccount)(accountTransactions);
  const selectedTransaction = accountTransactions.find((item) => item.transaction_id === selectedTransactionId)
    || accountTransactions[0]
    || null;
  return {
    overview,
    accountBalances,
    categoryLookup,
    expenseByCategory,
    selectedAccount,
    selectedAccountTransactions,
    transactionRows,
    selectedTransaction,
    ...categoryStatistics(expenseByCategory),
    ...planningSummary(overview, expenseByCategory),
  };
};

const DashboardHeader = ({ overview, displayName, balanceVisible, onToggleBalance, onOpenTransaction }) => (
  <header className={dashboardClass("shared-dashboard__header")}>
    <div>
      <div className={dashboardClass("shared-dashboard__title-row")}>
        <h1>Hai, {displayName}</h1>
        <PageInfoButton title="Tentang Beranda">
          Beranda merangkum saldo, transaksi terbaru, alokasi, dan perhatian penting. Informasi di sini mengikuti data terbaru yang sudah diterima aplikasi.
        </PageInfoButton>
      </div>
      <p>Keuangan keluarga · <strong>{formatPeriod(overview.periodKey)}</strong></p>
    </div>
    <div className={dashboardClass("shared-dashboard__actions")}>
      <button
        type="button"
        className={dashboardClass("shared-icon-action")}
        onClick={onToggleBalance}
        aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}
        aria-pressed={!balanceVisible}
      >
        {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
      </button>
      <Button variant="primary" icon={FiPlus} onClick={onOpenTransaction}>Tambah transaksi</Button>
    </div>
  </header>
);

const PrimaryMetrics = ({ overview, model, balanceVisible }) => {
  const operatingAccountCount = model.accountBalances.filter((item) => item.account_type !== "investment").length;
  const nonInvestmentBalance = overview.nonInvestmentBalance ?? model.accountBalances
    .filter((item) => item.account_type !== "investment")
    .reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const netCashFlow = Number(overview.cashFlow.income || 0) - Number(overview.cashFlow.expense || 0);
  const NetCashFlowIcon = netCashFlow > 0 ? FiTrendingUp : netCashFlow < 0 ? FiTrendingDown : FiMinus;

  return (
    <section className={dashboardClass("desktop-balance-card shared-panel")} aria-label="Ringkasan keuangan utama">
      <div className={dashboardClass("desktop-balance-card__heading")}>
        <div>
          <span>Saldo rekening</span>
          <SensitiveMoney visible={balanceVisible} value={nonInvestmentBalance} />
          <small>{operatingAccountCount} rekening non-investasi aktif</small>
        </div>
        <div className={dashboardClass("desktop-balance-card__sync")}>
          <FiShield aria-hidden="true" />
          <span aria-live="polite">{dashboardSyncLabel(overview.lastSyncedAt)}</span>
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__safe")}>
        <div>
          <span>Aman digunakan</span>
          <SensitiveMoney visible={balanceVisible} value={overview.safeToSpend || 0} />
        </div>
        <div>
          <span>Batas aman per hari</span>
          <SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} />
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__secondary")}>
        <div>
          <span><NetCashFlowIcon aria-hidden="true" />Arus kas bersih</span>
          <SensitiveMoney
            visible={balanceVisible}
            value={netCashFlow}
            tone={netCashFlow < 0 ? "negative" : "positive"}
          />
        </div>
        <div>
          <span><FiPieChart aria-hidden="true" />Sisa kebutuhan</span>
          <SensitiveMoney visible={balanceVisible} value={model.remainingBudget} />
        </div>
      </div>
    </section>
  );
};

const DashboardAttention = ({ alerts }) => {
  if (!alerts.length) {
    return (
      <section className={dashboardClass("desktop-attention-card desktop-attention-card--clear shared-panel")} aria-label="Kondisi keuangan">
        <div className={dashboardClass("desktop-attention-card__heading")}>
          <div>
            <span>Perlu dilakukan</span>
            <strong>Kondisi keuangan terkendali</strong>
          </div>
          <span className={dashboardClass("desktop-attention-card__badge")}>0 tugas</span>
        </div>
        <div className={dashboardClass("desktop-attention-card__clear")}>
          <FiShield aria-hidden="true" />
          <p>Tidak ada tindakan mendesak dari kondisi aktif saat ini.</p>
        </div>
        <Link to="/notifikasi">Lihat semua perhatian</Link>
      </section>
    );
  }

  const first = alerts[0];
  const guidance = financialAlertGuidance(first);
  return (
    <section className={dashboardClass("desktop-attention-card shared-panel")} aria-label="Perlu perhatian">
      <div className={dashboardClass("desktop-attention-card__heading")}>
        <div>
          <span>Perlu dilakukan</span>
          <strong>{alerts.length === 1 ? "1 tugas prioritas" : `${alerts.length} tugas prioritas`}</strong>
        </div>
        <span className={dashboardClass("desktop-attention-card__badge")}>{alerts.length} tugas</span>
      </div>
      <Link className={dashboardClass("desktop-attention-card__task")} to={guidance.to} state={guidance.state}>
        <span className={dashboardClass("desktop-attention-card__icon")}><FiAlertCircle aria-hidden="true" /></span>
        <span>
          <strong>{first.title || first.message}</strong>
          <small>{first.message || "Tinjau kondisi ini agar data keuangan tetap sesuai."}</small>
        </span>
        <em>Tinjau sekarang</em>
      </Link>
      <Link to="/notifikasi">Lihat semua perhatian</Link>
    </section>
  );
};

const selectDashboardAccount = (accountId, onSelectAccount) => {
  onSelectAccount(accountId);
  if (typeof document === "undefined") return;
  const target = Array.from(document.querySelectorAll("[data-dashboard-account]"))
    .find((element) => element.dataset.dashboardAccount === accountId);
  scrollIntoViewWithMotionPreference(target, { block: "nearest", inline: "nearest" });
};

const AccountSelector = ({ accountBalances, selectedAccount, onSelectAccount, balanceVisible }) => (
  <section className={dashboardClass("shared-panel shared-account-panel")} aria-labelledby="dashboard-accounts-title">
    <div className={dashboardClass("shared-section-heading")}>
      <div>
        <p>Konteks transaksi</p>
        <h2 id="dashboard-accounts-title">Rekening</h2>
      </div>
      <Link to="/rekening">Kelola</Link>
    </div>
    {accountBalances.length ? (
      <>
        <p className={dashboardClass("shared-account-balance-note")}>{ACCOUNT_AVAILABLE_BALANCE_HINT}</p>
        <div className={dashboardClass("shared-account-carousel")} aria-label="Pilih rekening dashboard">
          {accountBalances.map((account) => {
            const selected = account.account_id === selectedAccount?.account_id;
            const cleanAccount = { ...account, name: account.account_name || account.name };
            return (
              <button
                key={account.account_id}
                type="button"
                className={dashboardClass(`shared-account-card${selected ? " is-selected" : ""}`)}
                onClick={() => selectDashboardAccount(account.account_id, onSelectAccount)}
                aria-pressed={selected}
                aria-label={`Pilih ${cleanAccount.name}`}
                data-dashboard-account={account.account_id}
              >
                <AccountVisual account={cleanAccount} carousel />
                <span className={dashboardClass("shared-account-card__summary")}>
                  <span>
                    <small>{account.account_type === "investment" ? "Saldo RDN" : "Saldo"}</small>
                    <SensitiveMoney visible={balanceVisible} value={account.balance} />
                  </span>
                  {account.account_type === "investment" ? null : (
                    <span>
                      <small>Tersedia</small>
                      <SensitiveMoney visible={balanceVisible} value={account.available_balance ?? account.balance ?? 0} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className={dashboardClass("shared-account-pagination")} aria-label="Posisi rekening terpilih">
          {accountBalances.map((account) => (
            <button
              key={account.account_id}
              type="button"
              className={dashboardClass(account.account_id === selectedAccount?.account_id ? "is-active" : "")}
              onClick={() => selectDashboardAccount(account.account_id, onSelectAccount)}
              aria-label={`Pilih ${account.account_name || account.name}`}
            />
          ))}
        </div>
      </>
    ) : (
      <div className={dashboardClass("shared-empty-state")}>
        <AccountIcon aria-hidden="true" />
        <strong>Belum ada rekening aktif</strong>
        <Link to="/rekening">Tambah rekening</Link>
      </div>
    )}
  </section>
);

const TransactionTools = ({
  bootstrap,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
}) => (
  <div className={dashboardClass("shared-transaction-tools")}>
    <label>
      <span className={dashboardClass("sr-only")}>Cari transaksi rekening terpilih</span>
      <FiSearch aria-hidden="true" />
      <input
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Cari transaksi"
      />
    </label>
    <SelectionField
      label="Filter kategori"
      hideLabel
      compact
      value={categoryFilter}
      onChange={setCategoryFilter}
      searchable={(bootstrap?.categories || []).length > 8}
      options={[
        { value: "all", label: "Semua kategori" },
        ...(bootstrap?.categories || [])
          .filter((item) => item.status === "active")
          .map((item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) })),
      ]}
    />
    <SelectionField
      label="Filter jenis transaksi"
      hideLabel
      compact
      value={typeFilter}
      onChange={setTypeFilter}
      options={[
        { value: "all", label: "Semua jenis" },
        ...Object.entries(TRANSACTION_LABELS).map(([value, label]) => ({ value, label })),
      ]}
    />
    <Link to="/transaksi">Lihat semua</Link>
  </div>
);

const TransactionRow = ({ row, categoryLookup, transactionCreatorLabel, selectedTransaction, setSelectedTransactionId, balanceVisible }) => {
  const { item, delta, balanceAfter } = row;
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const active = selectedTransaction?.transaction_id === item.transaction_id;
  return (
    <tr className={dashboardClass(active ? "is-selected" : "")}>
      <td><strong>{formatTransactionDate(item.transaction_date)}</strong><small>{item.status || "active"}</small></td>
      <td>
        <button
          type="button"
          className={dashboardClass("shared-transaction-select")}
          onClick={() => setSelectedTransactionId(item.transaction_id)}
          aria-pressed={active}
        >
          <span className={dashboardClass(`shared-transaction-icon shared-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
          <span><strong>{title}</strong><small>{item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Transaksi"} · dicatat {transactionCreatorLabel(item)}</small></span>
        </button>
      </td>
      <td><span className={dashboardClass(`shared-category-chip shared-category-chip--${transactionTone(item.transaction_type)}`)}>{category?.name || TRANSACTION_LABELS[item.transaction_type] || "Lainnya"}</span></td>
      <td>{delta < 0 ? <SensitiveMoney visible={balanceVisible} value={Math.abs(delta)} tone="negative" /> : <span>—</span>}</td>
      <td>{delta > 0 ? <SensitiveMoney visible={balanceVisible} value={delta} tone="positive" /> : <span>—</span>}</td>
      <td><SensitiveMoney visible={balanceVisible} value={balanceAfter} /></td>
    </tr>
  );
};

const AccountTransactions = ({
  model,
  bootstrap,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
  setSelectedTransactionId,
  balanceVisible,
}) => (
  <section className={dashboardClass("shared-panel shared-transactions")} aria-labelledby="selected-account-transactions-title">
    <div className={dashboardClass("shared-transactions__header")}>
      <div>
        <p>Aktivitas rekening</p>
        <h2 id="selected-account-transactions-title">Transaksi terbaru</h2>
        <span>{model.selectedAccount ? (model.selectedAccount.account_name || model.selectedAccount.name) : "Belum ada rekening"}</span>
      </div>
      <TransactionTools
        bootstrap={bootstrap}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />
    </div>
    {model.transactionRows.length ? (
      <div className={dashboardClass("shared-transaction-table-wrap")}>
        <table className={dashboardClass("shared-transaction-table")}>
          <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead>
          <tbody>
            {model.transactionRows.slice(0, 6).map((row) => (
              <TransactionRow
                key={row.item.transaction_id}
                row={row}
                categoryLookup={model.categoryLookup}
                transactionCreatorLabel={model.transactionCreatorLabel}
                selectedTransaction={model.selectedTransaction}
                setSelectedTransactionId={setSelectedTransactionId}
                balanceVisible={balanceVisible}
              />
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className={dashboardClass("shared-empty-state shared-empty-state--transactions")}>
        <FiSearch aria-hidden="true" />
        <strong>Tidak ada transaksi yang cocok</strong>
        <span>Ubah rekening atau filter untuk melihat aktivitas lain.</span>
      </div>
    )}
    {model.selectedTransaction ? (
      <div className={dashboardClass("shared-selected-transaction")}>
        <span>Transaksi dipilih</span>
        <strong>{model.selectedTransaction.description || model.selectedTransaction.merchant || "Transaksi"}</strong>
        <small>{model.categoryLookup[model.selectedTransaction.category_id]?.name || TRANSACTION_LABELS[model.selectedTransaction.transaction_type]} · {formatTransactionDate(model.selectedTransaction.transaction_date)}</small>
      </div>
    ) : null}
  </section>
);

const StatisticsPanel = ({ overview, model, balanceVisible }) => (
  <>
    <section className={dashboardClass("shared-panel shared-statistics")} aria-labelledby="dashboard-statistics-title">
      <div className={dashboardClass("shared-section-heading")}>
        <h2 id="dashboard-statistics-title">Pengeluaran</h2>
        <Link to="/laporan">Laporan</Link>
      </div>
      <div className={dashboardClass("shared-statistics__summary")}>
        <span>Total pengeluaran bulan ini</span>
        <SensitiveMoney visible={balanceVisible} value={overview.cashFlow.expense} tone="negative" />
        <small>{model.expenseByCategory.length} kategori tercatat</small>
      </div>
      <div className={dashboardClass("shared-statistics__content")}>
        <div
          className={dashboardClass("shared-donut")}
          style={model.donutStyle}
          role="img"
          aria-label={`Distribusi pengeluaran ${formatPeriod(overview.periodKey)}`}
        >
          <span><small>{formatPeriod(overview.periodKey)}</small><strong>{model.categoryTotal ? "100%" : "0%"}</strong></span>
        </div>
        <ul className={dashboardClass("shared-stat-legend")}>
          {model.categories.length ? model.categories.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <i data-index={index} />
              <span>
                <strong>{item.name}</strong>
                <small><SensitiveMoney visible={balanceVisible} value={item.amount} /> · {percentage(item.amount, model.categoryTotal)}%</small>
              </span>
            </li>
          )) : <li><span>Belum ada pengeluaran kategori.</span></li>}
        </ul>
      </div>
      <div className={dashboardClass("shared-largest-expense")}>
        <span>Pengeluaran terbesar</span>
        <strong>{model.biggestExpense?.name || "Belum tersedia"}</strong>
        <SensitiveMoney visible={balanceVisible} value={model.biggestExpense?.amount || 0} tone="negative" />
      </div>
    </section>
  </>
);

const InvestmentWidget = ({ summary, balanceVisible }) => {
  if (!summary) return null;
  const hasAssets = Number(summary.market_value || 0) !== 0
    || Number(summary.cost_basis || 0) > 0
    || Number(summary.holding_count || 0) > 0;
  return (
    <article className={dashboardClass("shared-panel shared-investment-widget")}>
      <div className={dashboardClass("shared-widget__heading")}>
        <div>
          <h2>Investasi</h2>
          <span>{summary.holding_count || 0} aset tercatat</span>
        </div>
        <Link to="/investasi">Buka catatan</Link>
      </div>
      <div className={dashboardClass("shared-investment-widget__total")}>
        <span>Total investasi tercatat</span>
        <SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} />
      </div>
      <dl>
        <div><dt>Modal tercatat</dt><dd><SensitiveMoney visible={balanceVisible} value={summary.cost_basis || 0} /></dd></div>
        <div><dt>Nilai saat ini</dt><dd><SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} /></dd></div>
      </dl>
      {hasAssets ? (
        <div className={dashboardClass("shared-investment-widget__pl")}>
          <span>P/L belum direalisasi</span>
          <SensitiveMoney
            visible={balanceVisible}
            value={summary.unrealized_pl || 0}
            tone={Number(summary.unrealized_pl || 0) < 0 ? "negative" : "positive"}
          />
        </div>
      ) : (
        <div className={dashboardClass("shared-investment-widget__notice")}>
          <FiAlertCircle aria-hidden="true" />
          <span><strong>Belum ada aset tercatat</strong><small>Tambahkan saham atau reksa dana dari halaman Investasi.</small></span>
        </div>
      )}
    </article>
  );
};

const DesktopEmptyAction = ({ action }) => {
  const ActionIcon = action.to === "/rekening" ? AccountIcon : FiPlus;
  return <Link className={dashboardClass("shared-widget-empty-action")} to={action.to} state={action.state || undefined}>
    <span className={dashboardClass("shared-widget-empty-action__icon")}><ActionIcon aria-hidden="true" /></span>
    <span className={dashboardClass("shared-widget-empty-action__copy")}><strong>{action.label}</strong><small>{action.description}</small></span>
  </Link>;
};

const BudgetWidget = ({ budgets, overview, balanceVisible }) => (
  <article className={dashboardClass("shared-panel shared-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><h2>Kebutuhan</h2><span>{budgets.length} kebutuhan aktif</span></div>
      <Link to="/perencanaan/kantong">Lihat</Link>
    </div>
    <ul className={dashboardClass("shared-progress-list")}>
      {budgets.length ? budgets.slice(0, 3).map((item) => (
        <li key={item.budget_id}>
          <div>
            <strong>{item.name || item.display_name || "Kebutuhan"}</strong>
            <span><SensitiveMoney visible={balanceVisible} value={item.used_amount || 0} /> / <SensitiveMoney visible={balanceVisible} value={item.amount || 0} /></span>
          </div>
          <ProgressBar value={item.used_amount || 0} max={item.amount || 0} label={`Pemakaian ${item.name || "kebutuhan"}`} />
        </li>
      )) : (
        <li className={dashboardClass("shared-widget-empty")}>
          <DesktopEmptyAction action={dashboardNeedEmptyAction(overview)} />
        </li>
      )}
    </ul>
  </article>
);

const RecurringWidget = ({ items, overview, balanceVisible }) => (
  <article className={dashboardClass("shared-panel shared-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><h2>Jadwal rutin</h2><span>{items.length} jadwal mendatang</span></div>
      <Link to="/perencanaan/jadwal">Lihat</Link>
    </div>
    <ul className={dashboardClass("shared-due-list")}>
      {items.length ? items.map((item) => (
        <li key={item.occurrence_id || item.recurring_rule_id}>
          <span className={dashboardClass("shared-due-icon")}><FiCalendar aria-hidden="true" /></span>
          <span>
            <strong>{item.name}</strong>
            <small>{compactDate(item.due_date)} · <SensitiveMoney visible={balanceVisible} value={item.expected_amount || item.amount || 0} /></small>
          </span>
          <em>{dashboardDueLabel(item.due_date)}</em>
        </li>
      )) : (
        <li className={dashboardClass("shared-widget-empty")}>
          <DesktopEmptyAction action={dashboardRecurringEmptyAction(overview)} />
        </li>
      )}
    </ul>
  </article>
);

const GoalsWidget = ({ goals, overview, balanceVisible }) => (
  <article className={dashboardClass("shared-panel shared-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><h2>Target tabungan</h2><span>{goals.length} target aktif</span></div>
      <Link to="/target">Lihat</Link>
    </div>
    <ul className={dashboardClass("shared-progress-list shared-goal-list")}>
      {goals.length ? goals.map((item) => (
        <li key={item.goal_id}>
          <div>
            <strong><FiTarget aria-hidden="true" />{item.name}</strong>
            <span><SensitiveMoney visible={balanceVisible} value={item.current_amount || 0} /> / <SensitiveMoney visible={balanceVisible} value={item.target_amount || 0} /></span>
          </div>
          <ProgressBar value={item.current_amount || 0} max={item.target_amount || 0} label={`Kemajuan ${item.name}`} />
        </li>
      )) : (
        <li className={dashboardClass("shared-widget-empty")}>
          <DesktopEmptyAction action={dashboardGoalEmptyAction(overview)} />
        </li>
      )}
    </ul>
  </article>
);

const DashboardPlanning = ({ model, balanceVisible }) => (
  <section className={dashboardClass("desktop-planning-section")} aria-labelledby="desktop-planning-title">
    <div className={dashboardClass("desktop-planning-section__heading")}>
      <div>
        <span>Rencana & komitmen</span>
        <h2 id="desktop-planning-title">Perencanaan keuangan</h2>
      </div>
    </div>
    <div className={dashboardClass("shared-dashboard-widgets")}>
      <BudgetWidget budgets={model.budgets} overview={model.overview} balanceVisible={balanceVisible} />
      <RecurringWidget items={model.recurringItems} overview={model.overview} balanceVisible={balanceVisible} />
      <GoalsWidget goals={model.goals} overview={model.overview} balanceVisible={balanceVisible} />
    </div>
  </section>
);

const DesktopFinanceDashboard = ({
  overview,
  bootstrap,
  viewModel,
  investmentSummary,
  displayName,
  selectedAccountId,
  onSelectAccount,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
  selectedTransactionId,
  setSelectedTransactionId,
  balanceVisible,
  onToggleBalance,
  onOpenTransaction,
  setupContent,
}) => {
  const model = buildDesktopModel({
    overview,
    viewModel,
    selectedAccountId,
    categoryFilter,
    typeFilter,
    searchTerm,
    selectedTransactionId,
  });

  return (
    <div className={dashboardClass("dashboard-desktop shared-dashboard")}>
      <DashboardHeader
        overview={overview}
        displayName={displayName}
        balanceVisible={balanceVisible}
        onToggleBalance={onToggleBalance}
        onOpenTransaction={onOpenTransaction}
      />
      <div className={dashboardClass("desktop-overview-grid")}>
        <PrimaryMetrics overview={overview} model={model} balanceVisible={balanceVisible} />
        <DashboardAttention alerts={model.alerts} />
      </div>
      {setupContent}
      <AccountSelector
        accountBalances={model.accountBalances}
        selectedAccount={model.selectedAccount}
        onSelectAccount={onSelectAccount}
        balanceVisible={balanceVisible}
      />
      <div className={dashboardClass("shared-dashboard__layout")}>
        <AccountTransactions
          model={model}
          bootstrap={bootstrap}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          setSelectedTransactionId={setSelectedTransactionId}
          balanceVisible={balanceVisible}
        />
        <aside className={dashboardClass("shared-dashboard__side")} aria-label="Investasi dan statistik dashboard">
          <InvestmentWidget summary={investmentSummary} balanceVisible={balanceVisible} />
          <StatisticsPanel overview={overview} model={model} balanceVisible={balanceVisible} />
        </aside>
      </div>
      <DashboardPlanning model={model} balanceVisible={balanceVisible} />
    </div>
  );
};

export default DesktopFinanceDashboard;

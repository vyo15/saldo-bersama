import { useEffect, useMemo, useState } from "react";
import { FiExternalLink } from "react-icons/fi";
import { useNavigate } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import UserAvatar from "../../../components/common/UserAvatar.jsx";
import ErrorState, { RefreshWarning } from "../../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../../app/FinanceContext.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { formatTransactionDate, TRANSACTION_LABELS, transactionCategoryIcon, transactionTone } from "../../../shared/presentation/transaction.js";
import { roleLabel } from "../settingsPresentation.js";
import activityStyles from "../MemberActivity.module.css";
import TemporalInput from "../../../components/common/TemporalInput.jsx";

const MEMBER_ACTIVITY_LIMIT = 8;
const TYPE_FILTERS = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "income", label: "Pemasukan" },
  { value: "expense", label: "Pengeluaran" },
  { value: "transfer", label: "Transfer" },
  { value: "refund", label: "Refund" },
  { value: "adjustment", label: "Penyesuaian" },
]);

const transactionAccountLabel = (item, accountLookup) => {
  const display = (accountId, fallback) => accountLookup[accountId] ? accountDisplayLabel(accountLookup[accountId]) : fallback;
  if (item.transaction_type === "transfer") return `${display(item.source_account_id, "Rekening asal")} → ${display(item.destination_account_id, "Rekening tujuan")}`;
  return display(item.source_account_id || item.destination_account_id, "Rekening tidak tersedia");
};

const transactionCategoryLabel = (item, categoryLookup) => categoryLookup[item.category_id]?.name || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum dialokasikan");
const activityEnabled = (open, member) => Boolean(open && member?.user_id);
const resourceItems = (resource) => resource?.data?.items ?? [];
const buildLookup = (items) => Object.fromEntries((items ?? []).map((item) => [item.account_id ?? item.category_id, item]));
const memberProfile = (member, currentUser) => member.is_current ? { ...member, photoURL: currentUser?.photoURL ?? currentUser?.picture ?? member.photoURL ?? "" } : member;
const creatorExpense = (report, memberId) => (report.data?.creatorExpenses ?? []).find((item) => item.user_id === memberId);

const MemberProfile = ({ member, profile }) => <><section className={activityStyles.memberActivityProfile} aria-label={`Profil ${member.name || member.email}`}><UserAvatar user={profile} className={activityStyles.memberActivityAvatar} /><div><h2>{member.name || member.email}</h2><p>{member.email}</p><span className="status-badge status-badge--info">{roleLabel(member.role)}</span></div></section><p className={activityStyles.memberActivityExplanation}>Aktivitas pencatatan menunjukkan siapa yang memasukkan transaksi. Data ini bukan ukuran siapa yang memakai, membayar, atau menanggung biaya.</p></>;

const ActivityFilters = ({ period, setPeriod, type, setType }) => <div className={activityStyles.memberActivityFilters}>
  <label className={`field field--compact ${activityStyles.memberActivityPeriod}`}><span>Periode</span><TemporalInput type="month" max={currentMonthInJakarta()} value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
  <div className={activityStyles.memberActivityTypeFilters} role="group" aria-label="Jenis transaksi">{TYPE_FILTERS.map((option) => <button key={option.value} type="button" className={type === option.value ? activityStyles.memberActivityTypeActive : activityStyles.memberActivityType} aria-pressed={type === option.value} onClick={() => setType(option.value)}>{option.label}</button>)}</div>
</div>;

const ActivityMetrics = ({ type, transactions, report, expenseSummary }) => <section className={activityStyles.memberActivityMetrics} aria-label="Ringkasan aktivitas"><div><span>{type === "all" ? "Transaksi dicatat" : "Transaksi pada filter"}</span><strong>{transactions.data?.total ?? "—"}</strong></div><div><span>Pengeluaran dicatat</span>{report.data ? <Money value={expenseSummary?.amount || expenseSummary?.value || 0} /> : <strong>—</strong>}</div></section>;

const ActivityItem = ({ item, accountLookup, categoryLookup }) => {
  const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type);
  return <article className={activityStyles.memberActivityItem}><span className={activityStyles.memberActivityItemIcon}><Icon aria-hidden="true" /></span><div className={activityStyles.memberActivityItemCopy}><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{formatTransactionDate(item.transaction_date)} · {transactionAccountLabel(item, accountLookup)}</small><span>{transactionCategoryLabel(item, categoryLookup)} · {TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</span></div><div className={activityStyles.memberActivityItemValue}><Money value={item.amount} tone={transactionTone(item.transaction_type)} /><StatusBadge status={item.status} /></div></article>;
};

const ActivityList = ({ transactions, items, accountLookup, categoryLookup }) => <section className={activityStyles.memberActivityListSection} aria-labelledby="member-activity-transactions"><div className={activityStyles.memberActivitySectionHeading}><div><p className="eyebrow">Riwayat</p><h3 id="member-activity-transactions">Transaksi terbaru</h3></div>{transactions.data ? <small>{items.length} dari {transactions.data.total || 0}</small> : null}</div>{transactions.status === "loading" ? <div className={activityStyles.memberActivityLoading} role="status">Memuat aktivitas transaksi...</div> : null}{transactions.status === "error" ? <ErrorState error={transactions.error} onRetry={transactions.reload} /> : null}{transactions.status !== "loading" && transactions.status !== "error" && !items.length ? <div className={activityStyles.memberActivityEmpty}><strong>Belum ada transaksi</strong><span>Tidak ada transaksi yang cocok dengan periode dan filter ini.</span></div> : null}{items.length ? <div className={activityStyles.memberActivityList}>{items.map((item) => <ActivityItem key={item.transaction_id} item={item} accountLookup={accountLookup} categoryLookup={categoryLookup} />)}</div> : null}</section>;

const ActivityBody = ({ member, profile, embedded, period, setPeriod, type, setType, transactions, report, expenseSummary, items, accountLookup, categoryLookup, openAllTransactions }) => <div className={`${activityStyles.memberActivityBody} ${embedded ? activityStyles.memberActivityEmbedded : ""}`}>{embedded ? null : <MemberProfile member={member} profile={profile} />}<ActivityFilters period={period} setPeriod={setPeriod} type={type} setType={setType} /><RefreshWarning error={transactions.refreshError || report.refreshError} onRetry={() => Promise.all([transactions.reload(), report.reload()])} />{report.status === "error" ? <div className={activityStyles.memberActivityReportWarning} role="status"><span>Ringkasan pengeluaran belum dapat dimuat.</span><Button type="button" onClick={report.reload}>Coba lagi</Button></div> : null}<ActivityMetrics type={type} transactions={transactions} report={report} expenseSummary={expenseSummary} /><ActivityList transactions={transactions} items={items} accountLookup={accountLookup} categoryLookup={categoryLookup} /><Button className={activityStyles.memberActivityOpenAll} icon={FiExternalLink} type="button" onClick={openAllTransactions}>Lihat semua transaksi</Button></div>;

const MemberActivityPanel = ({ open = true, member, currentUser, onClose = () => {}, embedded = false }) => {
  const navigate = useNavigate();
  const { bootstrap } = useFinance();
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [type, setType] = useState("all");
  const enabled = activityEnabled(open, member);
  const memberId = member?.user_id;
  useEffect(() => { if (memberId) setType("all"); }, [memberId]);
  const transactions = useApiResource("transactions.list", { period, limit: MEMBER_ACTIVITY_LIMIT, offset: 0, transaction_type: type, created_by: member?.user_id ?? "all" }, { enabled });
  const report = useApiResource("reports.monthly", { period, trend_months: 3 }, { enabled });
  const accountLookup = useMemo(() => buildLookup(bootstrap?.accounts), [bootstrap?.accounts]);
  const categoryLookup = useMemo(() => buildLookup(bootstrap?.categories), [bootstrap?.categories]);
  if (!enabled) return null;
  const profile = memberProfile(member, currentUser);
  const expenseSummary = creatorExpense(report, memberId);
  const items = resourceItems(transactions);
  const openAllTransactions = () => { onClose(); navigate("/transaksi", { state: { creatorId: member.user_id, period } }); };
  const bodyProps = { profile, embedded, period, setPeriod, type, setType, transactions, report, expenseSummary, items, accountLookup, categoryLookup, openAllTransactions };
  if (embedded) return <ActivityBody member={member} {...bodyProps} />;
  return <Modal open={enabled} onClose={onClose} title="Aktivitas anggota" description="Transaksi yang dicatat oleh anggota ini." size="lg" className={activityStyles.memberActivityModal} mobileSwipeToClose><ActivityBody member={member} {...bodyProps} /></Modal>;
};

export default MemberActivityPanel;

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiArrowLeft, FiExternalLink, FiX } from "react-icons/fi";
import { useNavigate } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import UserAvatar from "../../../components/common/UserAvatar.jsx";
import ErrorState, { RefreshWarning } from "../../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../../app/FinanceContext.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import { useFocusTrap } from "../../../hooks/useFocusTrap.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { formatTransactionDate, TRANSACTION_LABELS, transactionCategoryIcon, transactionTone } from "../../../shared/presentation/transaction.js";
import { roleLabel } from "../settingsPresentation.js";
import styles from "../Settings.module.css";

const MEMBER_ACTIVITY_LIMIT = 8;

const transactionAccountLabel = (item, accountLookup) => {
  const display = (accountId, fallback) => accountLookup[accountId] ? accountDisplayLabel(accountLookup[accountId]) : fallback;
  if (item.transaction_type === "transfer") return `${display(item.source_account_id, "Rekening asal")} → ${display(item.destination_account_id, "Rekening tujuan")}`;
  return display(item.source_account_id || item.destination_account_id, "Rekening tidak tersedia");
};

const transactionCategoryLabel = (item, categoryLookup) => categoryLookup[item.category_id]?.name || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum dialokasikan");

const MemberProfile = ({ member, profile }) => <><section className={styles.memberActivityProfile} aria-label={`Profil ${member.name || member.email}`}><UserAvatar user={profile} className={styles.memberActivityAvatar} /><div><h2>{member.name || member.email}</h2><p>{member.email}</p><span className="status-badge status-badge--info">{roleLabel(member.role)}</span></div></section><p className={styles.memberActivityExplanation}>Aktivitas pencatatan menunjukkan siapa yang memasukkan transaksi. Data ini bukan ukuran siapa yang memakai, membayar, atau menanggung biaya.</p></>;

const ActivityFilters = ({ period, setPeriod, type, setType }) => <div className={styles.memberActivityFilters}><label className="field field--compact"><span>Periode</span><input type="month" max={currentMonthInJakarta()} value={period} onChange={(event) => setPeriod(event.target.value)} /></label><label className="field field--compact"><span>Jenis transaksi</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option><option value="transfer">Transfer</option><option value="refund">Refund</option><option value="adjustment">Penyesuaian</option></select></label></div>;

const ActivityMetrics = ({ type, transactions, report, expenseSummary }) => <section className={styles.memberActivityMetrics} aria-label="Ringkasan aktivitas"><div><span>{type === "all" ? "Transaksi dicatat" : "Transaksi pada filter"}</span><strong>{transactions.data?.total ?? "—"}</strong><small>Jumlah exact pada periode dan filter terpilih.</small></div><div><span>Pengeluaran yang dicatat</span>{report.data ? <Money value={expenseSummary?.amount || expenseSummary?.value || 0} /> : <strong>—</strong>}<small>Hanya pengeluaran aktif. Transfer internal tidak dihitung.</small></div></section>;

const ActivityItem = ({ item, accountLookup, categoryLookup }) => {
  const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type);
  return <article className={styles.memberActivityItem}><span className={styles.memberActivityItemIcon}><Icon aria-hidden="true" /></span><div className={styles.memberActivityItemCopy}><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{formatTransactionDate(item.transaction_date)} · {transactionAccountLabel(item, accountLookup)}</small><span>{transactionCategoryLabel(item, categoryLookup)} · {TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</span></div><div className={styles.memberActivityItemValue}><Money value={item.amount} tone={transactionTone(item.transaction_type)} /><StatusBadge status={item.status} /></div></article>;
};

const ActivityList = ({ transactions, items, accountLookup, categoryLookup }) => <section className={styles.memberActivityListSection} aria-labelledby="member-activity-transactions"><div className={styles.memberActivitySectionHeading}><div><p className="eyebrow">Ledger</p><h3 id="member-activity-transactions">Transaksi terbaru</h3></div>{transactions.data ? <small>{items.length} dari {transactions.data.total || 0}</small> : null}</div>{transactions.status === "loading" ? <div className={styles.memberActivityLoading} role="status">Memuat aktivitas transaksi...</div> : null}{transactions.status === "error" ? <ErrorState error={transactions.error} onRetry={transactions.reload} /> : null}{transactions.status !== "loading" && transactions.status !== "error" && !items.length ? <div className={styles.memberActivityEmpty}><strong>Belum ada transaksi</strong><span>Tidak ada transaksi yang cocok dengan periode dan filter ini.</span></div> : null}{items.length ? <div className={styles.memberActivityList}>{items.map((item) => <ActivityItem key={item.transaction_id} item={item} accountLookup={accountLookup} categoryLookup={categoryLookup} />)}</div> : null}</section>;

const ActivityBody = ({ member, profile, period, setPeriod, type, setType, transactions, report, expenseSummary, items, accountLookup, categoryLookup, openAllTransactions }) => <div className={styles.memberActivityBody}><MemberProfile member={member} profile={profile} /><ActivityFilters period={period} setPeriod={setPeriod} type={type} setType={setType} /><RefreshWarning error={transactions.refreshError || report.refreshError} onRetry={() => Promise.all([transactions.reload(), report.reload()])} />{report.status === "error" ? <div className={styles.memberActivityReportWarning} role="status"><span>Ringkasan pengeluaran belum dapat dimuat.</span><Button type="button" onClick={report.reload}>Coba lagi</Button></div> : null}<ActivityMetrics type={type} transactions={transactions} report={report} expenseSummary={expenseSummary} /><ActivityList transactions={transactions} items={items} accountLookup={accountLookup} categoryLookup={categoryLookup} /><Button className={styles.memberActivityOpenAll} variant="primary" icon={FiExternalLink} type="button" onClick={openAllTransactions}>Lihat semua di halaman Transaksi</Button></div>;

const ActivityDialog = ({ panelRef, closeRef, member, onClose, bodyProps }) => <div className={styles.memberActivityBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={panelRef} className={styles.memberActivityPanel} role="dialog" aria-modal="true" aria-labelledby="member-activity-title" tabIndex={-1}><header className={styles.memberActivityHeader}><div className={styles.memberActivityHeading}><strong id="member-activity-title">Aktivitas anggota</strong><small>Transaksi berdasarkan pencatat yang diverifikasi backend.</small></div><button ref={closeRef} className={styles.memberActivityClose} type="button" onClick={onClose} aria-label="Tutup aktivitas anggota"><FiX className={styles.memberActivityDesktopIcon} aria-hidden="true" /><FiArrowLeft className={styles.memberActivityMobileIcon} aria-hidden="true" /></button></header><ActivityBody member={member} {...bodyProps} /></section></div>;

const MemberActivityPanel = ({ open, member, currentUser, onClose }) => {
  const navigate = useNavigate();
  const { bootstrap } = useFinance();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [type, setType] = useState("all");
  const enabled = Boolean(open && member?.user_id);
  useEffect(() => { if (member?.user_id) setType("all"); }, [member?.user_id]);
  useFocusTrap({ open: enabled, containerRef: panelRef, initialFocusRef: closeRef, onEscape: onClose, bodyClassName: "modal-open" });
  const transactions = useApiResource("transactions.list", { period, limit: MEMBER_ACTIVITY_LIMIT, offset: 0, transaction_type: type, created_by: member?.user_id || "all" }, { enabled });
  const report = useApiResource("reports.monthly", { period, trend_months: 3 }, { enabled });
  const accountLookup = useMemo(() => Object.fromEntries((bootstrap?.accounts || []).map((item) => [item.account_id, item])), [bootstrap?.accounts]);
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  if (!enabled || !member) return null;
  const profile = member.is_current ? { ...member, photoURL: currentUser?.photoURL || currentUser?.picture || "" } : member;
  const expenseSummary = (report.data?.creatorExpenses || []).find((item) => item.user_id === member.user_id);
  const items = transactions.data?.items || [];
  const openAllTransactions = () => { onClose(); navigate("/transaksi", { state: { creatorId: member.user_id, period } }); };
  const bodyProps = { profile, period, setPeriod, type, setType, transactions, report, expenseSummary, items, accountLookup, categoryLookup, openAllTransactions };
  return createPortal(<ActivityDialog panelRef={panelRef} closeRef={closeRef} member={member} onClose={onClose} bodyProps={bodyProps} />, document.body);
};

export default MemberActivityPanel;

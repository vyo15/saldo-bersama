import { useMemo } from "react";
import {
  FiAlertTriangle, FiArchive, FiArrowRight, FiCalendar, FiCheckCircle, FiChevronDown, FiChevronUp,
  FiClock, FiEdit2, FiMoreHorizontal, FiRepeat, FiRotateCcw,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { scheduleMatchesFilter } from "./recurringPresentation.js";
import styles from "./RecurringPage.module.css";

const FILTERS = Object.freeze([
  { id: "all", label: "Semua" },
  { id: "attention", label: "Perlu perhatian" },
  { id: "open", label: "Belum selesai" },
  { id: "done", label: "Selesai" },
  { id: "cancelled", label: "Dilewati" },
]);

const FREQUENCY_LABELS = Object.freeze({
  daily: "Harian",
  weekly: "Mingguan",
  biweekly: "Dua mingguan",
  monthly: "Bulanan",
  bimonthly: "Dua bulanan",
  quarterly: "Tiga bulanan",
  semiannual: "Semester",
  annual: "Tahunan",
});

const PAYMENT_METHOD_LABELS = Object.freeze({
  transfer: "Transfer",
  cash: "Tunai",
  autodebit: "Auto-debit",
  ewallet: "E-wallet",
});

const completedStatuses = new Set(["paid", "received"]);
const attentionStatuses = new Set(["overdue", "late", "partial"]);

const dateOrdinal = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
};

const duePresentation = (item) => {
  if (item.status === "cancelled") return { label: "Dilewati", tone: "muted" };
  if (completedStatuses.has(item.status)) return { label: "Selesai", tone: "positive" };
  const due = dateOrdinal(item.due_date);
  const today = dateOrdinal(todayInJakarta());
  if (due === null || today === null) return { label: "Terjadwal", tone: "muted" };
  const delta = due - today;
  if (delta < 0) return { label: `Terlambat ${Math.abs(delta)} hari`, tone: "negative" };
  if (delta === 0) return { label: "Jatuh tempo hari ini", tone: "warning" };
  if (delta === 1) return { label: "Besok", tone: "warning" };
  return { label: `${delta} hari lagi`, tone: "muted" };
};

const recurringSummary = (items) => items.reduce((summary, item) => {
  const expected = Number(item.expected_amount || 0);
  if (item.kind === "income") summary.income += expected;
  else summary.expense += expected;
  if (completedStatuses.has(item.status)) summary.completed += 1;
  if (item.status === "cancelled") summary.cancelled += 1;
  if (attentionStatuses.has(item.status)) summary.attention += 1;
  return summary;
}, { expense: 0, income: 0, completed: 0, cancelled: 0, attention: 0 });

const lookupLabel = (items, id, idKey, fallback) => items?.find((item) => item[idKey] === id)?.name || fallback;

const attentionGuidance = (item) => {
  if (!attentionStatuses.has(item.status)) return null;
  const expected = Number(item.expected_amount || 0);
  const actual = Number(item.actual_amount || 0);
  const remaining = Math.max(0, expected - actual);
  if (item.status === "partial") {
    return {
      title: "Aktual belum lengkap",
      description: <>Masih ada <Money value={remaining} /> dari nominal rencana yang belum tercatat pada periode ini.</>,
      primaryLabel: "Lengkapi aktual",
    };
  }
  if (item.auto_debit) {
    return {
      title: "Periksa auto-debit",
      description: "Cek mutasi rekening. Jika transaksi sudah terjadi, catat aktual.",
      primaryLabel: "Catat aktual",
    };
  }
  return {
    title: "Jadwal melewati jatuh tempo",
    description: "Catat aktual jika transaksi terjadi, atau lewati periode jika tidak.",
    primaryLabel: "Catat aktual",
  };
};

const ScheduleAttention = ({ item, guidance, actions }) => {
  if (!guidance) return null;
  return (
    <div className={styles.attentionAction} role="status">
      <span className={styles.attentionIcon} aria-hidden="true"><FiAlertTriangle /></span>
      <div className={styles.attentionCopy}>
        <strong>{guidance.title}</strong>
        <p>{guidance.description}</p>
      </div>
      {item.can_pay ? <Button className={styles.attentionPrimary} variant="primary" onClick={() => actions.openPayment(item)}>{guidance.primaryLabel}</Button> : null}
    </div>
  );
};

const ScheduleActions = ({ item, actions, expanded, onToggle, hidePay = false }) => {
  const hasManagement = item.can_reverse || item.can_cancel_occurrence || item.can_restore_occurrence || item.can_edit_rule || item.can_archive_rule;
  return (
    <div className={styles.actions}>
      <div className={styles.actionPrimary}>
        {item.can_pay && !hidePay ? <Button variant="primary" onClick={() => actions.openPayment(item)}>Catat aktual</Button> : null}
        {item.can_restore_occurrence ? <Button icon={FiRotateCcw} onClick={() => actions.openRestore(item)}>Pulihkan periode</Button> : null}
        {completedStatuses.has(item.status) ? <span className={styles.completedMark}><FiCheckCircle aria-hidden="true" /> Sudah tercatat</span> : null}
        {hasManagement ? (
          <button type="button" className={styles.manageButton} onClick={onToggle} aria-expanded={expanded}>
            <FiMoreHorizontal aria-hidden="true" />
            <span>Kelola jadwal</span>
            {expanded ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className={styles.managePanel}>
          {item.can_edit_rule ? <Button className={styles.manageAction} icon={FiEdit2} onClick={() => actions.openRuleEditor(item)}>Edit jadwal</Button> : null}
          {item.can_cancel_occurrence ? <Button className={styles.manageAction} onClick={() => actions.openSkip(item)}>Lewati periode</Button> : null}
          {item.can_reverse ? <Button className={styles.manageAction} icon={FiRotateCcw} onClick={() => actions.openReverse(item)}>Batalkan aktual terakhir</Button> : null}
          {item.can_archive_rule ? <Button className={styles.manageAction} variant="danger" icon={FiArchive} onClick={() => actions.openArchive(item)}>Arsipkan / hapus</Button> : null}
        </div>
      ) : null}
    </div>
  );
};

const ScheduleItem = ({ item, actions, expanded, onToggle, accounts, categories }) => {
  const due = duePresentation(item);
  const account = accounts?.find((entry) => entry.account_id === item.default_account_id);
  const accountLabel = account ? accountDisplayLabel(account) : "Rekening tidak tersedia";
  const categoryLabel = lookupLabel(categories, item.category_id, "category_id", "Kategori tidak tersedia");
  const actual = Number(item.actual_amount || 0);
  const guidance = attentionGuidance(item);
  return (
    <Card as="article" className={styles.scheduleCard} interactive>
      <div className={styles.cardHeading}>
        <div className={styles.dateBadge} aria-label={`Jadwal ${formatDateLongIndonesia(item.due_date) || item.due_date}`}>
          <FiCalendar aria-hidden="true" />
          <time dateTime={item.due_date}>{String(item.due_date || "").slice(-2)}</time>
        </div>
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <h3>{item.name}</h3>
            {item.auto_debit ? <span className={styles.autoDebit}>Auto-debit</span> : null}
          </div>
          <p>{categoryLabel}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className={styles.amountBlock}>
        <span>Rencana <Money value={item.expected_amount} /></span>
        {actual > 0 ? <small>Aktual <Money value={actual} /></small> : null}
      </div>

      <div className={styles.metaGrid}>
        <span><FiClock aria-hidden="true" /><span><strong>{formatDateLongIndonesia(item.due_date) || item.due_date}</strong><small className={styles[due.tone]}>{due.label}</small></span></span>
        <span><FiRepeat aria-hidden="true" /><span><strong>{FREQUENCY_LABELS[item.frequency] || item.frequency}</strong><small>{PAYMENT_METHOD_LABELS[item.payment_method] || item.payment_method || "Metode belum diatur"}</small></span></span>
        <span className={styles.accountMeta}><span className={styles.accountDot} aria-hidden="true" /><span><strong>{accountLabel}</strong></span></span>
      </div>

      <ScheduleAttention item={item} guidance={guidance} actions={actions} />
      <ScheduleActions item={item} actions={actions} expanded={expanded} onToggle={onToggle} hidePay={Boolean(guidance)} />
    </Card>
  );
};

const ScheduleList = ({ items, emptyText, actions, expandedId, setExpandedId, accounts, categories }) => (
  <div className={styles.scheduleList}>
    {items.length ? items.map((item) => (
      <ScheduleItem
        key={item.occurrence_id}
        item={item}
        actions={actions}
        expanded={expandedId === item.occurrence_id}
        onToggle={() => setExpandedId((current) => current === item.occurrence_id ? null : item.occurrence_id)}
        accounts={accounts}
        categories={categories}
      />
    )) : (
      <EmptyState className={styles.emptyState} variant="inline" icon={FiCalendar} title="Belum ada jadwal" description={emptyText} headingLevel={3} />
    )}
  </div>
);

const ScheduleKindTabs = ({ kind, setKind, items }) => {
  const expenseCount = items.filter((item) => item.kind === "expense").length;
  const incomeCount = items.filter((item) => item.kind === "income").length;
  return (
    <div className={styles.kindTabs} role="group" aria-label="Jenis jadwal rutin">
      <button type="button" className={`${styles.kindTab} ${kind === "expense" ? styles.kindTabActive : ""}`} aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>
        Pengeluaran <span>{expenseCount}</span>
      </button>
      <button type="button" className={`${styles.kindTab} ${kind === "income" ? styles.kindTabActive : ""}`} aria-pressed={kind === "income"} onClick={() => setKind("income")}>
        Pemasukan <span>{incomeCount}</span>
      </button>
    </div>
  );
};

export const ScheduleSummary = ({ items, onAttention }) => {
  const summary = recurringSummary(items);
  const resolved = summary.completed + summary.cancelled;
  const total = items.length;
  const progress = total ? Math.min(100, Math.round((resolved / total) * 100)) : 0;
  const open = Math.max(0, total - resolved);
  const status = summary.attention
    ? { label: `${summary.attention} perlu perhatian`, attention: true }
    : total === 0
      ? { label: "Belum ada jadwal", attention: false }
      : open === 0
        ? { label: "Semua beres", attention: false }
        : { label: `${open} belum selesai`, attention: false };

  return (
    <section className={styles.heroCard} aria-label="Ringkasan jadwal rutin periode ini">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroContent}>
        <div className={styles.heroTop}>
          <span className={styles.heroEyebrow}>Ringkasan periode</span>
          {status.attention ? (
            <button type="button" className={`${styles.heroStatus} ${styles.heroStatusAttention}`} aria-label="Lihat tindakan yang perlu perhatian" onClick={onAttention}>
              <span>{status.label}</span><FiArrowRight aria-hidden="true" />
            </button>
          ) : <span className={styles.heroStatus}>{status.label}</span>}
        </div>
        <div className={styles.heroValue}><Money value={summary.expense} /></div>
        <p className={styles.heroDescription}>Rencana pengeluaran rutin pada periode yang dipilih.</p>
        <div className={styles.heroProgress} aria-label={`${progress}% jadwal periode terselesaikan`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.heroMetrics}>
          <div className={styles.heroMetric}><span>Pemasukan</span><strong><Money value={summary.income} /></strong></div>
          <div className={styles.heroMetric}><span>Tuntas</span><strong>{resolved} dari {total}</strong></div>
          <div className={`${styles.heroMetric} ${summary.attention ? styles.heroMetricAttention : ""}`}><span>Perhatian</span><strong>{summary.attention} jadwal</strong></div>
        </div>
      </div>
      <img className={styles.heroArt} src="/login/assets/mobile/finance-checklist.webp" alt="" aria-hidden="true" draggable="false" />
    </section>
  );
};

const ScheduleFilters = ({ filter, setFilter, items }) => {
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(({ id }) => [id, items.filter((item) => scheduleMatchesFilter(item, id)).length])), [items]);
  return (
    <div className={styles.filterBar} aria-label="Filter status jadwal">
      {FILTERS.map((item) => (
        <button key={item.id} type="button" className={`${styles.filterButton} ${filter === item.id ? styles.filterActive : ""}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
          <span>{item.label}</span>
          <small>{counts[item.id]}</small>
        </button>
      ))}
    </div>
  );
};

export const SchedulePeriodSection = ({ items, allItems, kind, setKind, filter, setFilter, actions, expandedId, setExpandedId, accounts, categories }) => {
  const visibleItems = items.filter((item) => item.kind === kind);
  const typeLabel = kind === "expense" ? "pengeluaran" : "pemasukan";
  const selectFilter = (next) => {
    const nextItems = allItems.filter((item) => scheduleMatchesFilter(item, next));
    const currentKindAvailable = nextItems.some((item) => item.kind === kind);
    if (!currentKindAvailable) {
      const alternateKind = kind === "expense" ? "income" : "expense";
      if (nextItems.some((item) => item.kind === alternateKind)) setKind(alternateKind);
    }
    setFilter(next);
    setExpandedId(null);
  };
  return (
    <section className={styles.scheduleSection} aria-label="Daftar jadwal rutin">
      <div className={styles.sectionHeader}>
        <div>
          <h2>Jadwal periode ini</h2>
          <span>{visibleItems.length} jadwal {typeLabel}</span>
        </div>
      </div>
      <ScheduleFilters filter={filter} setFilter={selectFilter} items={allItems} />
      <ScheduleKindTabs kind={kind} setKind={(next) => { setKind(next); setExpandedId(null); }} items={items} />
      <ScheduleList
        items={visibleItems}
        emptyText={`Belum ada ${typeLabel} rutin pada status ini.`}
        actions={actions}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        accounts={accounts}
        categories={categories}
      />
    </section>
  );
};


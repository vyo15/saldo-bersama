import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiArchive,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiEdit2,
  FiMoreHorizontal,
  FiPlus,
  FiRepeat,
  FiRotateCcw,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { currentMonthInJakarta, formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { filterByAssigneeAccess, filterByOwnership } from "../../domain/ownership.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { useRecurringOccurrenceRecovery, useRecurringPaymentActions, useRecurringRuleActions } from "./useRecurringActions.js";
import styles from "./RecurringPage.module.css";

const activeAccounts = (bootstrap) => bootstrap?.accounts?.filter((item) => item.status === "active") || [];
const activeCategories = (bootstrap, kind) => bootstrap?.categories?.filter((item) => item.status === "active" && item.transaction_type === kind) || [];

const eligiblePaymentEnvelopes = (items, payment, account, user) => {
  if (payment.item?.kind !== "expense" || !account?.account_id) return [];
  const active = (items || []).filter((item) => item.status === "active"
    && payment.transaction_date >= item.period_start
    && payment.transaction_date <= item.period_end
    && (!item.source_account_id || item.source_account_id === account.account_id));
  return filterByAssigneeAccess(filterByOwnership(active, account), user);
};

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
const openStatuses = new Set(["expected", "partial", "overdue", "late", "scheduled"]);

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

const scheduleMatchesFilter = (item, filter) => {
  if (filter === "attention") return attentionStatuses.has(item.status);
  if (filter === "open") return openStatuses.has(item.status);
  if (filter === "done") return completedStatuses.has(item.status);
  if (filter === "cancelled") return item.status === "cancelled";
  return true;
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
      <div className={styles.emptyState}>
        <span><FiCalendar aria-hidden="true" /></span>
        <strong>Belum ada jadwal</strong>
        <p>{emptyText}</p>
      </div>
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

const ScheduleSummary = ({ items, onAttention }) => {
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

const SchedulePeriodSection = ({ items, allItems, kind, setKind, filter, setFilter, actions, expandedId, setExpandedId, accounts, categories }) => {
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

const FrequencyField = ({ value, onChange }) => <label className="field"><span>Frekuensi</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="biweekly">Dua mingguan</option><option value="monthly">Bulanan</option><option value="bimonthly">Dua bulanan</option><option value="quarterly">Tiga bulanan</option><option value="semiannual">Semester</option><option value="annual">Tahunan</option></select></label>;
const PaymentMethodField = ({ value, onChange }) => <label className="field"><span>Metode</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="transfer">Transfer</option><option value="cash">Tunai</option><option value="autodebit">Auto-debit</option><option value="ewallet">E-wallet</option></select></label>;
const AccountField = ({ label = "Rekening default", value, accounts, onChange }) => <label className="field"><span>{label} *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih rekening</option>{accounts.map((item) => <option value={item.account_id} key={item.account_id}>{accountDisplayLabel(item)}</option>)}</select></label>;
const CategoryField = ({ value, categories, onChange }) => <label className="field"><span>Kategori *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option value={item.category_id} key={item.category_id}>{item.name}</option>)}</select></label>;

const CreateRuleModal = ({ open, close, form, setForm, categories, accounts, createRule, createMutation, message }) => (
  <Modal open={open} onClose={close} title="Tambah jadwal rutin" footer={<><Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="create-recurring-form" loading={createMutation.busy}>Tambah jadwal</Button></>}>
    <form id="create-recurring-form" className="form-grid" onSubmit={createRule}>
      <label className="field form-grid__full"><span>Nama *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="field"><span>Jenis</span><select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value, category_id: "" }))}><option value="expense">Pengeluaran tetap</option><option value="income">Pemasukan tetap</option></select></label>
      <MoneyInput id="recurring-amount" label="Nominal perkiraan" value={form.expected_amount} onChange={(value) => setForm((current) => ({ ...current, expected_amount: value }))} required />
      <FrequencyField value={form.frequency} onChange={(frequency) => setForm((current) => ({ ...current, frequency }))} />
      <label className="field"><span>Tanggal jatuh tempo/masuk *</span><input required type="number" min="1" max="31" value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: Number(event.target.value) }))} /></label>
      <CategoryField value={form.category_id} categories={categories} onChange={(category_id) => setForm((current) => ({ ...current, category_id }))} />
      <AccountField value={form.default_account_id} accounts={accounts} onChange={(default_account_id) => setForm((current) => ({ ...current, default_account_id }))} />
      <PaymentMethodField value={form.payment_method} onChange={(payment_method) => setForm((current) => ({ ...current, payment_method }))} />
      <label className="field"><span>Tanggal mulai *</span><input required type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
      <label className="checkbox-field form-grid__full"><input type="checkbox" checked={form.auto_debit} onChange={(event) => setForm((current) => ({ ...current, auto_debit: event.target.checked }))} /><span>Penanda auto-debit. Aplikasi tidak menarik uang otomatis.</span></label>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>
);

const paymentEnvelopeHint = (status, envelopes) => {
  if (status === "loading") return "Memuat kantong aktif...";
  if (status === "error") return "Kantong tidak dapat dimuat. Aktual tetap dapat dicatat tanpa alokasi, atau muat ulang halaman sebelum memilih kantong.";
  return envelopes.length ? "" : "Tidak ada kantong aktif yang cocok.";
};

const paymentEnvelopeState = (payment, paymentEnvelopes) => {
  const selectedEnvelope = paymentEnvelopes.find((item) => item.envelope_period_id === payment.envelope_period_id) || null;
  const exceedsEnvelope = Boolean(selectedEnvelope && Number(payment.amount || 0) > Number(selectedEnvelope.remaining_amount || 0));
  return {
    selectedEnvelope,
    exceedsEnvelope,
    blockedByEnvelope: exceedsEnvelope && selectedEnvelope?.overspend_policy === "block",
    needsOverspendReason: exceedsEnvelope && selectedEnvelope?.overspend_policy === "confirm",
    allowsOverspend: exceedsEnvelope && selectedEnvelope?.overspend_policy === "allow",
  };
};

const recurringEnvelopeOptionLabel = (item) => {
  const assignee = item.assignee_user_id ? `${item.assignee_name || "Pengguna"} · ${userRoleLabel(item.assignee_role)}` : "Bersama";
  return `${item.name} · ${assignee} · sisa Rp ${Number(item.remaining_amount || 0).toLocaleString("id-ID")}`;
};

const PaymentEnvelopeField = ({ payment, setPayment, paymentEnvelopes, envelopeHint }) => <label className="field form-grid__full">
  <span>Kantong dana</span>
  <select value={payment.envelope_period_id} onChange={(event) => setPayment((current) => ({ ...current, envelope_period_id: event.target.value, overspend_reason: "" }))}>
    <option value="">Belum dialokasikan</option>
    {paymentEnvelopes.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{recurringEnvelopeOptionLabel(item)}</option>)}
  </select>
  {envelopeHint ? <small>{envelopeHint}</small> : null}
</label>;

const PaymentOverspendFields = ({ payment, setPayment, envelopeState }) => <>
  {envelopeState.blockedByEnvelope ? <div className="notice notice--warning form-grid__full" role="alert">Nominal aktual melebihi sisa kantong. Kebijakan kantong ini memblokir overspend. Kurangi nominal atau pilih kantong lain.</div> : null}
  {envelopeState.needsOverspendReason ? <label className="field form-grid__full"><span>Alasan melebihi alokasi *</span><input required maxLength="180" value={payment.overspend_reason} onChange={(event) => setPayment((current) => ({ ...current, overspend_reason: event.target.value }))} placeholder="Contoh: tagihan aktual lebih tinggi dari perkiraan" /></label> : null}
  {envelopeState.allowsOverspend ? <div className="notice notice--info form-grid__full">Nominal aktual melebihi sisa kantong. Kebijakan ini mengizinkan overspend.</div> : null}
</>;

const PaymentForm = ({ payment, setPayment, paymentState, paymentAccounts, paymentEnvelopes, envelopeStatus, envelopeState, completeOccurrence }) => {
  const accountLabel = payment.item?.kind === "income" ? "Rekening penerima" : "Rekening pembayaran";
  const showEnvelope = payment.item?.kind === "expense";
  return <form id="recurring-payment-form" className="form-grid" onSubmit={completeOccurrence}>
    <MoneyInput id="recurring-actual-amount" label="Nominal aktual" value={payment.amount} onChange={(amount) => setPayment((current) => ({ ...current, amount }))} required />
    <AccountField label={accountLabel} value={payment.account_id} accounts={paymentAccounts} onChange={(account_id) => setPayment((current) => ({ ...current, account_id, envelope_period_id: "", overspend_reason: "" }))} />
    <label className="field"><span>Tanggal aktual *</span><input required type="date" value={payment.transaction_date} onChange={(event) => setPayment((current) => ({ ...current, transaction_date: event.target.value, envelope_period_id: "", overspend_reason: "" }))} /></label>
    {showEnvelope ? <PaymentEnvelopeField payment={payment} setPayment={setPayment} paymentEnvelopes={paymentEnvelopes} envelopeHint={paymentEnvelopeHint(envelopeStatus, paymentEnvelopes)} /> : null}
    <PaymentOverspendFields payment={payment} setPayment={setPayment} envelopeState={envelopeState} />
    {paymentState.error ? <div className="notice notice--danger form-grid__full" role="alert">{paymentState.error.message}</div> : null}
  </form>;
};

const PaymentModal = ({ payment, setPayment, paymentState, paymentMutation, paymentAccounts, paymentEnvelopes, envelopeStatus, completeOccurrence }) => {
  const close = () => paymentState.status !== "submitting" && setPayment((current) => ({ ...current, item: null }));
  const envelopeState = paymentEnvelopeState(payment, paymentEnvelopes);
  const title = payment.item?.kind === "income" ? "Catat pemasukan aktual" : "Catat pembayaran aktual";
  const description = payment.item ? `${payment.item.name} · rencana ${payment.item.due_date}` : "";
  const footer = <><Button type="button" disabled={paymentState.status === "submitting"} onClick={close}>Batal</Button><Button type="submit" form="recurring-payment-form" variant="primary" loading={paymentMutation.busy} disabled={paymentState.status === "submitting" || envelopeState.blockedByEnvelope}>Simpan aktual</Button></>;
  return <Modal open={Boolean(payment.item)} onClose={close} title={title} description={description} footer={footer}>
    <PaymentForm payment={payment} setPayment={setPayment} paymentState={paymentState} paymentAccounts={paymentAccounts} paymentEnvelopes={paymentEnvelopes} envelopeStatus={envelopeStatus} envelopeState={envelopeState} completeOccurrence={completeOccurrence} />
  </Modal>;
};

const EditRuleFields = ({ editRule, setEditRule, editCategories, accounts }) => <>
  <label className="field form-grid__full"><span>Nama *</span><input required maxLength="100" value={editRule?.name || ""} onChange={(event) => setEditRule((current) => ({ ...current, name: event.target.value }))} /></label>
  <MoneyInput id="edit-recurring-amount" label="Nominal perkiraan" value={editRule?.expected_amount || ""} onChange={(expected_amount) => setEditRule((current) => ({ ...current, expected_amount }))} required />
  <FrequencyField value={editRule?.frequency || "monthly"} onChange={(frequency) => setEditRule((current) => ({ ...current, frequency }))} />
  <label className="field"><span>Tanggal jatuh tempo/masuk *</span><input required type="number" min="1" max="31" value={editRule?.due_day || 1} onChange={(event) => setEditRule((current) => ({ ...current, due_day: Number(event.target.value) }))} /></label>
  <CategoryField value={editRule?.category_id || ""} categories={editCategories} onChange={(category_id) => setEditRule((current) => ({ ...current, category_id }))} />
  <AccountField value={editRule?.default_account_id || ""} accounts={accounts} onChange={(default_account_id) => setEditRule((current) => ({ ...current, default_account_id }))} />
  <PaymentMethodField value={editRule?.payment_method || "transfer"} onChange={(payment_method) => setEditRule((current) => ({ ...current, payment_method }))} />
  <label className="field"><span>Tanggal mulai *</span><input required type="date" value={editRule?.start_date || ""} onChange={(event) => setEditRule((current) => ({ ...current, start_date: event.target.value }))} /></label>
  <label className="field"><span>Tanggal akhir</span><input type="date" value={editRule?.end_date || ""} onChange={(event) => setEditRule((current) => ({ ...current, end_date: event.target.value }))} /></label>
  <label className="checkbox-field form-grid__full"><input type="checkbox" checked={Boolean(editRule?.auto_debit)} onChange={(event) => setEditRule((current) => ({ ...current, auto_debit: event.target.checked }))} /><span>Penanda auto-debit (tidak mengubah saldo sebelum aktual disimpan)</span></label>
</>;

const EditRuleModal = ({ editRule, setEditRule, editState, saveRule, editCategories, accounts }) => <Modal open={Boolean(editRule)} onClose={() => editState.status !== "submitting" && setEditRule(null)} title="Edit jadwal rutin" description={editRule ? `${editRule.name} · berlaku untuk jadwal berikutnya.` : ""} footer={<><Button onClick={() => setEditRule(null)} disabled={editState.status === "submitting"}>Batal</Button><Button type="submit" form="edit-recurring-form" variant="primary" loading={editState.status === "submitting"}>Simpan perubahan</Button></>}><form id="edit-recurring-form" className="form-grid" onSubmit={saveRule}><EditRuleFields editRule={editRule} setEditRule={setEditRule} editCategories={editCategories} accounts={accounts} />{editState.error ? <div className="notice notice--danger form-grid__full" role="alert">{editState.error.message}</div> : null}</form></Modal>;

const RecurringConfirmations = (p) => <><ConfirmationModal open={Boolean(p.archiveRuleTarget)} title={p.archiveRuleTarget?.preview.canDeleteUnused ? "Hapus aturan rutin yang belum dipakai?" : "Arsipkan aturan rutin?"} description={p.archiveRuleTarget ? (p.archiveRuleTarget.preview.canDeleteUnused ? `${p.archiveRuleTarget.item.name} hanya memiliki jadwal masa depan hasil generate dan belum pernah dibayar, dilewati, atau terhubung transaksi.` : `${p.archiveRuleTarget.item.name} sudah memiliki histori. Aturan tidak dihapus permanen dan riwayat pembayaran tetap tersimpan.`) : ""} confirmLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan aturan"} reasonLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason acknowledgementLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Saya memahami hanya projection masa depan yang belum terealisasi yang akan dibersihkan bersama aturan ini." : ""} busy={p.editState.status === "submitting"} error={p.editState.error} onCancel={() => p.editState.status !== "submitting" && p.setArchiveRuleTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveRuleTarget ? <div className="notice notice--info">Jadwal total {p.archiveRuleTarget.preview.dependencies.occurrences} · projection masa depan yang aman diregenerate {p.archiveRuleTarget.preview.dependencies.reproducible_future_occurrences} · histori masa lalu {p.archiveRuleTarget.preview.dependencies.past_occurrences} · dilewati/dibatalkan {p.archiveRuleTarget.preview.dependencies.cancelled_occurrences} · terhubung transaksi {p.archiveRuleTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.skipTarget)} title="Lewati periode ini?" description={p.skipTarget ? `${p.skipTarget.name} untuk ${p.skipTarget.due_date} ditandai dilewati. Tidak ada transaksi dibuat dan saldo tidak berubah. Periode berikutnya tetap aktif.` : ""} confirmLabel="Lewati periode" reasonLabel="Alasan melewati periode" requireReason busy={p.skipMutation.busy} error={p.skipError} onCancel={() => !p.skipMutation.busy && p.setSkipTarget(null)} onConfirm={p.skipOccurrence} /><ConfirmationModal open={Boolean(p.restoreOccurrenceTarget)} title="Pulihkan periode yang dilewati?" description={p.restoreOccurrenceTarget ? `${p.restoreOccurrenceTarget.name} untuk ${p.restoreOccurrenceTarget.due_date} akan kembali menjadi jadwal aktif tanpa membuat transaksi.` : ""} confirmLabel="Pulihkan periode" reasonLabel="Alasan pemulihan" requireReason busy={p.restoreOccurrenceMutation.busy} error={p.restoreOccurrenceError} onCancel={() => !p.restoreOccurrenceMutation.busy && p.setRestoreOccurrenceTarget(null)} onConfirm={p.restoreSkippedOccurrence} /><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan aktual terakhir?" description={p.reverseTarget ? `${p.reverseTarget.name} · transaksi ledger terkait akan dibatalkan dan status jadwal dihitung ulang.` : ""} confirmLabel="Batalkan aktual" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reversePayment} /></>;

const useRecurringAttention = ({ attention, consumeAttention, resource, setFilter, setKind, setExpandedId, openPayment }) => {
  const attentionHandled = useRef(false);
  const attentionOccurrenceId = String(attention?.attentionOccurrenceId || "");
  useEffect(() => {
    if (attentionHandled.current || !attentionOccurrenceId || resource.status !== "ready") return;
    attentionHandled.current = true;
    const item = (resource.data?.items || []).find((candidate) => candidate.occurrence_id === attentionOccurrenceId);
    if (item) {
      setFilter(attention?.attentionType === "recurring_due" ? "open" : "attention");
      setKind(item.kind === "income" ? "income" : "expense");
      setExpandedId(item.occurrence_id);
      if (attention?.attentionAction === "payment" && item.can_pay) openPayment(item);
    }
    consumeAttention();
  }, [attention?.attentionAction, attention?.attentionType, attentionOccurrenceId, consumeAttention, openPayment, resource.data?.items, resource.status, setExpandedId, setFilter, setKind]);
  return attentionOccurrenceId;
};

const RecurringPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("expense");
  const [expandedId, setExpandedId] = useState(null);
  const resource = useApiResource("recurring.list", { period });
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const shared = { resource, refreshOverview, invalidate, notify };
  const rules = useRecurringRuleActions(shared);
  const payments = useRecurringPaymentActions(shared);
  const { openPayment } = payments;
  const recovery = useRecurringOccurrenceRecovery(shared);
  const envelopeResource = useApiResource("envelopes.list", { period }, { enabled: payments.payment.item?.kind === "expense" });
  const accounts = activeAccounts(bootstrap);
  const categories = activeCategories(bootstrap, rules.form.kind);
  const editCategories = activeCategories(bootstrap, rules.editRule?.kind);
  const paymentAccounts = filterByOwnership(accounts, payments.payment.item);
  const selectedPaymentAccount = paymentAccounts.find((item) => item.account_id === payments.payment.account_id) || null;
  const paymentEnvelopes = eligiblePaymentEnvelopes(envelopeResource.data?.items || [], payments.payment, selectedPaymentAccount, bootstrap?.user || user);
  const attentionOccurrenceId = useRecurringAttention({ attention, consumeAttention, resource, setFilter, setKind, setExpandedId, openPayment });

  if (resource.status === "loading") return <LoadingScreen label="Memuat jadwal rutin..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const allItems = resource.data?.items || [];
  const filteredItems = allItems.filter((item) => scheduleMatchesFilter(item, filter));
  const actions = { openPayment: payments.openPayment, openReverse: payments.openReverse, openSkip: recovery.openSkip, openRestore: recovery.openRestore, openRuleEditor: rules.openRuleEditor, openArchive: rules.openArchive };
  const confirmations = { archiveRuleTarget: rules.archiveRuleTarget, setArchiveRuleTarget: rules.setArchiveRuleTarget, editState: rules.editState, applyRuleLifecycle: rules.applyRuleLifecycle, skipTarget: recovery.skipTarget, setSkipTarget: recovery.setSkipTarget, skipMutation: recovery.skipMutation, skipError: recovery.skipError, skipOccurrence: recovery.skipOccurrence, restoreOccurrenceTarget: recovery.restoreOccurrenceTarget, setRestoreOccurrenceTarget: recovery.setRestoreOccurrenceTarget, restoreOccurrenceMutation: recovery.restoreOccurrenceMutation, restoreOccurrenceError: recovery.restoreOccurrenceError, restoreSkippedOccurrence: recovery.restoreSkippedOccurrence, reverseTarget: payments.reverseTarget, setReverseTarget: payments.setReverseTarget, reverseState: payments.reverseState, reversePayment: payments.reversePayment };
  const headerActions = <div className={styles.headerActions}><label className="field field--compact"><span>Periode</span><input type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setFilter("all"); setKind("expense"); setExpandedId(null); }} /></label>{user?.role === "owner" ? <Button variant="primary" icon={FiPlus} onClick={rules.openCreate}>Tambah jadwal</Button> : null}</div>;

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Jadwal rutin" actions={headerActions} />{attentionOccurrenceId ? <div className="notice notice--info attention-guidance" role="status"><strong>Selesaikan jadwal yang dipilih.</strong><span>Jika transaksi sudah terjadi, catat nominal aktual dan rekeningnya. Saldo baru berubah setelah Anda menyimpan pembayaran/penerimaan.</span></div> : null}
      <ScheduleSummary items={allItems} onAttention={() => {
        const attentionItem = allItems.find((item) => scheduleMatchesFilter(item, "attention"));
        setFilter("attention");
        if (attentionItem) setKind(attentionItem.kind === "income" ? "income" : "expense");
        setExpandedId(null);
      }} />
      <SchedulePeriodSection
        items={filteredItems}
        allItems={allItems}
        kind={kind}
        setKind={setKind}
        filter={filter}
        setFilter={setFilter}
        actions={actions}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        accounts={bootstrap?.accounts || []}
        categories={bootstrap?.categories || []}
      />
      <CreateRuleModal open={rules.createOpen} close={rules.closeCreate} form={rules.form} setForm={rules.setForm} categories={categories} accounts={accounts} createRule={rules.createRule} createMutation={rules.createMutation} message={rules.message} />
      <PaymentModal payment={payments.payment} setPayment={payments.setPayment} paymentState={payments.paymentState} paymentMutation={payments.paymentMutation} paymentAccounts={paymentAccounts} paymentEnvelopes={paymentEnvelopes} envelopeStatus={envelopeResource.status} completeOccurrence={payments.completeOccurrence} />
      <EditRuleModal editRule={rules.editRule} setEditRule={rules.setEditRule} editState={rules.editState} saveRule={rules.saveRule} editCategories={editCategories} accounts={accounts} />
      <RecurringConfirmations {...confirmations} />
    </div>
  );
};

export default RecurringPage;

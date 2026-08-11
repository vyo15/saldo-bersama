import { useMemo, useState } from "react";
import {
  FiArchive,
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
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import {
  archiveRecurringRule,
  cancelRecurringOccurrence,
  createRecurringRule,
  deleteUnusedRecurringRule,
  payRecurringOccurrence,
  previewRecurringRuleLifecycle,
  restoreRecurringOccurrence,
  reverseRecurringPayment,
  updateRecurringRule,
} from "./recurring.api.js";
import { currentMonthInJakarta, formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { filterByOwnership } from "../../domain/ownership.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import styles from "./RecurringPage.module.css";

const recurringRefreshKeys = Object.freeze(["recurring.list", "reports.monthly", "app.initialState"]);
const recurringLedgerRefreshKeys = Object.freeze(["recurring.list", "transactions.list", "accounts.list", "budgets.list", "reports.monthly", "app.initialState"]);
const initialRuleForm = () => ({ name: "", kind: "expense", expected_amount: "", due_day: 20, category_id: "", default_account_id: "", payment_method: "transfer", frequency: "monthly", start_date: todayInJakarta(), auto_debit: false });
const initialPayment = () => ({ item: null, account_id: "", amount: "", transaction_date: todayInJakarta() });
const activeAccounts = (bootstrap) => bootstrap?.accounts?.filter((item) => item.status === "active") || [];
const activeCategories = (bootstrap, kind) => bootstrap?.categories?.filter((item) => item.status === "active" && item.transaction_type === kind) || [];
const refreshRecurring = async ({ invalidate, resource, refreshOverview, keys = recurringRefreshKeys }) => { invalidate(keys); await Promise.allSettled([resource.reload(), refreshOverview()]); };

const FILTERS = Object.freeze([
  { id: "all", label: "Semua" },
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
  if (["overdue", "late", "partial"].includes(item.status)) summary.attention += 1;
  return summary;
}, { expense: 0, income: 0, completed: 0, attention: 0 });

const lookupLabel = (items, id, idKey, fallback) => items?.find((item) => item[idKey] === id)?.name || fallback;

const ScheduleActions = ({ item, actions, expanded, onToggle }) => {
  const hasManagement = item.can_reverse || item.can_cancel_occurrence || item.can_restore_occurrence || item.can_edit_rule || item.can_archive_rule;
  return (
    <div className={styles.actions}>
      <div className={styles.actionPrimary}>
        {item.can_pay ? <Button variant="primary" onClick={() => actions.openPayment(item)}>Catat aktual</Button> : null}
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
        {actual > 0 ? <small>Aktual <Money value={actual} /></small> : <small>Belum ada transaksi aktual</small>}
      </div>

      <div className={styles.metaGrid}>
        <span><FiClock aria-hidden="true" /><span><strong>{formatDateLongIndonesia(item.due_date) || item.due_date}</strong><small className={styles[due.tone]}>{due.label}</small></span></span>
        <span><FiRepeat aria-hidden="true" /><span><strong>{FREQUENCY_LABELS[item.frequency] || item.frequency}</strong><small>{PAYMENT_METHOD_LABELS[item.payment_method] || item.payment_method || "Metode belum diatur"}</small></span></span>
        <span className={styles.accountMeta}><span className={styles.accountDot} aria-hidden="true" /><span><strong>{accountLabel}</strong><small>Rekening default</small></span></span>
      </div>

      <ScheduleActions item={item} actions={actions} expanded={expanded} onToggle={onToggle} />
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

const SchedulePanel = ({ eyebrow, title, items, emptyText, ...props }) => (
  <Card className={styles.panel}>
    <div className={styles.panelHeader}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className={styles.countBadge}>{items.length}</span>
    </div>
    <ScheduleList items={items} emptyText={emptyText} {...props} />
  </Card>
);

const SchedulePanels = ({ items, actions, expandedId, setExpandedId, accounts, categories }) => {
  const expenses = items.filter((item) => item.kind === "expense");
  const income = items.filter((item) => item.kind === "income");
  const shared = { actions, expandedId, setExpandedId, accounts, categories };
  return (
    <section className={styles.panels} aria-label="Daftar jadwal rutin">
      <SchedulePanel eyebrow="Pengeluaran tetap" title="Tagihan periode ini" items={expenses} emptyText="Belum ada tagihan aktif pada filter ini." {...shared} />
      <SchedulePanel eyebrow="Pemasukan tetap" title="Penerimaan periode ini" items={income} emptyText="Belum ada pemasukan rutin pada filter ini." {...shared} />
    </section>
  );
};

const ScheduleSummary = ({ items }) => {
  const summary = recurringSummary(items);
  return (
    <section className={styles.summaryGrid} aria-label="Ringkasan jadwal rutin periode ini">
      <Card className={`${styles.summaryCard} ${styles.expenseSummary}`}>
        <span>Rencana pengeluaran</span>
        <Money value={summary.expense} />
        <small>Total tagihan pada periode terpilih</small>
      </Card>
      <Card className={`${styles.summaryCard} ${styles.incomeSummary}`}>
        <span>Rencana pemasukan</span>
        <Money value={summary.income} />
        <small>Total penerimaan pada periode terpilih</small>
      </Card>
      <Card className={styles.summaryCard}>
        <span>Sudah selesai</span>
        <strong>{summary.completed}</strong>
        <small>Sudah dibayar atau diterima</small>
      </Card>
      <Card className={`${styles.summaryCard} ${summary.attention ? styles.attentionSummary : ""}`}>
        <span>Perlu perhatian</span>
        <strong>{summary.attention}</strong>
        <small>Terlambat atau baru tercatat sebagian</small>
      </Card>
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

const FrequencyField = ({ value, onChange }) => <label className="field"><span>Frekuensi</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="biweekly">Dua mingguan</option><option value="monthly">Bulanan</option><option value="bimonthly">Dua bulanan</option><option value="quarterly">Tiga bulanan</option><option value="semiannual">Semester</option><option value="annual">Tahunan</option></select></label>;
const PaymentMethodField = ({ value, onChange }) => <label className="field"><span>Metode</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="transfer">Transfer</option><option value="cash">Tunai</option><option value="autodebit">Auto-debit</option><option value="ewallet">E-wallet</option></select></label>;
const AccountField = ({ label = "Rekening default", value, accounts, onChange }) => <label className="field"><span>{label} *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih rekening</option>{accounts.map((item) => <option value={item.account_id} key={item.account_id}>{accountDisplayLabel(item)}</option>)}</select></label>;
const CategoryField = ({ value, categories, onChange }) => <label className="field"><span>Kategori *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option value={item.category_id} key={item.category_id}>{item.name}</option>)}</select></label>;

const CreateRuleModal = ({ open, close, form, setForm, categories, accounts, createRule, createMutation, message }) => (
  <Modal open={open} onClose={close} title="Tambah jadwal rutin" description="Buat rencana tagihan atau pemasukan. Saldo baru berubah setelah transaksi aktual disimpan." footer={<><Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="create-recurring-form" loading={createMutation.busy}>Tambah jadwal</Button></>}>
    <form id="create-recurring-form" className="form-grid" onSubmit={createRule}>
      <label className="field form-grid__full"><span>Nama *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="field"><span>Jenis</span><select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value, category_id: "" }))}><option value="expense">Pengeluaran tetap</option><option value="income">Pemasukan tetap</option></select></label>
      <MoneyInput id="recurring-amount" label="Nominal perkiraan" value={form.expected_amount} onChange={(value) => setForm((current) => ({ ...current, expected_amount: value }))} required />
      <FrequencyField value={form.frequency} onChange={(frequency) => setForm((current) => ({ ...current, frequency }))} />
      <label className="field"><span>Tanggal jatuh tempo/masuk *</span><input required type="number" min="1" max="31" value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: Number(event.target.value) }))} /><small>Jadwal mingguan atau harian mengikuti tanggal mulai.</small></label>
      <CategoryField value={form.category_id} categories={categories} onChange={(category_id) => setForm((current) => ({ ...current, category_id }))} />
      <AccountField value={form.default_account_id} accounts={accounts} onChange={(default_account_id) => setForm((current) => ({ ...current, default_account_id }))} />
      <PaymentMethodField value={form.payment_method} onChange={(payment_method) => setForm((current) => ({ ...current, payment_method }))} />
      <label className="field"><span>Tanggal mulai *</span><input required type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
      <label className="checkbox-field form-grid__full"><input type="checkbox" checked={form.auto_debit} onChange={(event) => setForm((current) => ({ ...current, auto_debit: event.target.checked }))} /><span>Penanda auto-debit. Aplikasi tidak menarik uang otomatis.</span></label>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>
);

const PaymentModal = ({ payment, setPayment, paymentState, paymentMutation, paymentAccounts, completeOccurrence }) => {
  const close = () => paymentState.status !== "submitting" && setPayment((current) => ({ ...current, item: null }));
  const accountLabel = payment.item?.kind === "income" ? "Rekening penerima" : "Rekening pembayaran";
  return <Modal open={Boolean(payment.item)} onClose={close} title={payment.item?.kind === "income" ? "Catat pemasukan aktual" : "Catat pembayaran aktual"} description={payment.item ? `${payment.item.name} · rencana ${payment.item.due_date}` : ""} footer={<><Button type="button" disabled={paymentState.status === "submitting"} onClick={close}>Batal</Button><Button type="submit" form="recurring-payment-form" variant="primary" loading={paymentMutation.busy} disabled={paymentState.status === "submitting"}>Simpan aktual</Button></>}><form id="recurring-payment-form" className="form-grid" onSubmit={completeOccurrence}><MoneyInput id="recurring-actual-amount" label="Nominal aktual" value={payment.amount} onChange={(amount) => setPayment((current) => ({ ...current, amount }))} required /><AccountField label={accountLabel} value={payment.account_id} accounts={paymentAccounts} onChange={(account_id) => setPayment((current) => ({ ...current, account_id }))} /><label className="field"><span>Tanggal aktual *</span><input required type="date" value={payment.transaction_date} onChange={(event) => setPayment((current) => ({ ...current, transaction_date: event.target.value }))} /></label>{paymentState.error ? <div className="notice notice--danger form-grid__full" role="alert">{paymentState.error.message}</div> : null}</form></Modal>;
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

const EditRuleModal = ({ editRule, setEditRule, editState, saveRule, editCategories, accounts }) => <Modal open={Boolean(editRule)} onClose={() => editState.status !== "submitting" && setEditRule(null)} title="Edit aturan rutin" description={editRule ? `${editRule.name} · perubahan berlaku untuk occurrence yang dibuat berikutnya.` : ""} footer={<><Button onClick={() => setEditRule(null)} disabled={editState.status === "submitting"}>Batal</Button><Button type="submit" form="edit-recurring-form" variant="primary" loading={editState.status === "submitting"}>Simpan perubahan</Button></>}><form id="edit-recurring-form" className="form-grid" onSubmit={saveRule}><EditRuleFields editRule={editRule} setEditRule={setEditRule} editCategories={editCategories} accounts={accounts} />{editState.error ? <div className="notice notice--danger form-grid__full" role="alert">{editState.error.message}</div> : null}</form></Modal>;

const RecurringConfirmations = (p) => <><ConfirmationModal open={Boolean(p.archiveRuleTarget)} title={p.archiveRuleTarget?.preview.canDeleteUnused ? "Hapus aturan rutin yang belum dipakai?" : "Arsipkan aturan rutin?"} description={p.archiveRuleTarget ? (p.archiveRuleTarget.preview.canDeleteUnused ? `${p.archiveRuleTarget.item.name} hanya memiliki jadwal masa depan hasil generate dan belum pernah dibayar, dilewati, atau terhubung transaksi.` : `${p.archiveRuleTarget.item.name} sudah memiliki histori. Aturan tidak dihapus permanen dan riwayat pembayaran tetap tersimpan.`) : ""} confirmLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan aturan"} reasonLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason acknowledgementLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Saya memahami hanya projection masa depan yang belum terealisasi yang akan dibersihkan bersama aturan ini." : ""} busy={p.editState.status === "submitting"} error={p.editState.error} onCancel={() => p.editState.status !== "submitting" && p.setArchiveRuleTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveRuleTarget ? <div className="notice notice--info">Jadwal total {p.archiveRuleTarget.preview.dependencies.occurrences} · projection masa depan yang aman diregenerate {p.archiveRuleTarget.preview.dependencies.reproducible_future_occurrences} · histori masa lalu {p.archiveRuleTarget.preview.dependencies.past_occurrences} · dilewati/dibatalkan {p.archiveRuleTarget.preview.dependencies.cancelled_occurrences} · terhubung transaksi {p.archiveRuleTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.skipTarget)} title="Lewati periode ini?" description={p.skipTarget ? `${p.skipTarget.name} untuk ${p.skipTarget.due_date} ditandai dilewati. Tidak ada transaksi dibuat dan saldo tidak berubah. Periode berikutnya tetap aktif.` : ""} confirmLabel="Lewati periode" reasonLabel="Alasan melewati periode" requireReason busy={p.skipMutation.busy} error={p.skipError} onCancel={() => !p.skipMutation.busy && p.setSkipTarget(null)} onConfirm={p.skipOccurrence} /><ConfirmationModal open={Boolean(p.restoreOccurrenceTarget)} title="Pulihkan periode yang dilewati?" description={p.restoreOccurrenceTarget ? `${p.restoreOccurrenceTarget.name} untuk ${p.restoreOccurrenceTarget.due_date} akan kembali menjadi jadwal aktif tanpa membuat transaksi.` : ""} confirmLabel="Pulihkan periode" reasonLabel="Alasan pemulihan" requireReason busy={p.restoreOccurrenceMutation.busy} error={p.restoreOccurrenceError} onCancel={() => !p.restoreOccurrenceMutation.busy && p.setRestoreOccurrenceTarget(null)} onConfirm={p.restoreSkippedOccurrence} /><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan aktual terakhir?" description={p.reverseTarget ? `${p.reverseTarget.name} · transaksi ledger terkait akan dibatalkan dan status jadwal dihitung ulang.` : ""} confirmLabel="Batalkan aktual" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reversePayment} /></>;

const useRecurringRuleActions = (shared) => {
  const createMutation = useGuardedMutation();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(initialRuleForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [editState, setEditState] = useState({ status: "idle", error: null });
  const [archiveRuleTarget, setArchiveRuleTarget] = useState(null);
  const openCreate = () => { setMessage(null); setCreateOpen(true); };
  const closeCreate = () => { if (!createMutation.busy) setCreateOpen(false); };
  const createRule = (event) => { event.preventDefault(); setMessage(null); return createMutation.run(async () => { await createRecurringRule({ ...form, expected_amount: assertPositiveRupiah(form.expected_amount) }, {}); setForm((current) => ({ ...current, name: "", expected_amount: "" })); setCreateOpen(false); shared.notify({ message: "Jadwal rutin berhasil dibuat." }); await refreshRecurring(shared); }).catch((error) => setMessage({ type: "danger", text: error.message })); };
  const openRuleEditor = (item) => { setEditRule({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version, name: item.name, kind: item.kind, expected_amount: String(item.rule_expected_amount || ""), frequency: item.frequency, due_day: Number(item.rule_due_day || 1), category_id: item.category_id, default_account_id: item.default_account_id, payment_method: item.payment_method || "transfer", auto_debit: Boolean(item.auto_debit), start_date: item.start_date || todayInJakarta(), end_date: item.end_date || "", priority: item.priority || "normal", status: item.rule_status || "active" }); setEditState({ status: "idle", error: null }); };
  const saveRule = async (event) => { event.preventDefault(); if (!editRule) return; setEditState({ status: "submitting", error: null }); try { await updateRecurringRule({ ...editRule, expected_amount: assertPositiveRupiah(editRule.expected_amount) }, { rowVersion: editRule.row_version }); setEditRule(null); setEditState({ status: "idle", error: null }); shared.notify({ message: "Aturan rutin berhasil diperbarui." }); await refreshRecurring(shared); } catch (error) { setEditState({ status: "error", error }); } };
  const openArchive = async (item) => { setEditState({ status: "submitting", error: null }); try { const preview = await previewRecurringRuleLifecycle({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version }, { force: true }); setArchiveRuleTarget({ item, preview }); setEditState({ status: "idle", error: null }); } catch (error) { setEditState({ status: "idle", error: null }); shared.notify({ message: error.message || "Status aturan rutin gagal diperiksa.", tone: "danger", dedupeKey: "recurring:lifecycle-preview-error" }); } };
  const applyRuleLifecycle = async (reason, confirmation) => { if (!archiveRuleTarget) return; const { item, preview } = archiveRuleTarget; setEditState({ status: "submitting", error: null }); try { if (preview.canDeleteUnused) { await deleteUnusedRecurringRule({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version, reason, acknowledged: confirmation.acknowledged }, { rowVersion: item.rule_row_version }); shared.notify({ message: "Aturan rutin yang belum pernah digunakan berhasil dihapus permanen." }); } else { await archiveRecurringRule({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version, reason }, { rowVersion: item.rule_row_version }); shared.notify({ message: "Aturan rutin berhasil diarsipkan. Transaksi historis tetap tersimpan." }); } setArchiveRuleTarget(null); setEditState({ status: "idle", error: null }); await refreshRecurring(shared); } catch (error) { setEditState({ status: "error", error }); } };
  return { createMutation, message, form, setForm, createOpen, openCreate, closeCreate, editRule, setEditRule, editState, archiveRuleTarget, setArchiveRuleTarget, createRule, openRuleEditor, saveRule, applyRuleLifecycle, openArchive };
};

const useRecurringPaymentActions = (shared) => {
  const paymentMutation = useGuardedMutation();
  const [payment, setPayment] = useState(initialPayment);
  const [paymentState, setPaymentState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const openPayment = (item) => { const remaining = Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)) || item.expected_amount || ""; setPayment({ item, account_id: item.default_account_id || "", amount: String(remaining), transaction_date: todayInJakarta() }); setPaymentState({ status: "idle", error: null }); };
  const completeOccurrence = (event) => { event.preventDefault(); if (!payment.item) return; setPaymentState({ status: "submitting", error: null }); return paymentMutation.run(async () => { await payRecurringOccurrence({ occurrence_id: payment.item.occurrence_id, row_version: payment.item.row_version, account_id: payment.account_id, amount: assertPositiveRupiah(payment.amount), transaction_date: payment.transaction_date }, { rowVersion: payment.item.row_version }); setPayment(initialPayment()); setPaymentState({ status: "idle", error: null }); shared.notify({ message: "Pembayaran/penerimaan aktual berhasil dicatat ke ledger." }); await refreshRecurring({ ...shared, keys: recurringLedgerRefreshKeys }); }).catch((error) => setPaymentState({ status: "error", error })); };
  const reversePayment = async (reason) => { if (!reverseTarget) return; const transactionId = String(reverseTarget.transaction_ids || "").split(",").map((value) => value.trim()).filter(Boolean).at(-1); if (!transactionId) return; setReverseState({ status: "submitting", error: null }); try { await reverseRecurringPayment({ occurrence_id: reverseTarget.occurrence_id, transaction_id: transactionId, row_version: reverseTarget.row_version, reason }, { rowVersion: reverseTarget.row_version }); setReverseTarget(null); setReverseState({ status: "idle", error: null }); shared.notify({ message: "Pembayaran/penerimaan terakhir dibatalkan dan status jadwal dihitung ulang." }); await refreshRecurring({ ...shared, keys: recurringLedgerRefreshKeys }); } catch (error) { setReverseState({ status: "error", error }); } };
  const openReverse = (item) => { setReverseTarget(item); setReverseState({ status: "idle", error: null }); };
  return { paymentMutation, payment, setPayment, paymentState, reverseTarget, setReverseTarget, reverseState, openPayment, completeOccurrence, reversePayment, openReverse };
};

const useRecurringOccurrenceRecovery = (shared) => {
  const skipMutation = useGuardedMutation();
  const restoreOccurrenceMutation = useGuardedMutation();
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipError, setSkipError] = useState(null);
  const [restoreOccurrenceTarget, setRestoreOccurrenceTarget] = useState(null);
  const [restoreOccurrenceError, setRestoreOccurrenceError] = useState(null);
  const skipOccurrence = (reason) => { if (!skipTarget) return Promise.resolve(); setSkipError(null); return skipMutation.run(async () => { await cancelRecurringOccurrence({ occurrence_id: skipTarget.occurrence_id, row_version: skipTarget.row_version, reason }, { rowVersion: skipTarget.row_version }); setSkipTarget(null); shared.notify({ message: "Periode rutin dilewati. Ledger dan saldo tidak berubah.", tone: "info" }); await refreshRecurring({ ...shared, keys: ["recurring.list", "app.initialState"] }); }).catch(setSkipError); };
  const restoreSkippedOccurrence = (reason) => { if (!restoreOccurrenceTarget) return Promise.resolve(); setRestoreOccurrenceError(null); return restoreOccurrenceMutation.run(async () => { await restoreRecurringOccurrence({ occurrence_id: restoreOccurrenceTarget.occurrence_id, row_version: restoreOccurrenceTarget.row_version, reason }, { rowVersion: restoreOccurrenceTarget.row_version }); setRestoreOccurrenceTarget(null); shared.notify({ message: "Periode rutin berhasil dipulihkan.", tone: "info" }); await refreshRecurring({ ...shared, keys: ["recurring.list", "app.initialState"] }); }).catch(setRestoreOccurrenceError); };
  const openSkip = (item) => { setSkipTarget(item); setSkipError(null); };
  const openRestore = (item) => { setRestoreOccurrenceTarget(item); setRestoreOccurrenceError(null); };
  return { skipMutation, restoreOccurrenceMutation, skipTarget, setSkipTarget, skipError, restoreOccurrenceTarget, setRestoreOccurrenceTarget, restoreOccurrenceError, skipOccurrence, restoreSkippedOccurrence, openSkip, openRestore };
};

const RecurringPage = () => {
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const resource = useApiResource("recurring.list", { period });
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const shared = { resource, refreshOverview, invalidate, notify };
  const rules = useRecurringRuleActions(shared);
  const payments = useRecurringPaymentActions(shared);
  const recovery = useRecurringOccurrenceRecovery(shared);
  const accounts = activeAccounts(bootstrap);
  const categories = activeCategories(bootstrap, rules.form.kind);
  const editCategories = activeCategories(bootstrap, rules.editRule?.kind);
  const paymentAccounts = filterByOwnership(accounts, payments.payment.item);

  if (resource.status === "loading") return <LoadingScreen label="Memuat jadwal rutin..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const allItems = resource.data?.items || [];
  const filteredItems = allItems.filter((item) => scheduleMatchesFilter(item, filter));
  const actions = { openPayment: payments.openPayment, openReverse: payments.openReverse, openSkip: recovery.openSkip, openRestore: recovery.openRestore, openRuleEditor: rules.openRuleEditor, openArchive: rules.openArchive };
  const confirmations = { archiveRuleTarget: rules.archiveRuleTarget, setArchiveRuleTarget: rules.setArchiveRuleTarget, editState: rules.editState, applyRuleLifecycle: rules.applyRuleLifecycle, skipTarget: recovery.skipTarget, setSkipTarget: recovery.setSkipTarget, skipMutation: recovery.skipMutation, skipError: recovery.skipError, skipOccurrence: recovery.skipOccurrence, restoreOccurrenceTarget: recovery.restoreOccurrenceTarget, setRestoreOccurrenceTarget: recovery.setRestoreOccurrenceTarget, restoreOccurrenceMutation: recovery.restoreOccurrenceMutation, restoreOccurrenceError: recovery.restoreOccurrenceError, restoreSkippedOccurrence: recovery.restoreSkippedOccurrence, reverseTarget: payments.reverseTarget, setReverseTarget: payments.setReverseTarget, reverseState: payments.reverseState, reversePayment: payments.reversePayment };
  const headerActions = <div className={styles.headerActions}><label className="field field--compact"><span>Periode</span><input type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setExpandedId(null); }} /></label>{user?.role === "owner" ? <Button variant="primary" icon={FiPlus} onClick={rules.openCreate}>Tambah jadwal</Button> : null}</div>;

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Jadwal rutin" description="Pantau tagihan dan pemasukan berkala. Saldo hanya berubah setelah transaksi aktual tersimpan." actions={headerActions} />
      <ScheduleSummary items={allItems} />
      <div className={styles.controlRow}>
        <div>
          <p className="eyebrow">Kelola jadwal</p>
          <h2>Jadwal pada periode ini</h2>
          <p>Pilih status, lalu buka Kelola jadwal untuk mengubah aturan atau menangani occurrence.</p>
        </div>
        <ScheduleFilters filter={filter} setFilter={(next) => { setFilter(next); setExpandedId(null); }} items={allItems} />
      </div>
      <SchedulePanels items={filteredItems} actions={actions} expandedId={expandedId} setExpandedId={setExpandedId} accounts={bootstrap?.accounts || []} categories={bootstrap?.categories || []} />
      <div className={`notice notice--info ${styles.calendarNotice}`}>
        <FiCalendar aria-hidden="true" />
        <span><strong>Google Calendar hanya pengingat.</strong> Status dibayar atau diterima berubah setelah transaksi aktual tersimpan di ledger. Jadwal yang diarsipkan tetap memiliki histori dan dapat dipulihkan melalui menu Pemulihan.</span>
      </div>
      <CreateRuleModal open={rules.createOpen} close={rules.closeCreate} form={rules.form} setForm={rules.setForm} categories={categories} accounts={accounts} createRule={rules.createRule} createMutation={rules.createMutation} message={rules.message} />
      <PaymentModal payment={payments.payment} setPayment={payments.setPayment} paymentState={payments.paymentState} paymentMutation={payments.paymentMutation} paymentAccounts={paymentAccounts} completeOccurrence={payments.completeOccurrence} />
      <EditRuleModal editRule={rules.editRule} setEditRule={rules.setEditRule} editState={rules.editState} saveRule={rules.saveRule} editCategories={editCategories} accounts={accounts} />
      <RecurringConfirmations {...confirmations} />
    </div>
  );
};

export default RecurringPage;

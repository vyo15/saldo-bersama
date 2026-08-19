import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { BankTransferIcon, CashIcon, EwalletIcon, MoneyInIcon, MoneyOutIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import CostShareField from "../transactions/CostShareField.jsx";

const FrequencyField = ({ value, onChange }) => <label className="field"><span>Frekuensi</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="biweekly">Dua mingguan</option><option value="monthly">Bulanan</option><option value="bimonthly">Dua bulanan</option><option value="quarterly">Tiga bulanan</option><option value="semiannual">Semester</option><option value="annual">Tahunan</option></select></label>;
const RECURRING_PAYMENT_OPTIONS = Object.freeze([{ value: "transfer", label: "Transfer", icon: BankTransferIcon }, { value: "cash", label: "Tunai", icon: CashIcon }, { value: "ewallet", label: "E-wallet", icon: EwalletIcon }]);
const PaymentMethodField = ({ value, onChange }) => <VisualChoiceGroup className="form-grid__full" legend="Metode" name="recurring-payment-method" value={value} onChange={onChange} options={RECURRING_PAYMENT_OPTIONS} columns={3} compact />;
const AccountField = ({ label = "Rekening default", value, accounts, onChange }) => {
  const selected = accounts.find((item) => item.account_id === value) || null;
  return <label className="field"><span>{label} *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih rekening</option>{accounts.map((item) => <option value={item.account_id} key={item.account_id}>{accountDisplayLabel(item)} · tersedia {formatRupiah(item.available_balance ?? item.balance ?? 0)}</option>)}</select>{selected ? <small>Saldo {formatRupiah(selected.balance || 0)} · dialokasikan {formatRupiah(selected.allocated_remaining || 0)} · tersedia {formatRupiah(selected.available_balance ?? selected.balance ?? 0)}</small> : null}</label>;
};
const CategoryField = ({ value, categories, onChange }) => <label className="field"><span>Kategori *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option value={item.category_id} key={item.category_id}>{item.name}</option>)}</select></label>;

export const CreateRuleModal = ({ open, close, form, setForm, categories, accounts, createRule, createMutation, message, budgetSuggestions = {} }) => (
  <Modal open={open} onClose={close} dismissible={!createMutation.busy} title="Tambah jadwal rutin" footer={<><Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="create-recurring-form" loading={createMutation.busy}>Tambah jadwal</Button></>}>
    <form id="create-recurring-form" className="form-grid" onSubmit={createRule}>
      <label className="field form-grid__full"><span>Nama *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <VisualChoiceGroup className="form-grid__full" legend="Jenis" name="recurring-kind" value={form.kind} onChange={(kind) => setForm((current) => ({ ...current, kind, category_id: "" }))} options={[{ value: "expense", label: "Pengeluaran tetap", icon: MoneyOutIcon, tone: "expense", description: "Uang keluar rutin" }, { value: "income", label: "Pemasukan tetap", icon: MoneyInIcon, tone: "income", description: "Uang masuk rutin" }]} columns={2} />
      <MoneyInput id="recurring-amount" label="Nominal perkiraan" value={form.expected_amount} onChange={(value) => setForm((current) => ({ ...current, expected_amount: value }))} required />
      <FrequencyField value={form.frequency} onChange={(frequency) => setForm((current) => ({ ...current, frequency }))} />
      <label className="field"><span>Tanggal jatuh tempo/masuk *</span><input required type="number" min="1" max="31" value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: Number(event.target.value) }))} /></label>
      <CategoryField value={form.category_id} categories={categories} onChange={(category_id) => setForm((current) => ({ ...current, category_id, default_account_id: current.kind === "expense" && budgetSuggestions[category_id]?.account_id ? budgetSuggestions[category_id].account_id : current.default_account_id }))} />
      <AccountField value={form.default_account_id} accounts={accounts} onChange={(default_account_id) => setForm((current) => ({ ...current, default_account_id }))} />
      {form.kind === "expense" && budgetSuggestions[form.category_id]?.account_id === form.default_account_id ? <CompactNotice className="form-grid__full" tone="info">Kategori ini terhubung ke {budgetSuggestions[form.category_id].envelope_name}. Rekening sumber dipilih otomatis dari Alokasi Dana tersebut.</CompactNotice> : null}
      <PaymentMethodField value={form.payment_method} onChange={(payment_method) => setForm((current) => ({ ...current, payment_method }))} /><CompactNotice className="form-grid__full" tone="info">Saat tanggal jadwal tiba, sistem menunggu konfirmasi aktual. Saldo tidak berubah sebelum aktual disimpan.</CompactNotice>
      <label className="field"><span>Tanggal mulai *</span><input required type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>
);

const paymentEnvelopeHint = (status, envelopes) => {
  if (status === "loading") return "Memuat Alokasi Dana aktif...";
  if (status === "error") return "Alokasi Dana tidak dapat dimuat. Aktual tetap dapat dicatat tanpa Alokasi Dana, atau muat ulang halaman sebelum memilih alokasi.";
  return envelopes.length ? "" : "Tidak ada Alokasi Dana aktif yang cocok.";
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
  <span>Alokasi dana</span>
  <select value={payment.envelope_period_id} onChange={(event) => setPayment((current) => ({ ...current, envelope_period_id: event.target.value, overspend_reason: "" }))}>
    <option value="">Belum dialokasikan</option>
    {paymentEnvelopes.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{recurringEnvelopeOptionLabel(item)}</option>)}
  </select>
  {envelopeHint ? <small>{envelopeHint}</small> : null}
</label>;

const PaymentOverspendFields = ({ payment, setPayment, envelopeState }) => <>
  {envelopeState.blockedByEnvelope ? <div className="notice notice--warning form-grid__full" role="alert">Nominal aktual melebihi sisa alokasi. Kebijakan alokasi ini memblokir overspend. Kurangi nominal atau pilih alokasi lain.</div> : null}
  {envelopeState.needsOverspendReason ? <label className="field form-grid__full"><span>Alasan melebihi dana alokasi *</span><input required maxLength="180" value={payment.overspend_reason} onChange={(event) => setPayment((current) => ({ ...current, overspend_reason: event.target.value }))} placeholder="Contoh: tagihan aktual lebih tinggi dari perkiraan" /></label> : null}
  {envelopeState.allowsOverspend ? <CompactNotice tone="info" title="Melebihi dana alokasi" className="form-grid__full" role="status">Kebijakan alokasi ini mengizinkan overspend.</CompactNotice> : null}
</>;

const PaymentForm = ({ payment, setPayment, paymentState, paymentAccounts, paymentEnvelopes, envelopeStatus, envelopeState, members, completeOccurrence }) => {
  const accountLabel = payment.item?.kind === "income" ? "Rekening penerima" : "Rekening pembayaran";
  const showEnvelope = payment.item?.kind === "expense";
  return <form id="recurring-payment-form" className="form-grid" onSubmit={completeOccurrence}>
    <MoneyInput id="recurring-actual-amount" label="Nominal aktual" value={payment.amount} onChange={(amount) => setPayment((current) => ({ ...current, amount }))} required />
    <AccountField label={accountLabel} value={payment.account_id} accounts={paymentAccounts} onChange={(account_id) => setPayment((current) => ({ ...current, account_id, envelope_period_id: "", overspend_reason: "" }))} />
    <label className="field"><span>Tanggal aktual *</span><input required type="date" value={payment.transaction_date} onChange={(event) => setPayment((current) => ({ ...current, transaction_date: event.target.value, envelope_period_id: "", overspend_reason: "" }))} /></label>
    {showEnvelope ? <PaymentEnvelopeField payment={payment} setPayment={setPayment} paymentEnvelopes={paymentEnvelopes} envelopeHint={paymentEnvelopeHint(envelopeStatus, paymentEnvelopes)} /> : null}
    <CostShareField visible={showEnvelope && payment.item?.scope === "shared"} form={payment} members={members} setForm={setPayment} errors={paymentState.fieldErrors || {}} />
    <PaymentOverspendFields payment={payment} setPayment={setPayment} envelopeState={envelopeState} />
    {paymentState.error ? <div className="notice notice--danger form-grid__full" role="alert">{paymentState.error.message}</div> : null}
  </form>;
};

export const PaymentModal = ({ payment, setPayment, paymentState, paymentMutation, paymentAccounts, paymentEnvelopes, envelopeStatus, members, completeOccurrence }) => {
  const close = () => paymentState.status !== "submitting" && setPayment((current) => ({ ...current, item: null }));
  const envelopeState = paymentEnvelopeState(payment, paymentEnvelopes);
  const title = payment.item?.kind === "income" ? "Catat pemasukan aktual" : "Catat pembayaran aktual";
  const description = payment.item ? `${payment.item.name} · rencana ${payment.item.due_date}` : "";
  const footer = <><Button type="button" disabled={paymentState.status === "submitting"} onClick={close}>Batal</Button><Button type="submit" form="recurring-payment-form" variant="primary" loading={paymentMutation.busy} disabled={paymentState.status === "submitting" || envelopeState.blockedByEnvelope}>Simpan aktual</Button></>;
  return <Modal open={Boolean(payment.item)} onClose={close} dismissible={paymentState.status !== "submitting"} title={title} description={description} footer={footer}>
    <PaymentForm payment={payment} setPayment={setPayment} paymentState={paymentState} paymentAccounts={paymentAccounts} paymentEnvelopes={paymentEnvelopes} envelopeStatus={envelopeStatus} envelopeState={envelopeState} members={members} completeOccurrence={completeOccurrence} />
  </Modal>;
};

const EditRuleIdentityFields = ({ editRule, setEditRule }) => <>
  <label className="field form-grid__full"><span>Nama *</span><input required maxLength="100" value={editRule?.name || ""} onChange={(event) => setEditRule((current) => ({ ...current, name: event.target.value }))} /></label>
  <MoneyInput id="edit-recurring-amount" label="Nominal perkiraan" value={editRule?.expected_amount || ""} onChange={(expected_amount) => setEditRule((current) => ({ ...current, expected_amount }))} required />
  <FrequencyField value={editRule?.frequency || "monthly"} onChange={(frequency) => setEditRule((current) => ({ ...current, frequency }))} />
  <label className="field"><span>Tanggal jatuh tempo/masuk *</span><input required type="number" min="1" max="31" value={editRule?.due_day || 1} onChange={(event) => setEditRule((current) => ({ ...current, due_day: Number(event.target.value) }))} /></label>
</>;

const EditRulePlanningFields = ({ editRule, setEditRule, editCategories, accounts, budgetSuggestions }) => {
  const linkedBudget = budgetSuggestions[editRule?.category_id] || null;
  const followsLinkedAccount = editRule?.kind === "expense" && linkedBudget?.account_id === editRule?.default_account_id;
  const changeCategory = (category_id) => setEditRule((current) => ({
    ...current,
    category_id,
    default_account_id: current?.kind === "expense" && budgetSuggestions[category_id]?.account_id
      ? budgetSuggestions[category_id].account_id
      : current?.default_account_id,
  }));
  return <>
    <CategoryField value={editRule?.category_id || ""} categories={editCategories} onChange={changeCategory} />
    <AccountField value={editRule?.default_account_id || ""} accounts={accounts} onChange={(default_account_id) => setEditRule((current) => ({ ...current, default_account_id }))} />
    {followsLinkedAccount ? <CompactNotice className="form-grid__full" tone="info">Kategori ini terhubung ke {linkedBudget.envelope_name}. Rekening sumber mengikuti Alokasi Dana terkait.</CompactNotice> : null}
    <PaymentMethodField value={editRule?.payment_method || "transfer"} onChange={(payment_method) => setEditRule((current) => ({ ...current, payment_method }))} />
  </>;
};

const EditRuleDateFields = ({ editRule, setEditRule }) => <>
  <CompactNotice className="form-grid__full" tone="info">Saat tanggal jadwal tiba, sistem menunggu konfirmasi aktual. Saldo tidak berubah sebelum aktual disimpan.</CompactNotice>
  <label className="field"><span>Tanggal mulai *</span><input required type="date" value={editRule?.start_date || ""} onChange={(event) => setEditRule((current) => ({ ...current, start_date: event.target.value }))} /></label>
  <label className="field"><span>Tanggal akhir</span><input type="date" value={editRule?.end_date || ""} onChange={(event) => setEditRule((current) => ({ ...current, end_date: event.target.value }))} /></label>
</>;

const EditRuleFields = (props) => <>
  <EditRuleIdentityFields editRule={props.editRule} setEditRule={props.setEditRule} />
  <EditRulePlanningFields editRule={props.editRule} setEditRule={props.setEditRule} editCategories={props.editCategories} accounts={props.accounts} budgetSuggestions={props.budgetSuggestions} />
  <EditRuleDateFields editRule={props.editRule} setEditRule={props.setEditRule} />
</>;

export const EditRuleModal = ({ editRule, setEditRule, editState, saveRule, editCategories, accounts, budgetSuggestions = {} }) => <Modal open={Boolean(editRule)} onClose={() => setEditRule(null)} dismissible={editState.status !== "submitting"} title="Edit jadwal rutin" description={editRule ? `${editRule.name} · berlaku untuk jadwal berikutnya.` : ""} footer={<><Button onClick={() => setEditRule(null)} disabled={editState.status === "submitting"}>Batal</Button><Button type="submit" form="edit-recurring-form" variant="primary" loading={editState.status === "submitting"}>Simpan perubahan</Button></>}><form id="edit-recurring-form" className="form-grid" onSubmit={saveRule}><EditRuleFields editRule={editRule} setEditRule={setEditRule} editCategories={editCategories} accounts={accounts} budgetSuggestions={budgetSuggestions} />{editState.error ? <div className="notice notice--danger form-grid__full" role="alert">{editState.error.message}</div> : null}</form></Modal>;

export const RecurringConfirmations = (p) => <><ConfirmationModal open={Boolean(p.archiveRuleTarget)} title={p.archiveRuleTarget?.preview.canDeleteUnused ? "Hapus aturan rutin yang belum dipakai?" : "Arsipkan aturan rutin?"} description={p.archiveRuleTarget ? (p.archiveRuleTarget.preview.canDeleteUnused ? `${p.archiveRuleTarget.item.name} hanya memiliki jadwal masa depan yang dibuat otomatis dan belum pernah dibayar, dilewati, atau terhubung transaksi.` : `${p.archiveRuleTarget.item.name} sudah memiliki riwayat. Aturan tidak dihapus permanen dan riwayat pembayaran tetap tersimpan.`) : ""} confirmLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan aturan"} reasonLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason acknowledgementLabel={p.archiveRuleTarget?.preview.canDeleteUnused ? "Saya memahami hanya jadwal masa depan yang belum terealisasi yang akan dibersihkan bersama aturan ini." : ""} busy={p.editState.status === "submitting"} error={p.editState.error} onCancel={() => p.editState.status !== "submitting" && p.setArchiveRuleTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveRuleTarget ? <div className="notice notice--info">Jadwal total {p.archiveRuleTarget.preview.dependencies.occurrences} · jadwal masa depan yang aman dibuat ulang {p.archiveRuleTarget.preview.dependencies.reproducible_future_occurrences} · riwayat masa lalu {p.archiveRuleTarget.preview.dependencies.past_occurrences} · dilewati/dibatalkan {p.archiveRuleTarget.preview.dependencies.cancelled_occurrences} · terhubung transaksi {p.archiveRuleTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.skipTarget)} title="Lewati periode ini?" description={p.skipTarget ? `${p.skipTarget.name} untuk ${p.skipTarget.due_date} ditandai dilewati. Tidak ada transaksi dibuat dan saldo tidak berubah. Periode berikutnya tetap aktif.` : ""} confirmLabel="Lewati periode" reasonLabel="Alasan melewati periode" requireReason busy={p.skipMutation.busy} error={p.skipError} onCancel={() => !p.skipMutation.busy && p.setSkipTarget(null)} onConfirm={p.skipOccurrence} /><ConfirmationModal open={Boolean(p.restoreOccurrenceTarget)} title="Pulihkan periode yang dilewati?" description={p.restoreOccurrenceTarget ? `${p.restoreOccurrenceTarget.name} untuk ${p.restoreOccurrenceTarget.due_date} akan kembali menjadi jadwal aktif tanpa membuat transaksi.` : ""} confirmLabel="Pulihkan periode" reasonLabel="Alasan pemulihan" requireReason busy={p.restoreOccurrenceMutation.busy} error={p.restoreOccurrenceError} onCancel={() => !p.restoreOccurrenceMutation.busy && p.setRestoreOccurrenceTarget(null)} onConfirm={p.restoreSkippedOccurrence} /><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan aktual terakhir?" description={p.reverseTarget ? `${p.reverseTarget.name} · transaksi terkait akan dibatalkan dan status jadwal dihitung ulang.` : ""} confirmLabel="Batalkan aktual" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reversePayment} /></>;


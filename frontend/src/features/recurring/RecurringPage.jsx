import { useState } from "react";
import { FiCalendar, FiCheckCircle, FiPlus, FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { apiClient } from "../../services/api/client.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { todayInJakarta } from "../../domain/dates.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const today = todayInJakarta;

const RecurringPage = () => {
  const resource = useApiResource("recurring.list");
  const { bootstrap, refresh } = useFinance();
  const { user } = useAuth();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ name: "", kind: "expense", expected_amount: "", due_day: 20, category_id: "", default_account_id: "", payment_method: "transfer", frequency: "monthly", start_date: today(), auto_debit: false });
  const [payment, setPayment] = useState({ item: null, account_id: "", amount: "", transaction_date: today() });
  const [paymentState, setPaymentState] = useState({ status: "idle", error: null });

  const accounts = bootstrap?.accounts?.filter((item) => item.status === "active") || [];
  const categories = bootstrap?.categories?.filter((item) => item.status === "active" && item.transaction_type === form.kind) || [];

  const createRule = async (event) => {
    event.preventDefault();
    setMessage(null);
    try {
      await apiClient.request("recurring.createRule", { ...form, expected_amount: assertPositiveRupiah(form.expected_amount) }, { idempotencyKey: createIdempotencyKey() });
      setForm((current) => ({ ...current, name: "", expected_amount: "" }));
      setMessage({ type: "success", text: "Jadwal rutin berhasil dibuat." });
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const openPayment = (item) => {
    setPayment({ item, account_id: item.default_account_id || "", amount: String(Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)) || item.expected_amount || ""), transaction_date: today() });
    setPaymentState({ status: "idle", error: null });
  };

  const reversePayment = async (item) => {
    const transactionIds = String(item.transaction_ids || "").split(",").map((value) => value.trim()).filter(Boolean);
    const transactionId = transactionIds.at(-1);
    if (!transactionId) return;
    const reason = window.prompt("Alasan pembatalan pembayaran/penerimaan (wajib):");
    if (!reason?.trim()) return;
    try {
      await apiClient.request("recurring.reversePayment", { occurrence_id: item.occurrence_id, transaction_id: transactionId, row_version: item.row_version, reason: reason.trim() }, { rowVersion: item.row_version, idempotencyKey: createIdempotencyKey() });
      setMessage({ type: "success", text: "Pembayaran/penerimaan terakhir dibatalkan dan status jadwal dihitung ulang." });
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const completeOccurrence = async (event) => {
    event.preventDefault();
    if (!payment.item) return;
    setPaymentState({ status: "submitting", error: null });
    try {
      await apiClient.request("recurring.payOccurrence", {
        occurrence_id: payment.item.occurrence_id,
        row_version: payment.item.row_version,
        account_id: payment.account_id,
        amount: assertPositiveRupiah(payment.amount),
        transaction_date: payment.transaction_date,
      }, { rowVersion: payment.item.row_version, idempotencyKey: createIdempotencyKey() });
      setPayment({ item: null, account_id: "", amount: "", transaction_date: today() });
      setPaymentState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Pembayaran/penerimaan aktual berhasil dicatat ke ledger." });
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) { setPaymentState({ status: "error", error }); }
  };

  if (resource.status === "loading") return <LoadingScreen label="Memuat tagihan dan pemasukan rutin..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const items = resource.data?.items || [];
  const expenses = items.filter((item) => item.kind === "expense");
  const income = items.filter((item) => item.kind === "income");

  const renderItems = (list) => list.map((item) => (
    <article className="schedule-item" key={item.occurrence_id}>
      <div className="schedule-item__date"><FiCalendar /><time>{item.due_date}</time></div>
      <div><h3>{item.name}</h3><p>Rencana <Money value={item.expected_amount} />{item.actual_amount ? <> · aktual <Money value={item.actual_amount} /></> : null}</p></div>
      <StatusBadge status={item.status} />
      <div className="button-group">
        {item.status === "paid" || item.status === "received" ? <FiCheckCircle className="schedule-item__done" aria-label="Selesai" /> : <Button onClick={() => openPayment(item)}>Catat aktual</Button>}
        {item.transaction_ids ? <Button icon={FiRotateCcw} onClick={() => reversePayment(item)}>Batalkan aktual terakhir</Button> : null}
      </div>
    </article>
  ));

  return (
    <div className="page-stack">
      <PageHeader title="Tagihan & jadwal" description="Rencana kewajiban dan pemasukan dipisahkan dari transaksi aktual agar statusnya dapat diverifikasi." />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="two-column-grid">
        <Card className="panel"><div className="panel__header"><div><p className="eyebrow">Pengeluaran tetap</p><h2>Tagihan periode ini</h2></div></div><div className="schedule-list">{renderItems(expenses)}</div></Card>
        <Card className="panel"><div className="panel__header"><div><p className="eyebrow">Pemasukan tetap</p><h2>Penerimaan yang diharapkan</h2></div></div><div className="schedule-list">{renderItems(income)}</div></Card>
      </section>

      {user?.role === "owner" ? (
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Aturan rutin</p><h2>Tambah tagihan atau pemasukan tetap</h2></div></div>
          <form className="form-grid" onSubmit={createRule}>
            <label className="field form-grid__full"><span>Nama *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Jenis</span><select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value, category_id: "" }))}><option value="expense">Pengeluaran tetap</option><option value="income">Pemasukan tetap</option></select></label>
            <MoneyInput id="recurring-amount" label="Nominal perkiraan" value={form.expected_amount} onChange={(value) => setForm((current) => ({ ...current, expected_amount: value }))} />
            <label className="field"><span>Frekuensi</span><select value={form.frequency} onChange={(event) => setForm((current) => ({ ...current, frequency: event.target.value }))}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="biweekly">Dua mingguan</option><option value="monthly">Bulanan</option><option value="bimonthly">Dua bulanan</option><option value="quarterly">Tiga bulanan</option><option value="semiannual">Semester</option><option value="annual">Tahunan</option></select></label>
            <label className="field"><span>Tanggal jatuh tempo/masuk</span><input type="number" min="1" max="31" value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: Number(event.target.value) }))} /><small>Untuk jadwal mingguan/harian, pola mengikuti tanggal mulai.</small></label>
            <label className="field"><span>Kategori</span><select required value={form.category_id} onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}><option value="">Pilih kategori</option>{categories.map((item) => <option value={item.category_id} key={item.category_id}>{item.name}</option>)}</select></label>
            <label className="field"><span>Rekening default</span><select required value={form.default_account_id} onChange={(event) => setForm((current) => ({ ...current, default_account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((item) => <option value={item.account_id} key={item.account_id}>{item.name}</option>)}</select></label>
            <label className="field"><span>Metode</span><select value={form.payment_method} onChange={(event) => setForm((current) => ({ ...current, payment_method: event.target.value }))}><option value="transfer">Transfer</option><option value="cash">Tunai</option><option value="autodebit">Auto-debit</option><option value="ewallet">E-wallet</option></select></label>
            <label className="field"><span>Tanggal mulai</span><input required type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
            <label className="checkbox-field form-grid__full"><input type="checkbox" checked={form.auto_debit} onChange={(event) => setForm((current) => ({ ...current, auto_debit: event.target.checked }))} /><span>Biasanya dibayar otomatis (hanya penanda, aplikasi tidak menarik uang)</span></label>
            <div className="form-grid__full form-actions"><Button variant="primary" icon={FiPlus} type="submit">Tambah jadwal</Button></div>
          </form>
        </Card>
      ) : null}

      <div className="notice notice--info"><strong>Google Calendar adalah pengingat.</strong><span>Status dibayar atau diterima hanya berubah setelah transaksi aktual tersimpan di ledger.</span></div>

      <Modal
        open={Boolean(payment.item)}
        onClose={() => paymentState.status !== "submitting" && setPayment((current) => ({ ...current, item: null }))}
        title={payment.item?.kind === "income" ? "Catat pemasukan aktual" : "Catat pembayaran aktual"}
        description={payment.item ? `${payment.item.name} · rencana ${payment.item.due_date}` : ""}
        footer={<><Button type="button" disabled={paymentState.status === "submitting"} onClick={() => setPayment((current) => ({ ...current, item: null }))}>Batal</Button><Button type="submit" form="recurring-payment-form" variant="primary" disabled={paymentState.status === "submitting"}>{paymentState.status === "submitting" ? "Menyimpan..." : "Simpan aktual"}</Button></>}
      >
        <form id="recurring-payment-form" className="form-grid" onSubmit={completeOccurrence}>
          <MoneyInput id="recurring-actual-amount" label="Nominal aktual" value={payment.amount} onChange={(value) => setPayment((current) => ({ ...current, amount: value }))} />
          <label className="field"><span>{payment.item?.kind === "income" ? "Rekening penerima" : "Rekening pembayaran"} *</span><select required value={payment.account_id} onChange={(event) => setPayment((current) => ({ ...current, account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}</select></label>
          <label className="field"><span>Tanggal aktual *</span><input required type="date" value={payment.transaction_date} onChange={(event) => setPayment((current) => ({ ...current, transaction_date: event.target.value }))} /></label>
          {paymentState.error ? <div className="notice notice--danger form-grid__full" role="alert">{paymentState.error.message}</div> : null}
        </form>
      </Modal>
    </div>
  );
};

export default RecurringPage;

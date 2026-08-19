import { useEffect, useMemo, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";

const initialForm = () => ({ sourceAccountId: "", envelopePeriodId: "", amount: "", reason: "" });
const availableBalance = (account) => Number(account?.available_balance ?? account?.balance ?? 0);
const fundingAccounts = (accounts, items) => accounts.filter((account) => availableBalance(account) > 0 && items.some((item) => item.source_account_id === account.account_id));
const matchingEnvelopes = (items, sourceAccountId) => items.filter((item) => item.source_account_id === sourceAccountId);
const initialFundingForm = ({ accounts, items, requestedAccountId, suggestedAmount }) => {
  const requested = accounts.find((item) => item.account_id === requestedAccountId)?.account_id || "";
  const sourceAccountId = requested || (accounts.length === 1 ? accounts[0].account_id : "");
  const envelopes = matchingEnvelopes(items, sourceAccountId);
  return { sourceAccountId, envelopePeriodId: envelopes.length === 1 ? envelopes[0].envelope_period_id : "", amount: suggestedAmount > 0 ? String(suggestedAmount) : "", reason: "" };
};

const FundingFields = ({ accounts, envelopes, selectedAccount, form, setForm, changeSource, available, invalidAmount, amountNumber }) => {
  if (!accounts.length) return <div className="notice notice--info form-grid__full" role="status">Belum ada kombinasi rekening dengan dana tersedia dan Alokasi Dana aktif yang dapat ditambah. Buat Alokasi Dana atau periksa rekening sumber terlebih dahulu.</div>;
  return <>
    <label className="field form-grid__full"><span>Dari rekening *</span><select required value={form.sourceAccountId} onChange={(event) => changeSource(event.target.value)}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)} · tersedia {formatRupiah(availableBalance(account))}</option>)}</select></label>
    <label className="field form-grid__full"><span>Ke Alokasi Dana *</span><select required value={form.envelopePeriodId} onChange={(event) => setForm((current) => ({ ...current, envelopePeriodId: event.target.value }))}><option value="">Pilih Alokasi Dana</option>{envelopes.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{item.name} · sisa {formatRupiah(item.remaining_amount || 0)}</option>)}</select></label>
    <MoneyInput id="funding-flow-amount" label="Nominal" required value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
    {selectedAccount ? <div className={`notice ${invalidAmount && amountNumber > 0 ? "notice--warning" : "notice--info"} form-grid__full`} role="status">Dana tersedia {accountDisplayLabel(selectedAccount)}: {formatRupiah(available)}{invalidAmount && amountNumber > available ? ". Nominal melebihi dana tersedia." : "."}</div> : null}
    <label className="field form-grid__full"><span>Catatan</span><input maxLength="180" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: bagi pemasukan bulan ini" /></label>
  </>;
};

const AllocationFundingFlow = ({ open, accounts, items, initialSourceAccountId = "", suggestedAmount = 0, busy = false, error = null, onClose, onSubmit }) => {
  const [form, setForm] = useState(initialForm);
  const eligibleAccounts = useMemo(() => fundingAccounts(accounts, items), [accounts, items]);
  const selectedAccount = eligibleAccounts.find((item) => item.account_id === form.sourceAccountId) || null;
  const envelopes = useMemo(() => matchingEnvelopes(items, form.sourceAccountId), [form.sourceAccountId, items]);

  useEffect(() => {
    if (!open) return;
    setForm(initialFundingForm({ accounts: eligibleAccounts, items, requestedAccountId: initialSourceAccountId, suggestedAmount }));
  }, [eligibleAccounts, initialSourceAccountId, items, open, suggestedAmount]);

  const changeSource = (sourceAccountId) => {
    const matching = matchingEnvelopes(items, sourceAccountId);
    setForm((current) => ({ ...current, sourceAccountId, envelopePeriodId: matching.length === 1 ? matching[0].envelope_period_id : "" }));
  };
  const target = envelopes.find((item) => item.envelope_period_id === form.envelopePeriodId) || null;
  const available = availableBalance(selectedAccount);
  const amountNumber = Number(String(form.amount || "").replace(/\D/g, "")) || 0;
  const invalidAmount = amountNumber <= 0 || amountNumber > available;
  const submit = (event) => { event.preventDefault(); if (target && !invalidAmount && !busy) onSubmit?.({ target, amount: form.amount, reason: form.reason }); };

  return <Modal open={open} onClose={onClose} dismissible={!busy} title="Bagi dana tersedia" description="Pilih rekening dan Alokasi Dana. Pembagian ini tidak mengubah saldo rekening." size="sm" footer={<><Button type="button" disabled={busy} onClick={onClose}>Batal</Button><Button type="submit" form="allocation-funding-form" variant="primary" loading={busy} disabled={!target || invalidAmount || busy}>Tambahkan</Button></>}>
    <form id="allocation-funding-form" className="form-grid" onSubmit={submit}>
      <FundingFields accounts={eligibleAccounts} envelopes={envelopes} selectedAccount={selectedAccount} form={form} setForm={setForm} changeSource={changeSource} available={available} invalidAmount={invalidAmount} amountNumber={amountNumber} />
      {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
    </form>
  </Modal>;
};

export default AllocationFundingFlow;
